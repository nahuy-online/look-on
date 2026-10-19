//! YouTube player-response parsing & stream selection.
//!
//! Adapted from Obereg's `obereg-core/src/extract.rs` (in `/tmp/obereg`).
//! The parsing logic is kept as pure functions so it can be unit-tested
//! without network access; the network calls live in `client.rs`.
//!
//! InnerTube player response shape (only the bits we touch):
//! ```text
//! {
//!   "playabilityStatus": { "status": "OK", "reason": "..." (optional) },
//!   "streamingData": {
//!     "formats": [ ...muxed streams... ],
//!     "adaptiveFormats": [ ...separate video/audio streams... ]
//!   }
//! }
//! ```
//!
//! `formats` carries streams where video and audio are already combined
//! (rare on modern YouTube — usually only up to 720p); `adaptiveFormats`
//! carries separate video-only and audio-only streams that need to be
//! played in parallel by the player (MediaSource + SourceBuffer, or a
//! native muxer).

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// One available stream from the YouTube player response.
///
/// Field names are camelCase over the FFI boundary so the TypeScript types
/// in `native/src/lib/types.ts` can map directly (`mimeType`, `qualityLabel`,
/// `hasAudio`, `hasVideo`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamFormat {
    /// YouTube's itag identifier for this format (e.g. 18 = 360p mp4 muxed).
    pub itag: i64,
    /// MIME type with codecs (e.g. `video/mp4; codecs="avc1.42c01e, mp4a.40.2"`).
    pub mime_type: String,
    /// Stream URL on `googlevideo.com`. Empty for DRM-protected streams.
    pub url: String,
    /// Quality label as shown by YouTube ("720p", "medium", "tiny").
    pub quality_label: Option<String>,
    /// Bitrate in bits per second.
    pub bitrate: i64,
    /// Whether this stream carries audio.
    pub has_audio: bool,
    /// Whether this stream carries video.
    pub has_video: bool,
}

impl StreamFormat {
    /// Frame height parsed from the quality label ("720p" → 720, "medium" → 0).
    pub fn height(&self) -> u32 {
        self.quality_label
            .as_deref()
            .and_then(|label| {
                let digits: String =
                    label.chars().take_while(|c| c.is_ascii_digit()).collect();
                digits.parse::<u32>().ok()
            })
            .unwrap_or(0)
    }

    /// Stream is ready to play as-is: video + audio are combined.
    pub fn is_muxed(&self) -> bool {
        self.has_audio && self.has_video
    }
}

/// Outcome of parsing a player response. Serialised as a tagged JSON enum
/// (`{ "status": "success", ... }`) so the frontend can pattern-match on
/// `status`. The variant tag is snake_case (matching Obereg's wire format
/// so any future Kotlin/Rust interop stays consistent); fields inside each
/// variant are camelCase.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ExtractOutcome {
    /// A stream ready to hand to the player (audio + video combined).
    #[serde(rename_all = "camelCase")]
    Success {
        /// The selected stream.
        format: StreamFormat,
        /// How many streams were in the response in total (muxed + adaptive).
        total: usize,
    },
    /// Parsed but no usable stream: only adaptive, no audio track.
    #[serde(rename_all = "camelCase")]
    NoMuxedStream {
        /// How many adaptive streams were in the response.
        adaptive: usize,
    },
    /// Service returned separate video-only + audio-only streams — the player
    /// should play them together (MediaSource or native muxer).
    #[serde(rename_all = "camelCase")]
    SeparateStreams {
        /// Video-only stream (highest resolution within `DEFAULT_MAX_HEIGHT`).
        video: StreamFormat,
        /// Audio-only stream (highest bitrate).
        audio: StreamFormat,
        /// How many streams were in the response in total.
        total: usize,
    },
    /// Service refused (region, age, private, removed, ...).
    Refused {
        /// Reason given by the service.
        reason: String,
    },
    /// Couldn't parse the response: new format, truncated, etc.
    Malformed {
        /// What specifically failed.
        reason: String,
    },
}

/// Maximum frame height we pick without separate-stream merging. Above this
/// we still try, but the muxed path is preferred for compatibility with the
/// `<video>` tag (which can't demux adaptive streams without MSE).
pub const DEFAULT_MAX_HEIGHT: u32 = 720;

