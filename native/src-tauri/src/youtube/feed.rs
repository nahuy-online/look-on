//! YouTube feed (browse / search) response parsing.
//!
//! Adapted from Obereg's `obereg-core/src/feed.rs` (in `/tmp/obereg`).
//!
//! The browse/search response is deeply nested and YouTube reshuffles its
//! structure over time. Rather than hard-coding a path, we walk the tree
//! and collect every video-shaped node we recognise, preserving the order
//! YouTube returned them in. This is robust to layout changes: if YouTube
//! moves a shelf higher or lower, we still produce the same items in the
//! same order.
//!
//! We also support promo injection: an admin-curated FeedItem can be
//! spliced into a specific 1-indexed position in the parsed feed (mirrors
//! the `promoted_videos` table used by the Invidious path).

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// One video in a feed (trending, search results, related, ...).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedItem {
    /// YouTube video ID (11 chars).
    pub video_id: String,
    /// Video title.
    pub title: String,
    /// Channel name (may be empty if not surfaced).
    pub channel: String,
    /// Duration as YouTube's text ("12:34"), if shown.
    pub duration: Option<String>,
    /// View count as YouTube's text ("1.2M views"), if shown.
    pub views: Option<String>,
    /// Thumbnail URL — the first one YouTube returns for the item.
    pub thumbnail_url: Option<String>,
    /// True when this item was injected by us (admin promo), not YouTube.
    pub injected: bool,
}

impl FeedItem {
    /// A promo item: synthetic, no service data behind it.
    pub fn promo(video_id: &str, title: &str) -> Self {
        Self {
            video_id: video_id.to_string(),
            title: title.to_string(),
            channel: String::new(),
            duration: None,
            views: None,
            thumbnail_url: None,
            injected: true,
        }
    }
}

/// A playlist entry returned by the browse endpoint.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistEntry {
    /// Playlist ID without the leading `VL` prefix.
    pub playlist_id: String,
    /// Playlist title.
    pub title: String,
    /// Video count as YouTube's text, if shown.
    pub video_count: Option<String>,
    /// Thumbnail URL.
    pub thumbnail_url: Option<String>,
}

/// Recognised renderer keys for video items across YouTube response versions.
const VIDEO_KEYS: [&str; 6] = [
    "videoRenderer",
    "gridVideoRenderer",
    "compactVideoRenderer",
    "playlistVideoRenderer",
    "reelItemRenderer",
    "videoWithContextRenderer",
];

/// Recognised renderer keys for playlist items.
const PLAYLIST_KEYS: [&str; 4] = [
    "gridPlaylistRenderer",
    "playlistRenderer",
    "lockupViewModel",
    "gridPlaylistRendererWithContext",
];

/// Parse a browse/search response into a list of feed items, in the order
/// YouTube returned them.
pub fn parse_feed(json: &str) -> Result<Vec<FeedItem>, String> {
    let root: Value = serde_json::from_str(json)
        .map_err(|e| format!("feed: invalid JSON: {e}"))?;
    let mut items = Vec::new();
    collect_videos(&root, &mut items);
    Ok(items)
}

/// Parse a browse response into a list of playlists, in the order YouTube
/// returned them.
pub fn parse_playlists(json: &str) -> Result<Vec<PlaylistEntry>, String> {
    let root: Value = serde_json::from_str(json)
        .map_err(|e| format!("playlists: invalid JSON: {e}"))?;
    let mut entries = Vec::new();
    collect_playlists(&root, &mut entries);
    Ok(entries)
}

/// Walk the tree collecting video items.
fn collect_videos(node: &Value, items: &mut Vec<FeedItem>) {
    match node {
        Value::Object(map) => {
            for key in VIDEO_KEYS {
                if let Some(video) = map.get(key) {
                    if let Some(item) = read_video(video) {
                        items.push(item);
                    }
                }
            }
            for value in map.values() {
                collect_videos(value, items);
            }
        }
        Value::Array(array) => {
            for value in array {
                collect_videos(value, items);
            }
        }
        _ => {}
    }
}

