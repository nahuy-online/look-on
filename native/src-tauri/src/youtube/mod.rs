//! YouTube direct-extraction module.
//!
//! Talks to YouTube's InnerTube API (`/player`, `/browse`, `/search`)
//! without going through Invidious, and parses the responses using the
//! pure-function logic ported from Obereg's `obereg-core` crate.
//!
//! ## Layout
//!
//! | File       | Responsibility                                             |
//! |------------|------------------------------------------------------------|
//! | `client`   | Async HTTP client + InnerTube request/response cycle.     |
//! | `extract`  | Pure parsing of the player response + stream selection.   |
//! | `feed`     | Pure parsing of browse/search responses + promo injection.|
//!
//! ## Why both Invidious and direct YouTube?
//!
//! Invidious (`crate::invidious`) is the default feed/stream source — it's
//! simpler and ad-free by design, but it depends on third-party instances
//! that go up and down. This module is the fallback / power-user path:
//! when an Invidious instance is rate-limiting or doesn't have a video,
//! the frontend can call `yt_extract` / `yt_feed` / `yt_search` directly.
//!
//! ## Wire format
//!
//! All public structs use `#[serde(rename_all = "camelCase")]` so the JSON
//! that crosses the FFI boundary matches the TypeScript types in
//! `native/src/lib/types.ts` field-for-field. The `ExtractOutcome` enum
//! uses an internally-tagged representation
//! (`{ "status": "success" | "separate_streams" | ... }`) so the frontend
//! can pattern-match on the `status` field.

pub mod client;
pub mod extract;
pub mod feed;

pub use extract::{analyze_player_response, outcome_to_json, ExtractOutcome, StreamFormat};
pub use feed::{inject, parse_feed, parse_playlists, promo_from, FeedItem, PlaylistEntry};
