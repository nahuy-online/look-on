# Consumer ProGuard rules for the Look On player plugin.
#
# These rules are applied to the app that consumes this library. We keep the
# ExoPlayer / Media3 classes (they're already covered by the media3 library's
# own consumer rules, but listing them here is defensive) and our plugin
# entry points (which are referenced via reflection by Tauri's plugin loader).

# Keep the plugin entry class + its @TaMethod handlers (Tauri invokes them by name).
-keep class com.lookon.player.PlayerPlugin { *; }
-keep class com.lookon.player.ExoPlayerManager { *; }
-keep class com.lookon.player.AttestationWebView { *; }

# Media3 / ExoPlayer — already covered by their own consumer rules, but
# repeated here so a host app that strips unused library rules still keeps
# the ExoPlayer impl classes (which are loaded reflectively).
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**