/// Walk the tree collecting playlist entries.
fn collect_playlists(node: &Value, entries: &mut Vec<PlaylistEntry>) {
    match node {
        Value::Object(map) => {
            for key in PLAYLIST_KEYS {
                if let Some(playlist) = map.get(key) {
                    if let Some(entry) = read_playlist(playlist) {
                        entries.push(entry);
                    }
                }
            }
            for value in map.values() {
                collect_playlists(value, entries);
            }
        }
        Value::Array(array) => {
            for value in array {
                collect_playlists(value, entries);
            }
        }
        _ => {}
    }
}

/// Read one video item from a renderer object.
fn read_video(video: &Value) -> Option<FeedItem> {
    let video_id = video.get("videoId").and_then(Value::as_str)?.to_string();
    if video_id.is_empty() {
        return None;
    }
    let title = text_of(video.get("title"))
        .or_else(|| text_of(video.get("headline")))
        .unwrap_or_default();
    let channel = text_of(video.get("ownerText"))
        .or_else(|| text_of(video.get("longBylineText")))
        .or_else(|| text_of(video.get("shortBylineText")))
        .unwrap_or_default();
    let duration = text_of(video.get("lengthText"));
    let views = text_of(video.get("viewCountText"))
        .or_else(|| text_of(video.get("shortViewCountText")));
    let thumbnail_url = thumbnail_of(video);
    Some(FeedItem {
        video_id,
        title,
        channel,
        duration,
        views,
        thumbnail_url,
        injected: false,
    })
}

/// Read one playlist entry from a renderer object.
fn read_playlist(playlist: &Value) -> Option<PlaylistEntry> {
    // Old shape: playlistId is a string. New shape (lockupViewModel): contentId.
    let raw_id = playlist
        .get("playlistId")
        .and_then(Value::as_str)
        .or_else(|| playlist.get("contentId").and_then(Value::as_str))
        .unwrap_or_default();
    let playlist_id = raw_id.trim_start_matches("VL").to_string();
    if playlist_id.is_empty() {
        return None;
    }
    let title = text_of(playlist.get("title"))
        .or_else(|| {
            text_of(
                playlist
                    .get("metadata")
                    .and_then(|m| m.get("lockupMetadataViewModel"))
                    .and_then(|m| m.get("title")),
            )
        })
        .unwrap_or_default();
    let video_count = text_of(playlist.get("videoCountText"))
        .or_else(|| text_of(playlist.get("videoCountShortText")))
        .or_else(|| {
            playlist
                .get("thumbnailOverlays")
                .and_then(|overlays| overlays.as_array())
                .and_then(|items| items.first())
                .and_then(|first| first.get("thumbnailOverlayTimeStatusRenderer"))
                .and_then(|status| text_of(status.get("text")))
        });
    let thumbnail_url = thumbnail_of(playlist);
    Some(PlaylistEntry {
        playlist_id,
        title,
        video_count,
        thumbnail_url,
    })
}

/// Pull a string out of a YouTube text block: either `{"simpleText": "..."}`,
/// `{"content": "..."}`, or `{"runs": [{"text": "..."}]}`.
fn text_of(node: Option<&Value>) -> Option<String> {
    let node = node?;
    if let Some(simple) = node.get("simpleText").and_then(Value::as_str) {
        return Some(simple.to_string());
    }
    if let Some(content) = node.get("content").and_then(Value::as_str) {
        return Some(content.to_string());
    }
    if let Some(runs) = node.get("runs").and_then(Value::as_array) {
        let text: String = runs
            .iter()
            .filter_map(|run| run.get("text").and_then(Value::as_str))
            .collect();
        if !text.is_empty() {
            return Some(text);
        }
    }
    None
}

/// First thumbnail URL from a `thumbnail.thumbnails[]` block.
fn thumbnail_of(video: &Value) -> Option<String> {
    let thumbs = video.get("thumbnail")?.get("thumbnails")?.as_array()?;
    let first = thumbs.first()?;
    first.get("url").and_then(Value::as_str).map(str::to_string)
}

/// Inject a promo item at a 1-indexed position in the feed.
///
/// If a video with the same ID is already in the feed, it's removed first
/// (so we never produce duplicates). If `position` is past the end, the
/// promo is appended.
pub fn inject(items: &[FeedItem], promo: &FeedItem, position: usize) -> Vec<FeedItem> {
    let mut result: Vec<FeedItem> = items
        .iter()
        .filter(|item| item.video_id != promo.video_id)
        .cloned()
        .collect();
    let index = position.saturating_sub(1).min(result.len());
    result.insert(index, promo.clone());
    result
}

