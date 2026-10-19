package com.lookon.player

import android.app.Activity
import android.content.Context
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.ui.PlayerView
import okhttp3.OkHttpClient
import org.json.JSONObject

/**
 * Singleton wrapper around a single [ExoPlayer] instance + the [PlayerView]
 * overlay attached to the host Activity's content view.
 *
 * **THE FIX for the Obereg play/pause bug.** Obereg drove play/pause by
 * posting `player.playVideo()` / `player.pauseVideo()` calls into a YouTube
 * IFrame WebView. That bridge occasionally dropped events (the iframe's JS
 * context gets torn down when the user navigates, the postMessage queue backs
 * up, the JS API isn't ready yet, etc.). The result was phantom "play doesn't
 * work" tickets that couldn't be reproduced locally.
 *
 * Here, [play] / [pause] call [ExoPlayer.setPlayWhenReady] directly — a native
 * method on the player instance that takes effect synchronously and never gets
 * lost. There is no JavaScript in the play/pause path at all.
 *
 * The class is an `object` (Kotlin singleton) so the Rust side can call it via
 * a simple JNI `call_static_method` without having to hold a reference to a
 * plugin instance.
 */
object ExoPlayerManager {
    private const val TAG = "LookOnPlayer"

    /** The single ExoPlayer instance for the whole app lifetime. */
    @Volatile
    private var player: ExoPlayer? = null

    /** The overlay View that renders the player's Surface. Lazily attached. */
    @Volatile
    private var playerView: PlayerView? = null

    /** The Activity whose content view hosts the overlay. Set by [init]. */
    @Volatile
    private var hostActivity: Activity? = null

    /** Application context — set by [init] so [AttestationWebView] can build
     *  a hidden WebView without holding an Activity reference. */
    @Volatile
    private var appContext: Context? = null

    /** Public accessor used by [AttestationWebView] when no Activity is cached. */
    @JvmStatic
    fun applicationContext(): Context? = appContext

    /** Shared OkHttp client for the HTTP data source factory. */
    private val okHttpClient: OkHttpClient by lazy { OkHttpClient.Builder().build() }

    /** Last reported viewport (device pixels, relative to the content view). */
    @Volatile
    private var viewport: FloatArray = floatArrayOf(0f, 0f, 0f, 0f)

    // ---------- lifecycle ----------

    /**
     * Initialise the ExoPlayer + remember the host Activity so we can attach
     * the [PlayerView] overlay later. Safe to call multiple times — the second
     * call is a no-op.
     *
     * Called from Rust via `player_init` → JNI → `init()V`. The Context is
     * pulled from [PlayerPlugin.cachedAppContext] (set by the Tauri plugin
     * loader when it constructs [PlayerPlugin]).
     */
    @JvmStatic
    fun init() {
        if (player != null) {
            Log.d(TAG, "init: already initialised — skipping")
            return
        }
        val context = resolveAppContext()
        if (context == null) {
            Log.e(TAG, "init: no Android context available")
            return
        }
        appContext = context.applicationContext
        hostActivity = resolveActivity(context)
        Log.i(TAG, "init: hostActivity=${hostActivity?.javaClass?.name}")

        val app = context.applicationContext
        player = ExoPlayer.Builder(app)
            .setMediaSourceFactory(buildMediaSourceFactory(app))
            .build()
            .also { it.repeatMode = Player.REPEAT_MODE_OFF }
    }

    /** Tear down the player + remove the overlay View. Idempotent. */
    @JvmStatic
    fun release() {
        Log.i(TAG, "release")
        playerView?.let { pv ->
            pv.player = null
            (pv.parent as? ViewGroup)?.removeView(pv)
            pv.removeAllViews()
        }
        playerView = null
        player?.release()
        player = null
        hostActivity = null
    }

    // ---------- media loading ----------