/// Parse the `formats` or `adaptiveFormats` array from the player response.
///
/// Returns an empty vec if the array is absent (some responses only have one
/// of the two). Returns an error only if the field is present but isn't an
/// array (which would indicate a broken response).
pub fn parse_formats(array: Option<&Value>) -> Result<Vec<StreamFormat>, String> {
    let Some(array) = array else {
        return Ok(Vec::new());
    };
    let items = array
        .as_array()
        .ok_or_else(|| "streamingData: expected an array".to_string())?;

    let mut formats = Vec::with_capacity(items.len());
    for item in items {
        let url = item
            .get("url")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if url.is_empty() {
            // No URL = useless (DRM-protected, or signature-ciphered in a way
            // we don't yet handle).
            continue;
        }
        let mime_type = item
            .get("mimeType")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();

        // How we detect audio/video tracks:
        // * Container `audio/*` → audio-only (some audio streams have a
        //   qualityLabel of "tiny" that would otherwise look like video).
        // * Muxed streams expose their audio via the codec in the MIME
        //   (`codecs="avc1..., mp4a..."`); `audioQuality` isn't always
        //   present so we treat the codec as the primary signal.
        // * `audioQuality` is a backup signal in case the MIME is incomplete.
        let audio_container = mime_type.starts_with("audio/");
        let audio_codec = mime_type.contains("mp4a")
            || mime_type.contains("opus")
            || mime_type.contains("vorbis")
            || mime_type.contains("ac-3")
            || mime_type.contains("ec-3");
        let has_audio = audio_container || audio_codec || item.get("audioQuality").is_some();
        let has_video = !audio_container && mime_type.contains("video/");

        formats.push(StreamFormat {
            itag: item.get("itag").and_then(Value::as_i64).unwrap_or(0),
            mime_type,
            url: url.to_string(),
            quality_label: item
                .get("qualityLabel")
                .and_then(Value::as_str)
                .map(str::to_string),
            bitrate: item.get("bitrate").and_then(Value::as_i64).unwrap_or(0),
            has_audio,
            has_video,
        });
    }
    Ok(formats)
}

/// Select the best muxed stream (video + audio already combined).
///
/// Prefers MP4 muxed streams (broad codec support); within those, prefers
/// the highest resolution up to `max_height`. If no MP4 muxed stream is
/// available, falls back to any muxed stream by bitrate.
pub fn select_muxed(formats: &[StreamFormat], max_height: u32) -> Option<StreamFormat> {
    let mp4: Vec<&StreamFormat> = formats
        .iter()
        .filter(|f| f.is_muxed() && f.mime_type.contains("video/mp4"))
        .collect();
    if mp4.is_empty() {
        return formats
            .iter()
            .filter(|f| f.is_muxed())
            .max_by_key(|f| f.bitrate)
            .cloned();
    }
    let within_limit: Vec<&&StreamFormat> = mp4
        .iter()
        .filter(|f| f.height() > 0 && f.height() <= max_height)
        .collect();
    let pool: Vec<&&StreamFormat> = if within_limit.is_empty() {
        mp4.iter().collect()
    } else {
        within_limit
    };
    pool.into_iter()
        .max_by_key(|f| (f.height(), f.bitrate))
        .map(|f| (*f).clone())
}

/// Select a video-only + audio-only pair for parallel playback.
///
/// Used when the service doesn't ship a muxed stream. The player plays both
/// at once, so no external muxer is required.
pub fn select_adaptive_pair(
    formats: &[StreamFormat],
    max_height: u32,
) -> Option<(StreamFormat, StreamFormat)> {
    let video_only = |f: &&StreamFormat| {
        f.has_video && !f.has_audio && f.mime_type.contains("video/")
    };
    let video = formats
        .iter()
        .filter(video_only)
        .filter(|f| f.height() > 0 && f.height() <= max_height)
        .max_by_key(|f| (f.height(), f.bitrate))
        .or_else(|| {
            formats
                .iter()
                .filter(video_only)
                .max_by_key(|f| (f.height(), f.bitrate))
        })?;

    let audio = formats
        .iter()
        .filter(|f| f.has_audio && !f.has_video)
        .max_by_key(|f| f.bitrate)?;

    Some((video.clone(), audio.clone()))
}

/// Parse the full player response and decide what to play.
///
/// This is the main entry point — given the raw JSON returned by the
/// InnerTube `/player` endpoint, returns one of:
/// * `Success` — a muxed stream is available, play it directly.
/// * `SeparateStreams` — only adaptive streams are available, play video +
///   audio in parallel.
/// * `NoMuxedStream` — only adaptive streams but no usable audio track.
/// * `Refused` — the service refused (region, age, ...).
/// * `Malformed` — couldn't parse the response.
pub fn analyze_player_response(json: &str) -> ExtractOutcome {
    let root: Value = match serde_json::from_str(json) {
        Ok(v) => v,
        Err(e) => {
            return ExtractOutcome::Malformed {
                reason: format!("invalid JSON: {e}"),
            }
        }
    };

    if let Some(status) = root.get("playabilityStatus") {
        let state = status
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("OK");
        if state != "OK" {
            let reason = status
                .get("reason")
                .and_then(Value::as_str)
                .unwrap_or(state)
                .to_string();
            return ExtractOutcome::Refused { reason };
        }
    }

    let Some(streaming) = root.get("streamingData") else {
        return ExtractOutcome::Malformed {
            reason: "response has no streamingData block".into(),
        };
    };

    let muxed = match parse_formats(streaming.get("formats")) {
        Ok(f) => f,
        Err(e) => {
            return ExtractOutcome::Malformed { reason: e };
        }
    };
    let adaptive = parse_formats(streaming.get("adaptiveFormats")).unwrap_or_default();

    match select_muxed(&muxed, DEFAULT_MAX_HEIGHT) {
        Some(format) => ExtractOutcome::Success {
            format,
            total: muxed.len() + adaptive.len(),
        },
        None => match select_adaptive_pair(&adaptive, DEFAULT_MAX_HEIGHT) {
            Some((video, audio)) => ExtractOutcome::SeparateStreams {
                video,
                audio,
                total: muxed.len() + adaptive.len(),
            },
            None => ExtractOutcome::NoMuxedStream {
                adaptive: adaptive.len(),
            },
        },
    }
}

