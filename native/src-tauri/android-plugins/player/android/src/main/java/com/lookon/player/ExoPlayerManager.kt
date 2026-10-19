package com.lookon.player

import android.app.Activity
import android.content.Context
import android.os.Handler
import android.os.Looper
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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

object ExoPlayerManager {
    private const val TAG = "LookOnPlayer"

    @Volatile
    private var player: ExoPlayer? = null

    @Volatile
    private var playerView: PlayerView? = null

    @Volatile
    private var hostActivity: Activity? = null

    @Volatile
    private var appContext: Context? = null

    @JvmStatic
    fun applicationContext(): Context? = appContext

    private val okHttpClient: OkHttpClient by lazy { OkHttpClient.Builder().build() }

    @Volatile
    private var viewport: FloatArray = floatArrayOf(0f, 0f, 0f, 0f)

    private val mainHandler by lazy { Handler(Looper.getMainLooper()) }

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

        // ExoPlayer MUST be created on the UI thread
        val latch = CountDownLatch(1)
        mainHandler.post {
            try {
                val app = context.applicationContext
                player = ExoPlayer.Builder(app)
                    .setMediaSourceFactory(buildMediaSourceFactory(app))
                    .build()
                    .also { it.repeatMode = Player.REPEAT_MODE_OFF }
                Log.i(TAG, "ExoPlayer created on UI thread")
            } catch (t: Throwable) {
                Log.e(TAG, "ExoPlayer creation failed", t)
            } finally {
                latch.countDown()
            }
        }
        latch.await(5, TimeUnit.SECONDS)
    }

    @JvmStatic
    fun release() {
        Log.i(TAG, "release")
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
                hostActivity = null
            } catch (t: Throwable) {
                Log.e(TAG, "release failed", t)
            } finally {
                latch.countDown()
            }
        }
        latch.await(2, TimeUnit.SECONDS)
    }

    @JvmStatic
    fun loadJson(payload: String): String {
        val p = player ?: return fail("player not initialised — call player_init first")
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
                Log.e(TAG, "loadJson error", t)
            } finally {
                latch.countDown()
            }
        }
        latch.await(5, TimeUnit.SECONDS)
        return if (errorMsg != null) fail(errorMsg!!) else ok()
    }

    @JvmStatic
    fun play() {
        player?.setPlayWhenReady(true)
    }

    @JvmStatic
    fun pause() {
        player?.setPlayWhenReady(false)
    }

    @JvmStatic
    fun seekTo(positionMs: Long) {
        player?.seekTo(positionMs.coerceAtLeast(0))
    }

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

    @JvmStatic
    fun setViewport(x: Float, y: Float, w: Float, h: Float) {
        viewport = floatArrayOf(x, y, w, h)
        mainHandler.post {
            playerView?.let { applyViewport(it, x, y, w, h) }
        }
    }

    // ---------- internals ----------

    private fun buildMediaSourceFactory(context: Context): DefaultMediaSourceFactory {
        val http = OkHttpDataSource.Factory(okHttpClient)
            .setUserAgent("LookOn/1.0")
        val defaultDs = DefaultDataSource.Factory(context, http)
        return DefaultMediaSourceFactory(defaultDs)
    }

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

    private fun ensureOverlay() {
        val activity = hostActivity ?: return
        val p = player ?: return
        if (playerView != null) {
            playerView!!.player = p
            applyViewport(playerView!!, viewport[0], viewport[1], viewport[2], viewport[3])
            return
        }
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

    private fun resolveActivity(context: Context): Activity? {
        var c: Context? = context
        while (c != null) {
            if (c is Activity) return c
            c = if (c is android.content.ContextWrapper) c.baseContext else null
        }
        return null
    }

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