    /**
     * Load a media URL with optional custom HTTP headers + an optional
     * separate audio URL (for adaptive streams where YouTube returns
     * video-only and audio-only URLs).
     *
     * Called from Rust via `player_load` → JNI → `loadJson(Ljava/lang/String;)Ljava/lang/String;`.
     * The JSON payload is `{ "url": "...", "headers": {...}, "audioUrl": "..." | null }`
     * and we return `{ "ok": true }` or `{ "ok": false, "error": "..." }`.
     */
    @JvmStatic
    fun loadJson(payload: String): String {
        val p = player ?: run {
            return fail("player not initialised — call player_init first")
        }
        val root = try {
            JSONObject(payload)
        } catch (e: Exception) {
            return fail("bad JSON payload: ${e.message}")
        }
        val url = root.optString("url").orEmpty()
        val audioUrl = root.optString("audioUrl").orEmpty()
        val headers = root.optJSONObject("headers")
        val headerMap: Map<String, String> = if (headers != null) {
            val keys = headers.keys()
            buildMap {
                while (keys.hasNext()) {
                    val k = keys.next()
                    put(k, headers.optString(k))
                }
            }
        } else {
            emptyMap()
        }
        if (url.isBlank()) return fail("missing url")

        return try {
            val source = buildMediaSource(url, audioUrl, headerMap)
            p.setMediaSource(source)
            p.prepare()
            ensureOverlay()
            ok()
        } catch (t: Throwable) {
            fail("load failed: ${t.message}")
        }
    }

    // ---------- playback control (THE FIX) ----------

    /**
     * **THE FIX.** `setPlayWhenReady(true)` — synchronous, native, never lost.
     * No JavaScript evaluation, no iframe bridge, no `postMessage`.
     */
    @JvmStatic
    fun play() {
        player?.setPlayWhenReady(true)
            ?: Log.w(TAG, "play: player is null (not initialised)")
    }

    /**
     * **THE FIX.** `setPlayWhenReady(false)` — synchronous, native, never lost.
     */
    @JvmStatic
    fun pause() {
        player?.setPlayWhenReady(false)
            ?: Log.w(TAG, "pause: player is null (not initialised)")
    }

    @JvmStatic
    fun seekTo(positionMs: Long) {
        player?.seekTo(positionMs.coerceAtLeast(0))
    }

    /**
     * `setPlaybackParameters(PlaybackParameters(speed))`. ExoPlayer supports
     * up to 3.0× with pitch correction; values above 3.0 are clamped by the
     * Rust side before reaching here.
     */
    @JvmStatic
    fun setSpeed(speed: Float) {
        val s = if (speed.isNaN() || speed <= 0f) 1f else speed
        player?.setPlaybackParameters(PlaybackParameters(s))
    }

    @JvmStatic
    fun getPosition(): Long = player?.currentPosition ?: 0L

    @JvmStatic
    fun getDuration(): Long {
        val p = player ?: return 0L
        val d = p.duration
        return if (d == androidx.media3.common.C.TIME_UNSET) 0L else d
    }

    // ---------- overlay positioning ----------

    /**
     * Position the [PlayerView] overlay at `(x, y, w, h)` in device pixels
     * relative to the host Activity's content view. Called by the React
     * `PlayerView` component on mount/resize/scroll so the native overlay
     * tracks the placeholder div.
     */
    @JvmStatic
    fun setViewport(x: Float, y: Float, w: Float, h: Float) {
        viewport = floatArrayOf(x, y, w, h)
        playerView?.let { applyViewport(it, x, y, w, h) }
    }

    // ---------- internals ----------

    private fun buildMediaSourceFactory(context: Context): DefaultMediaSourceFactory {
        val http = OkHttpDataSource.Factory(okHttpClient)
            .setUserAgent("LookOn/1.0")
        val defaultDs = DefaultDataSource.Factory(context, http)
        return DefaultMediaSourceFactory(defaultDs)
    }

