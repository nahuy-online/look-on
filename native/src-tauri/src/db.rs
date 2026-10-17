// SQLite-backed persistence for Look On.
//
// Uses `rusqlite` with the `bundled` feature so the build doesn't depend on a
// system SQLite. The DB file is created at the Tauri app data dir on first
// launch. Schema mirrors the web app's `prisma/schema.prisma`:
//   - history (id, youtube_id, title, channel, thumbnail, duration, category,
//              progress, watched_at)
//   - downloads (...)
//   - liked_videos (...)
//   - playlists + playlist_items
//
// Connection is wrapped in a Mutex and exposed via Tauri managed state.

use crate::models::{DownloadItem, DownloadPatch, HistoryItem, PlaylistLite, PromotedVideo, VideoItem};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::Mutex;

pub struct Db(pub Mutex<Connection>);

pub fn open(path: &Path) -> anyhow::Result<Db> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    init_schema(&conn)?;
    Ok(Db(Mutex::new(conn)))
}

fn init_schema(conn: &Connection) -> anyhow::Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            youtube_id TEXT NOT NULL,
            title TEXT NOT NULL,
            channel TEXT NOT NULL,
            thumbnail TEXT NOT NULL,
            duration INTEGER DEFAULT 0,
            category TEXT DEFAULT 'All',
            progress INTEGER DEFAULT 0,
            watched_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_history_youtube ON history(youtube_id);

        CREATE TABLE IF NOT EXISTS downloads (
            id TEXT PRIMARY KEY,
            youtube_id TEXT NOT NULL,
            title TEXT NOT NULL,
            channel TEXT NOT NULL,
            thumbnail TEXT NOT NULL,
            duration INTEGER DEFAULT 0,
            quality TEXT DEFAULT '1080p',
            size_mb INTEGER DEFAULT 0,
            progress INTEGER DEFAULT 0,
            status TEXT DEFAULT 'queued',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_downloads_youtube ON downloads(youtube_id);

        CREATE TABLE IF NOT EXISTS liked_videos (
            id TEXT PRIMARY KEY,
            youtube_id TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            channel TEXT NOT NULL,
            thumbnail TEXT NOT NULL,
            duration INTEGER DEFAULT 0,
            category TEXT DEFAULT 'All',
            liked_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS playlists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS playlist_items (
            id TEXT PRIMARY KEY,
            playlist_id TEXT NOT NULL,
            youtube_id TEXT NOT NULL,
            title TEXT NOT NULL,
            channel TEXT NOT NULL,
            thumbnail TEXT NOT NULL,
            duration INTEGER DEFAULT 0,
            added_at TEXT NOT NULL,
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_pi_playlist ON playlist_items(playlist_id);

        CREATE TABLE IF NOT EXISTS settings (
            id TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS promoted_videos (
            id TEXT PRIMARY KEY,
            youtube_id TEXT NOT NULL,
            title TEXT NOT NULL,
            channel TEXT NOT NULL,
            thumbnail TEXT NOT NULL,
            duration INTEGER DEFAULT 0,
            position INTEGER DEFAULT 3,
            label TEXT DEFAULT 'Promoted',
            category TEXT DEFAULT 'All',
            active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_promoted_category ON promoted_videos(category);
        CREATE INDEX IF NOT EXISTS idx_promoted_active ON promoted_videos(active);
        "#,
    )?;
    Ok(())
}

fn cuid_like() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let prefix = "c";
    let body: String = (0..20)
        .map(|_| {
            let n = rng.gen_range(0..36);
            if n < 10 {
                (b'0' + n) as char
            } else {
                (b'a' + n - 10) as char
            }
        })
        .collect();
    format!("{}{}", prefix, body)
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

// ---------- History ----------

pub fn get_history(db: &Db) -> anyhow::Result<Vec<HistoryItem>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, youtube_id, title, channel, thumbnail, duration, category, progress, watched_at
         FROM history ORDER BY watched_at DESC LIMIT 200",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(HistoryItem {
            id: row.get(0)?,
            youtube_id: row.get(1)?,
            title: row.get(2)?,
            channel: row.get(3)?,
            thumbnail: row.get(4)?,
            duration: row.get(5)?,
            category: row.get(6)?,
            progress: row.get(7)?,
            watched_at: row.get(8)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn add_history(db: &Db, v: &VideoItem) -> anyhow::Result<()> {
    let conn = db.0.lock().unwrap();
    // Delete prior entry for the same youtube_id so it bubbles back to the top.
    conn.execute(
        "DELETE FROM history WHERE youtube_id = ?1",
        params![v.youtube_id],
    )?;
    conn.execute(
        "INSERT INTO history (id, youtube_id, title, channel, thumbnail, duration, category, progress, watched_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8)",
        params![
            cuid_like(),
            v.youtube_id,
            v.title,
            v.channel,
            v.thumbnail,
            v.duration,
            v.category,
            now_iso(),
        ],
    )?;
    // Cap history at 500 rows.
    conn.execute(
        "DELETE FROM history WHERE id NOT IN (
            SELECT id FROM history ORDER BY watched_at DESC LIMIT 500
        )",
        [],
    )?;
    Ok(())
}

pub fn clear_history(db: &Db) -> anyhow::Result<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM history", [])?;
    Ok(())
}

// ---------- Downloads ----------

pub fn get_downloads(db: &Db) -> anyhow::Result<Vec<DownloadItem>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, youtube_id, title, channel, thumbnail, duration, quality, size_mb, progress, status, created_at
         FROM downloads ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DownloadItem {
            id: row.get(0)?,
            youtube_id: row.get(1)?,
            title: row.get(2)?,
            channel: row.get(3)?,
            thumbnail: row.get(4)?,
            duration: row.get(5)?,
            quality: row.get(6)?,
            size_mb: row.get(7)?,
            progress: row.get(8)?,
            status: row.get(9)?,
            created_at: row.get(10)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn add_download(db: &Db, v: &VideoItem, quality: &str, size_mb: i64) -> anyhow::Result<DownloadItem> {
    let conn = db.0.lock().unwrap();
    let id = cuid_like();
    let now = now_iso();
    conn.execute(
        "INSERT INTO downloads (id, youtube_id, title, channel, thumbnail, duration, quality, size_mb, progress, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, 'queued', ?9, ?9)",
        params![id, v.youtube_id, v.title, v.channel, v.thumbnail, v.duration, quality, size_mb, now],
    )?;
    Ok(DownloadItem {
        id,
        youtube_id: v.youtube_id.clone(),
        title: v.title.clone(),
        channel: v.channel.clone(),
        thumbnail: v.thumbnail.clone(),
        duration: v.duration,
        quality: quality.to_string(),
        size_mb,
        progress: 0,
        status: "queued".to_string(),
        created_at: now,
    })
}

pub fn update_download(db: &Db, id: &str, patch: &DownloadPatch) -> anyhow::Result<()> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "UPDATE downloads SET
            progress = COALESCE(?1, progress),
            status   = COALESCE(?2, status),
            size_mb  = COALESCE(?3, size_mb),
            quality  = COALESCE(?4, quality),
            updated_at = ?5
         WHERE id = ?6",
        params![
            patch.progress,
            patch.status,
            patch.size_mb,
            patch.quality,
            now_iso(),
            id,
        ],
    )?;
    Ok(())
}