/// Build a promo [`FeedItem`] — `video_id` required, `title` optional.
pub fn promo_from(video_id: &str, title: Option<&str>) -> FeedItem {
    FeedItem::promo(video_id, title.unwrap_or("Recommended"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> String {
        r#"{
          "contents": {
            "twoColumnBrowseResultsRenderer": {
              "tabs": [{
                "tabRenderer": {
                  "content": {
                    "richGridRenderer": {
                      "contents": [
                        {"richItemRenderer": {"content": {"videoRenderer": {
                          "videoId": "aaaaaaaaaaa",
                          "title": {"runs": [{"text": "First video"}]},
                          "ownerText": {"runs": [{"text": "Channel A"}]},
                          "lengthText": {"simpleText": "12:34"},
                          "viewCountText": {"simpleText": "1,234 views"},
                          "thumbnail": {"thumbnails": [{"url": "https://i.example/1.jpg"}]}
                        }}}},
                        {"richItemRenderer": {"content": {"videoRenderer": {
                          "videoId": "bbbbbbbbbbb",
                          "title": {"runs": [{"text": "Second video"}]},
                          "ownerText": {"runs": [{"text": "Channel B"}]}
                        }}}},
                        {"shelfRenderer": {"content": {"horizontalListRenderer": {"items": [
                          {"gridVideoRenderer": {
                            "videoId": "ccccccccccc",
                            "title": {"simpleText": "Third video"},
                            "shortBylineText": {"runs": [{"text": "Channel C"}]}
                          }},
                          {"playlistVideoRenderer": {
                            "videoId": "ddddddddddd",
                            "title": {"runs": [{"text": "Fourth video"}]}
                          }}
                        ]}}}}
                      ]
                    }
                  }
                }
              }]
            }
          }
        }"#.to_string()
    }

    #[test]
    fn parses_feed_in_order() {
        let items = parse_feed(&sample()).expect("feed should parse");
        let ids: Vec<&str> = items.iter().map(|i| i.video_id.as_str()).collect();
        assert_eq!(
            ids,
            ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "ddddddddddd"]
        );
        assert_eq!(items[0].title, "First video");
        assert_eq!(items[0].channel, "Channel A");
        assert_eq!(items[2].channel, "Channel C");
        assert_eq!(items[0].duration.as_deref(), Some("12:34"));
        assert_eq!(items[0].views.as_deref(), Some("1,234 views"));
        assert!(items[0].thumbnail_url.is_some());
        assert!(!items[0].injected);
    }

    #[test]
    fn injects_promo_at_position() {
        let items = parse_feed(&sample()).expect("feed");
        let promo = promo_from("zzzzzzzzzzz", Some("Our pick"));
        let with_promo = inject(&items, &promo, 3);
        assert_eq!(with_promo.len(), 5);
        assert_eq!(with_promo[2].video_id, "zzzzzzzzzzz");
        assert!(with_promo[2].injected);
        // Order of the rest is preserved.
        assert_eq!(with_promo[0].video_id, "aaaaaaaaaaa");
        assert_eq!(with_promo[3].video_id, "ccccccccccc");
    }

    #[test]
    fn promo_already_in_feed_is_moved_not_duplicated() {
        let items = parse_feed(&sample()).expect("feed");
        let promo = promo_from("bbbbbbbbbbb", Some("Our pick"));
        let with_promo = inject(&items, &promo, 1);
        assert_eq!(with_promo.len(), 4, "should not duplicate");
        assert_eq!(with_promo[0].video_id, "bbbbbbbbbbb");
        assert!(with_promo[0].injected);
        assert_eq!(
            with_promo
                .iter()
                .filter(|i| i.video_id == "bbbbbbbbbbb")
                .count(),
            1
        );
    }

    #[test]
    fn position_beyond_feed_appends() {
        let items = parse_feed(&sample()).expect("feed");
        let promo = promo_from("zzzzzzzzzzz", None);
        let with_promo = inject(&items, &promo, 99);
        assert_eq!(
            with_promo.last().expect("non-empty").video_id,
            "zzzzzzzzzzz"
        );
    }

    #[test]
    fn broken_json_is_reported() {
        assert!(parse_feed("{not json}").is_err());
        let empty = parse_feed("{\"contents\": {}}").expect("empty feed");
        assert!(empty.is_empty());
    }
}