    /**
     * Build a [MediaSource] for the given URL. If `audioUrl` is non-empty we
     * build a [MergingMediaSource] (video + audio) — this is the standard
     * ExoPlayer pattern for YouTube's adaptive streams where muxed (mp4) is
     * not available at the requested quality.
     *
     * Custom HTTP headers (e.g. the YouTube `Referer`, `Origin`, `User-Agent`
     * that the stream URL is bound to) are applied via the per-request
     * `setDefaultRequestProperties` map on the data source factory.
     */
    private fun buildMediaSource(
        url: String,
        audioUrl: String,
        headers: Map<String, String>,
    ): MediaSource {
        val httpFactory = OkHttpDataSource.Factory(okHttpClient)
            .setUserAgent("LookOn/1.0")
            .setDefaultRequestProperties(headers)

        val video = ProgressiveMediaSource.Factory(httpFactory)
            .createMediaSource(MediaItem.fromUri(url))

        if (audioUrl.isBlank()) return video

        val audio = ProgressiveMediaSource.Factory(httpFactory)
            .createMediaSource(MediaItem.fromUri(audioUrl))
        return MergingMediaSource(audio, video)
    }

    /**
     * Attach (or reposition) the [PlayerView] overlay on the host Activity.
     * We add it to the Activity's content view (a FrameLayout by default) with
     * `MATCH_PARENT` × `MATCH_PARENT` layout params, then translate + scale it
     * to the reported viewport in [applyViewport].
     */
    private fun ensureOverlay() {
        val activity = hostActivity ?: return
        val p = player ?: return
        if (playerView != null) {
            playerView!!.player = p
            applyViewport(playerView!!, viewport[0], viewport[1], viewport[2], viewport[3])
            return
        }
        val pv = PlayerView(activity).apply {
            useController = false // we render our own controls in React
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
        }
        pv.player = p
        // Attach to the Activity's root content view — that's a FrameLayout
        // (android.R.id.content) so adding a child overlays the WebView.
        // We add at the end (top of the Z-order) so the video renders in
        // front of the WebView chrome.
        val content = activity.findViewById<ViewGroup>(android.R.id.content)
        content.addView(pv)
        playerView = pv
        applyViewport(pv, viewport[0], viewport[1], viewport[2], viewport[3])
        Log.i(TAG, "overlay attached to ${content.javaClass.simpleName}")
    }

    private fun applyViewport(view: View, x: Float, y: Float, w: Float, h: Float) {
        if (w <= 0f || h <= 0f) {
            view.visibility = View.GONE
            return
        }
        view.visibility = View.VISIBLE
        view.translationX = x
        view.translationY = y
        val lp = view.layoutParams
        if (lp != null) {
            lp.width = w.toInt().coerceAtLeast(1)
            lp.height = h.toInt().coerceAtLeast(1)
            view.layoutParams = lp
        }
    }

    /**
     * Walk the context chain to find the host Activity. The application
     * context that Tauri hands us isn't an Activity, but we need one to attach
     * the overlay View. As a fallback we keep a reference set by
     * [PlayerPlugin.onAttach] (the Tauri plugin lifecycle hook).
     */
    private fun resolveActivity(context: Context): Activity? {
        var c: Context? = context
        while (c != null) {
            if (c is Activity) return c
            c = if (c is android.content.ContextWrapper) c.baseContext else null
        }
        return null
    }

    /**
     * Resolve the application context from the current Activity thread.
     * Uses Android's static ActivityThread API as a fallback.
     */
    private fun resolveAppContext(): Context? {
        return try {
            val activityThread = Class.forName("android.app.ActivityThread")
            val method = activityThread.getDeclaredMethod("currentApplication")
            method.isAccessible = true
            method.invoke(null) as? Context
        } catch (e: Exception) {
            Log.e(TAG, "resolveAppContext failed: ${e.message}")
            null
        }
    }

    private fun ok(): String = """{"ok":true,"error":null}"""
    private fun fail(msg: String): String {
        Log.e(TAG, "loadJson: $msg")
        return """{"ok":false,"error":${JSONObject.quote(msg)}}"""
    }
}
