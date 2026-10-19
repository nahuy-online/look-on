package com.lookon.player

import android.app.Activity
import android.content.Context
import android.util.Log
import app.tauri.annotation.TaMethod
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke

/**
 * Tauri 2 plugin entry point for the Look On player.
 *
 * The plugin is registered from the host app's `MainActivity` (Tauri's
 * generated Android entry) via:
 * ```
 *   registerPlugin("player") { PlayerPlugin(it) }
 * ```
 *
 * All command methods are thin shims that delegate to the [ExoPlayerManager]
 * singleton + the [AttestationWebView] hidden-WebView helper. The actual JNI
 * bridge lives in the Rust crate (`android-plugins/player/src/lib.rs`), which
 * calls the `@JvmStatic` methods on those singletons directly — these
 * `@TaMethod` handlers exist so the plugin registers correctly with the Tauri
 * mobile plugin loader and so a future refactor could route everything via
 * Tauri's own dispatch (instead of the `jni` crate) without touching the
 * call sites.
 *
 * **THE FIX for the Obereg play/pause bug**: see [ExoPlayerManager.play] /
 * [ExoPlayerManager.pause] — `setPlayWhenReady(true/false)` is called directly,
 * no JavaScript in the path.
 */
class PlayerPlugin(private val context: Context) : Plugin() {

    init {
        // Stash the host Activity + the application context so the
        // ExoPlayerManager + AttestationWebView singletons can resolve them
        // without Tauri having to pass them on every call. Tauri's Plugin
        // constructor receives the application context, but we walk up to the
        // Activity in [ExoPlayerManager.resolveActivity].
        val activity = resolveActivity(context)
        cachedActivity = activity
        cachedAppContext = context.applicationContext
        Log.i("LookOnPlayer", "PlayerPlugin constructed; activity=$activity")
    }

    @TaMethod
    fun player_init(invoke: Invoke) {
        ExoPlayerManager.init()
        invoke.resolve()
    }

    @TaMethod
    fun player_load(invoke: Invoke) {
        val url = invoke.getString("url") ?: ""
        val headers = invoke.getObject("headers")
        val audioUrl = invoke.getString("audioUrl")
        val headerMap = HashMap<String, String>()
        if (headers != null) {
            val keys = headers.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                headerMap[k] = headers.optString(k)
            }
        }
        val payload = org.json.JSONObject()
            .put("url", url)
            .put("headers", org.json.JSONObject(headerMap))
            .put("audioUrl", audioUrl ?: "")
            .toString()
        val resultJson = ExoPlayerManager.loadJson(payload)
        invoke.resolve(org.json.JSONObject(resultJson))
    }

    @TaMethod
    fun player_play(invoke: Invoke) {
        ExoPlayerManager.play()
        invoke.resolve()
    }

    @TaMethod
    fun player_pause(invoke: Invoke) {
        ExoPlayerManager.pause()
        invoke.resolve()
    }

    @TaMethod
    fun player_seek_to(invoke: Invoke) {
        val positionMs = invoke.getLong("positionMs") ?: 0L
        ExoPlayerManager.seekTo(positionMs)
        invoke.resolve()
    }

    @TaMethod
    fun player_set_speed(invoke: Invoke) {
        val speed = invoke.getDouble("speed") ?: 1.0
        ExoPlayerManager.setSpeed(speed.toFloat())
        invoke.resolve()
    }

    @TaMethod
    fun player_get_position(invoke: Invoke) {
        val ret = org.json.JSONObject()
        ret.put("positionMs", ExoPlayerManager.getPosition())
        invoke.resolve(ret)
    }

    @TaMethod
    fun player_get_duration(invoke: Invoke) {
        val ret = org.json.JSONObject()
        ret.put("durationMs", ExoPlayerManager.getDuration())
        invoke.resolve(ret)
    }

    @TaMethod
    fun player_set_viewport(invoke: Invoke) {
        val x = (invoke.getDouble("x") ?: 0.0).toFloat()
        val y = (invoke.getDouble("y") ?: 0.0).toFloat()
        val w = (invoke.getDouble("width") ?: 0.0).toFloat()
        val h = (invoke.getDouble("height") ?: 0.0).toFloat()
        ExoPlayerManager.setViewport(x, y, w, h)
        invoke.resolve()
    }

    @TaMethod
    fun player_release(invoke: Invoke) {
        ExoPlayerManager.release()
        invoke.resolve()
    }

    @TaMethod
    fun attestation_get_token(invoke: Invoke) {
        val videoId = invoke.getString("videoId") ?: ""
        // The Rust side usually calls AttestationWebView.getToken directly via
        // JNI; this handler is the fallback when the plugin is invoked through
        // Tauri's own dispatch.
        val json = AttestationWebView.getToken(videoId)
        invoke.resolve(org.json.JSONObject(json))
    }

    // ---------- helpers ----------

    companion object {
        /** Cached host Activity — set by the constructor. */
        @Volatile
        @JvmStatic
        var cachedActivity: Activity? = null
            private set

        /** Cached application context — set by the constructor. */
        @Volatile
        @JvmStatic
        var cachedAppContext: Context? = null
            private set

        private fun resolveActivity(context: Context): Activity? {
            var c: Context? = context
            while (c != null) {
                if (c is Activity) return c
                c = if (c is android.content.ContextWrapper) c.baseContext else null
            }
            return null
        }
    }
}