pub fn remove_download(db: &Db, id: &str) -> anyhow::Result<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM downloads WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn clear_downloads(db: &Db) -> anyhow::Result<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM downloads", [])?;
    Ok(())
}

// ---------- Liked ----------

pub fn get_liked(db: &Db) -> anyhow::Result<Vec<VideoItem>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT youtube_id, title, channel, thumbnail, duration, category, liked_at
         FROM liked_videos ORDER BY liked_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        let yid: String = row.get(0)?;
        Ok(VideoItem {
            id: yid.clone(),
            youtube_id: yid,
            title: row.get(1)?,
            channel: row.get(2)?,
            channel_avatar: None,
            thumbnail: row.get(3)?,
            duration: row.get(4)?,
            views: 0,
            likes: 0,
            published_at: row.get::<_, String>(6)?,
            category: row.get(5)?,
            description: String::new(),
            curated: Some(false),
            promoted: Some(false),
            promoted_label: None,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

/// Toggle a like. Returns true if the video is now liked, false if it was removed.
pub fn toggle_like(db: &Db, v: &VideoItem) -> anyhow::Result<bool> {
    let conn = db.0.lock().unwrap();
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM liked_videos WHERE youtube_id = ?1",
            params![v.youtube_id],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(id) = existing {
        conn.execute("DELETE FROM liked_videos WHERE id = ?1", params![id])?;
        Ok(false)
    } else {
        conn.execute(
            "INSERT INTO liked_videos (id, youtube_id, title, channel, thumbnail, duration, category, liked_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                cuid_like(),
                v.youtube_id,
                v.title,
                v.channel,
                v.thumbnail,
                v.duration,
                v.category,
                now_iso(),
            ],
        )?;
        Ok(true)
    }
}

// ---------- Playlists ----------

pub fn get_playlists(db: &Db) -> anyhow::Result<Vec<PlaylistLite>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, name, description, created_at, updated_at FROM playlists ORDER BY updated_at DESC",
    )?;
    let playlists: Vec<(String, String, Option<String>, String, String)> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();
    drop(stmt);

    let mut out = Vec::new();
    for (id, name, description, created_at, updated_at) in playlists {
        let mut item_stmt = conn.prepare(
            "SELECT youtube_id, title, channel, thumbnail, duration
             FROM playlist_items WHERE playlist_id = ?1 ORDER BY added_at DESC",
        )?;
        let items: Vec<VideoItem> = item_stmt
            .query_map(params![id], |row| {
                let yid: String = row.get(0)?;
                Ok(VideoItem {
                    id: yid.clone(),
                    youtube_id: yid,
                    title: row.get(1)?,
                    channel: row.get(2)?,
                    channel_avatar: None,
                    thumbnail: row.get(3)?,
                    duration: row.get(4)?,
                    views: 0,
                    likes: 0,
                    published_at: String::new(),
                    category: "All".to_string(),
                    description: String::new(),
                    curated: Some(false),
                    promoted: Some(false),
                    promoted_label: None,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        let video_ids = items.iter().map(|v| v.youtube_id.clone()).collect();
        out.push(PlaylistLite {
            id,
            name,
            description,
            video_ids,
            videos: items,
            created_at,
            updated_at,
        });
    }
    Ok(out)
}

pub fn create_playlist(db: &Db, name: &str, description: Option<&str>) -> anyhow::Result<PlaylistLite> {
    let conn = db.0.lock().unwrap();
    let id = cuid_like();
    let now = now_iso();
    conn.execute(
        "INSERT INTO playlists (id, name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
        params![id, name, description, now],
    )?;
    Ok(PlaylistLite {
        id,
        name: name.to_string(),
        description: description.map(|s| s.to_string()),
        video_ids: Vec::new(),
        videos: Vec::new(),
        created_at: now.clone(),
        updated_at: now,
    })
}

pub fn add_to_playlist(db: &Db, playlist_id: &str, v: &VideoItem) -> anyhow::Result<()> {
    let conn = db.0.lock().unwrap();
    // De-dupe: if it's already in the playlist, no-op.
    let exists: Option<String> = conn
        .query_row(
            "SELECT id FROM playlist_items WHERE playlist_id = ?1 AND youtube_id = ?2",
            params![playlist_id, v.youtube_id],
            |row| row.get(0),
        )
        .optional()?;
    if exists.is_some() {
        return Ok(());
    }
    conn.execute(
        "INSERT INTO playlist_items (id, playlist_id, youtube_id, title, channel, thumbnail, duration, added_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            cuid_like(),
            playlist_id,
            v.youtube_id,
            v.title,
            v.channel,
            v.thumbnail,
            v.duration,
            now_iso(),
        ],
    )?;
    conn.execute(
        "UPDATE playlists SET updated_at = ?1 WHERE id = ?2",
        params![now_iso(), playlist_id],
    )?;
    Ok(())
}

pub fn delete_playlist(db: &Db, id: &str) -> anyhow::Result<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM playlists WHERE id = ?1", params![id])?;
    // playlist_items removed via ON DELETE CASCADE
    Ok(())
}

// ---------- Promoted videos ----------

/// List promoted videos for a given category. Matches rows where
/// `category = 'All'` (visible everywhere) OR `category = <cat>`.
/// Returns both active and inactive rows — caller filters by `active` as
/// needed (the trending command only injects active ones; the admin UI shows
/// all of them so they can be toggled).
pub fn get_promoted(db: &Db, category: &str) -> anyhow::Result<Vec<PromotedVideo>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, youtube_id, title, channel, thumbnail, duration, position, label, category, active, created_at
         FROM promoted_videos
         WHERE category = 'All' OR category = ?1
         ORDER BY position ASC, created_at DESC",
    )?;
    let rows = stmt.query_map(params![category], |row| {
        let active_int: i64 = row.get(9)?;
        Ok(PromotedVideo {
            id: row.get(0)?,
            youtube_id: row.get(1)?,
            title: row.get(2)?,
            channel: row.get(3)?,
            thumbnail: row.get(4)?,
            duration: row.get(5)?,
            position: row.get(6)?,
            label: row.get(7)?,
            category: row.get(8)?,
            active: active_int != 0,
            created_at: row.get(10)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

/// Insert a new promoted video. Returns the freshly-created row.
pub fn add_promoted(
    db: &Db,
    youtube_id: &str,
    title: &str,
    channel: &str,
    thumbnail: &str,
    duration: i64,
    position: i64,
    label: &str,
    category: &str,
) -> anyhow::Result<PromotedVideo> {
    let conn = db.0.lock().unwrap();
    let id = cuid_like();
    let now = now_iso();
    let label = if label.is_empty() { "Promoted" } else { label };
    let category = if category.is_empty() { "All" } else { category };
    conn.execute(
        "INSERT INTO promoted_videos (id, youtube_id, title, channel, thumbnail, duration, position, label, category, active, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10)",
        params![id, youtube_id, title, channel, thumbnail, duration, position, label, category, now],
    )?;
    Ok(PromotedVideo {
        id,
        youtube_id: youtube_id.to_string(),
        title: title.to_string(),
        channel: channel.to_string(),
        thumbnail: thumbnail.to_string(),
        duration,
        position,
        label: label.to_string(),
        category: category.to_string(),
        active: true,
        created_at: now,
    })
}

/// Patch an existing promoted video. Only the supplied fields are updated.
/// `active` is converted from bool to i64 (0/1) for SQLite.
pub fn update_promoted(
    db: &Db,
    id: &str,
    position: Option<i64>,
    label: Option<&str>,
    active: Option<bool>,
) -> anyhow::Result<()> {
    let conn = db.0.lock().unwrap();
    let active_int = active.map(|b| if b { 1i64 } else { 0i64 });
    conn.execute(
        "UPDATE promoted_videos SET
            position = COALESCE(?1, position),
            label    = COALESCE(?2, label),
            active   = COALESCE(?3, active)
         WHERE id = ?4",
        params![position, label, active_int, id],
    )?;
    Ok(())
}

/// Delete a promoted video by id.
pub fn delete_promoted(db: &Db, id: &str) -> anyhow::Result<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM promoted_videos WHERE id = ?1", params![id])?;
    Ok(())
}