/// Serialise an [`ExtractOutcome`] for handoff across the FFI boundary.
///
/// Convenience wrapper around `serde_json::to_string` that never panics —
/// if serialisation fails (it shouldn't, since the types are plain data),
/// returns a minimal `{"status":"malformed"}` payload so the caller still
/// gets valid JSON.
pub fn outcome_to_json(outcome: &ExtractOutcome) -> String {
    serde_json::to_string(outcome)
        .unwrap_or_else(|_| "{\"status\":\"malformed\"}".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_when_playability_not_ok() {
        let json = r#"{"playabilityStatus":{"status":"UNPLAYABLE","reason":"removed"}}"#;
        let out = analyze_player_response(json);
        match out {
            ExtractOutcome::Refused { reason } => assert_eq!(reason, "removed"),
            other => panic!("expected Refused, got {other:?}"),
        }
    }

    #[test]
    fn picks_highest_muxed_mp4_within_limit() {
        let json = r#"{
            "streamingData": {
                "formats": [
                    {"itag":18,"mimeType":"video/mp4; codecs=\"avc1.42c01e, mp4a.40.2\"","url":"https://example/18","qualityLabel":"360p","bitrate":500000},
                    {"itag":22,"mimeType":"video/mp4; codecs=\"avc1.64001f, mp4a.40.2\"","url":"https://example/22","qualityLabel":"720p","bitrate":1500000},
                    {"itag":37,"mimeType":"video/mp4; codecs=\"avc1.64001f, mp4a.40.2\"","url":"https://example/37","qualityLabel":"1080p","bitrate":3000000}
                ],
                "adaptiveFormats": []
            }
        }"#;
        let out = analyze_player_response(json);
        match out {
            ExtractOutcome::Success { format, total } => {
                // 720p is preferred over 1080p because of DEFAULT_MAX_HEIGHT.
                assert_eq!(format.itag, 22);
                assert_eq!(total, 3);
            }
            other => panic!("expected Success, got {other:?}"),
        }
    }

    #[test]
    fn falls_back_to_adaptive_pair_when_no_muxed() {
        let json = r#"{
            "streamingData": {
                "formats": [],
                "adaptiveFormats": [
                    {"itag":137,"mimeType":"video/mp4; codecs=\"avc1.640028\"","url":"https://example/v","qualityLabel":"1080p","bitrate":3000000},
                    {"itag":140,"mimeType":"audio/mp4; codecs=\"mp4a.40.2\"","url":"https://example/a","audioQuality":"AUDIO_QUALITY_MEDIUM","bitrate":128000}
                ]
            }
        }"#;
        let out = analyze_player_response(json);
        match out {
            ExtractOutcome::SeparateStreams { video, audio, total } => {
                assert_eq!(video.itag, 137);
                assert_eq!(audio.itag, 140);
                assert_eq!(total, 2);
            }
            other => panic!("expected SeparateStreams, got {other:?}"),
        }
    }

    #[test]
    fn malformed_when_no_streaming_data() {
        let json = r#"{"playabilityStatus":{"status":"OK"}}"#;
        let out = analyze_player_response(json);
        assert!(matches!(out, ExtractOutcome::Malformed { .. }));
    }

    #[test]
    fn height_parses_quality_label() {
        let f = StreamFormat {
            itag: 22,
            mime_type: "video/mp4".into(),
            url: "u".into(),
            quality_label: Some("720p".into()),
            bitrate: 0,
            has_audio: true,
            has_video: true,
        };
        assert_eq!(f.height(), 720);
        assert!(f.is_muxed());
    }

    #[test]
    fn outcome_to_json_round_trips() {
        let out = ExtractOutcome::Refused {
            reason: "private".into(),
        };
        let json = outcome_to_json(&out);
        assert!(json.contains("\"status\":\"refused\""));
        assert!(json.contains("\"reason\":\"private\""));
    }
}
