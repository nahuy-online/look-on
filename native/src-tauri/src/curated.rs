// Curated fallback videos — used when Invidious instances are unavailable.
// All YouTube IDs must be unique to avoid React key conflicts.

use crate::models::VideoItem;

pub fn curated_videos() -> Vec<VideoItem> {
    vec![
        v("dQw4w9WgXcQ", "Rick Astley - Never Gonna Give You Up (Official Video)", "Rick Astley", "Music", 213, 1_540_000_000, 17_800_000, "2009-10-25T06:57:33Z"),
        v("9bZkp7q19f0", "PSY - GANGNAM STYLE (강남스타일) M/V", "officialpsy", "Music", 252, 5_030_000_000, 28_900_000, "2012-07-15T07:14:09Z"),
        v("kJQP7kiw5Fk", "Luis Fonsi - Despacito ft. Daddy Yankee", "LuisFonsiVEVO", "Music", 282, 8_600_000_000, 52_000_000, "2017-01-12T21:00:10Z"),
        v("OPf0YbXqDm0", "Mark Ronson - Uptown Funk (Official Video) ft. Bruno Mars", "Mark Ronson", "Music", 270, 5_200_000_000, 26_000_000, "2014-11-19T05:00:00Z"),
        v("JGwWNGJdvx8", "Ed Sheeran - Shape of You (Official Music Video)", "Ed Sheeran", "Music", 234, 6_200_000_000, 32_000_000, "2017-01-30T05:00:00Z"),
        v("RgKAFK5djSk", "Wiz Khalifa - See You Again ft. Charlie Puth", "Wiz Khalifa", "Music", 239, 6_400_000_000, 39_000_000, "2015-04-06T04:00:00Z"),
        v("60ItHLz5WEA", "Alan Walker - Faded", "Alan Walker", "Music", 212, 3_900_000_000, 35_000_000, "2015-12-03T05:00:00Z"),
        v("fJ9rUzIMcZQ", "Queen – Bohemian Rhapsody (Official Video Remastered)", "Queen Official", "Music", 354, 1_800_000_000, 16_000_000, "2008-08-01T06:00:07Z"),
        v("YQHsXMglC9A", "Adele - Hello (Official Music Video)", "Adele", "Music", 367, 3_400_000_000, 17_500_000, "2015-10-22T21:00:01Z"),
        v("CevxZvSJLk8", "Katy Perry - Roar (Official)", "Katy Perry", "Entertainment", 269, 4_000_000_000, 21_000_000, "2013-09-05T09:24:46Z"),
        v("450p7goxZqg", "John Legend - All of Me (Official Video)", "John Legend", "Entertainment", 269, 2_900_000_000, 16_000_000, "2013-10-02T21:00:05Z"),
        v("09R8_2nJtjg", "Maroon 5 - Sugar (Official Music Video)", "Maroon 5", "Entertainment", 302, 4_100_000_000, 24_000_000, "2015-01-06T05:00:00Z"),
        // Additional videos for search variety (unique IDs only)
        v("ScMzIvxBSi4", "The Present - Animated Short Film", "TrueFrame", "Entertainment", 375, 50_000_000, 1_200_000, "2014-02-06T12:00:00Z"),
        v("L_jWHffIx5E", "Smash Mouth - All Star (Official Music Video)", "Smash Mouth", "Music", 217, 750_000_000, 5_800_000, "2009-10-25T06:57:33Z"),
        v("kffacxfA7G4", "Mortal Kombat 1 - Gameplay Trailer", "Mortal Kombat", "Gaming", 180, 15_000_000, 800_000, "2023-07-01T00:00:00Z"),
        v("VdPffXrQhU8", "iPhone 15 Pro Review - The Best iPhone Yet", "TechReviewer", "Tech", 720, 8_000_000, 350_000, "2023-09-22T00:00:00Z"),
        v("Bey8P8eI8eQ", "Cooking Pasta Carbonara - Italian Recipe", "ItalianChef", "Cooking", 480, 3_500_000, 180_000, "2022-03-10T00:00:00Z"),
        v("e-ORhEE9VgI", "Taylor Swift - Blank Space", "Taylor Swift", "Music", 273, 3_300_000_000, 14_000_000, "2014-11-10T00:00:00Z"),
        v("2vjPBrBU-TM", "Sia - Chandelier (Official Video)", "Sia", "Music", 232, 2_600_000_000, 11_000_000, "2014-05-06T00:00:00Z"),
    ]
}

pub fn curated_by_category(category: &str) -> Vec<VideoItem> {
    let all = curated_videos();
    if category == "All" {
        return all;
    }
    let filtered: Vec<VideoItem> = all.into_iter().filter(|v| v.category == category).collect();
    if filtered.is_empty() {
        curated_videos()
    } else {
        filtered
    }
}

fn v(id: &str, title: &str, channel: &str, category: &str, duration: i64, views: i64, likes: i64, published_at: &str) -> VideoItem {
    VideoItem {
        id: id.to_string(),
        youtube_id: id.to_string(),
        title: title.to_string(),
        channel: channel.to_string(),
        channel_avatar: Some(format!(
            "https://api.dicebear.com/7.x/initials/svg?seed={}&backgroundColor=10b981,059669,14b8a6,0d9488&textColor=ffffff",
            urlencoding::encode(channel)
        )),
        thumbnail: format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", id),
        duration,
        views,
        likes,
        published_at: published_at.to_string(),
        category: category.to_string(),
        description: String::new(),
        curated: Some(true),
        promoted: Some(false),
        promoted_label: None,
    }
}
