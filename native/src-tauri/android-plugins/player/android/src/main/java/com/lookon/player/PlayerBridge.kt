package com.lookon.player

import android.content.Context
import android.util.Log
import android.webkit.JavascriptInterface
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.ui.PlayerView
import okhttp3.OkHttpClient
import org.json.JSONObject
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.os.Handler
import android.os.Looper
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * JavaScript bridge for ExoPlayer — exposed to the Tauri WebView as
 * `window.lookonPlayer`. The frontend calls methods directly:
 *
 *   window.lookonPlayer.init()
 *   window.lookonPlayer.load(JSON.stringify({url, headers, audioUrl}))
 *   window.lookonPlayer.play()
 *   window.lookonPlayer.pause()
 *   window.lookonPlayer.setSpeed(2.0)
 *   window.lookonPlayer.getPosition()
 *   window.lookonPlayer.getDuration()
 *   window.lookonPlayer.setViewport(x, y, w, h)
 *   window.lookonPlayer.release()
 *
 * This avoids JNI ClassLoader issues entirely — the WebView's JS engine
 * can always find the class because it's registered via addJavascriptInterface.
 */
class PlayerBridge(private val context: Context) {

    private val TAG = "LookOnPlayer"
    private var player: ExoPlayer? = null
    private var playerView: PlayerView? = null
    private val okHttpClient: OkHttpClient by lazy { OkHttpClient.Builder().build() }
    private val mainHandler by lazy { Handler(Looper.getMainLooper()) }
    private var viewport: FloatArray = floatArrayOf(0f, 0f, 0f, 0f)

    @JavascriptInterface
    fun init() {
        if (player != null) return
        val latch = CountDownLatch(1)
        mainHandler.post {
            try {
                player = ExoPlayer.Builder(context)
                    .setMediaSourceFactory(buildMediaSourceFactory(context))
                    .build()
                    .also { it.repeatMode = Player.REPEAT_MODE_OFF }
                Log.i(TAG, "ExoPlayer created")
            } catch (t: Throwable) {
                Log.e(TAG, "ExoPlayer creation failed", t)
            } finally {
                latch.countDown()
            }
        }
        latch.await(5, TimeUnit.SECONDS)
    }

    @JavascriptInterface
    fun load(payload: String): String {
        val p = player ?: return """{"ok":false,"error":"not initialised"}"""
        val root = try { JSONObject(payload) } catch (e: Exception) {
            return """{"ok":false,"error":"bad json: ${e.message}"}"""
        }
        val url = root.optString("url")
        val audioUrl = root.optString("audioUrl")
        val headers = root.optJSONObject("headers")
        val headerMap = mutableMapOf<String, String>()
        if (headers != null) {
            val keys = headers.keys()
            while (keys.hasNext()) { val k = keys.next(); headerMap[k] = headers.optString(k) }
        }
        if (url.isBlank()) return """{"ok":false,"error":"missing url"}"""

        var errorMsg: String? = null
        val latch = CountDownLatch(1)
        mainHandler.post {
            try {
                val source = buildMediaSource(url, audioUrl, headerMap)
                p.setMediaSource(source)
                p.prepare()
                ensureOverlay()
            } catch (t: Throwable) {
                errorMsg = "load failed: ${t.message}"
                Log.e(TAG, "load error", t)
            } finally {
                latch.countDown()
            }
        }
        latch.await(5, TimeUnit.SECONDS)
        return if (errorMsg != null) """{"ok":false,"error":${JSONObject.quote(errorMsg)}}""" else """{"ok":true,"error":null}"""
    }

    @JavascriptInterface
    fun play() {
        mainHandler.post { player?.setPlayWhenReady(true) }
    }

    @JavascriptInterface
    fun pause() {
        mainHandler.post { player?.setPlayWhenReady(false) }
    }

    @JavascriptInterface
    fun seekTo(positionMs: Long) {
        mainHandler.post { player?.seekTo(positionMs.coerceAtLeast(0)) }
    }

    @JavascriptInterface
    fun setSpeed(speed: Float) {
        val s = if (speed.isNaN() || speed <= 0f) 1f else speed
        mainHandler.post { player?.setPlaybackParameters(PlaybackParameters(s)) }
    }

    @JavascriptInterface
    fun getPosition(): Long = player?.currentPosition ?: 0L

    @JavascriptInterface
    fun getDuration(): Long {
        val p = player ?: return 0L
        val d = p.duration
        return if (d == androidx.media3.common.C.TIME_UNSET) 0L else d
    }

    @JavascriptInterface
    fun setViewport(x: Float, y: Float, w: Float, h: Float) {
        viewport = floatArrayOf(x, y, w, h)
        mainHandler.post {
            playerView?.let { applyViewport(it, x, y, w, h) }
        }
    }

    @JavascriptInterface
    fun release() {
        val latch = CountDownLatch(1)
        mainHandler.post {
            try {
                playerView?.let { pv ->
                    pv.player = null
                    (pv.parent as? ViewGroup)?.removeView(pv)
                    pv.removeAllViews()
                }
                playerView = null
                player?.release()
                player = null
            } catch (t: Throwable) {
                Log.e(TAG, "release failed", t)
            } finally {
                latch.countDown()
            }
        }
        latch.await(2, TimeUnit.SECONDS)
    }

    // ---------- internals ----------

    private fun buildMediaSourceFactory(context: Context): DefaultDataSource.Factory {
        val http = OkHttpDataSource.Factory(okHttpClient).setUserAgent("LookOn/1.0")
        return DefaultDataSource.Factory(context, http)
    }

    private fun buildMediaSource(url: String, audioUrl: String, headers: Map<String, String>): androidx.media3.exoplayer.source.MediaSource {
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

    private fun ensureOverlay() {
        val p = player ?: return
        if (playerView != null) {
            playerView!!.player = p
            applyViewport(playerView!!, viewport[0], viewport[1], viewport[2], viewport[3])
            return
        }
        // Find the Activity from context
        var ctx: Context? = context
        var activity: android.app.Activity? = null
        while (ctx != null) {
            if (ctx is android.app.Activity) { activity = ctx; break }
            ctx = if (ctx is android.content.ContextWrapper) ctx.baseContext else null
        }
        if (activity == null) { Log.e(TAG, "no Activity for overlay"); return }

        val pv = PlayerView(activity).apply {
            useController = false
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
        }
        pv.player = p
        val content = activity.findViewById<ViewGroup>(android.R.id.content)
        content.addView(pv)
        playerView = pv
        applyViewport(pv, viewport[0], viewport[1], viewport[2], viewport[3])
        Log.i(TAG, "overlay attached")
    }

    private fun applyViewport(view: View, x: Float, y: Float, w: Float, h: Float) {
        if (w <= 0f || h <= 0f) { view.visibility = View.GONE; return }
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
}
