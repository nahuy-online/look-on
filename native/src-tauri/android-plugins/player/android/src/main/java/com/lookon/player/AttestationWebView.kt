package com.lookon.player

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Hidden WebView that loads a YouTube embed page and extracts the InnerTube
 * attestation material: the `INNERTUBE_API_KEY`, the `VISITOR_DATA`, and
 * (optionally) a `PO_TOKEN` produced by YouTube's botguard challenge.
 *
 * The flow (a simplified port of Obereg's `TokenProbe`):
 *
 *  1. Load `https://www.youtube.com/embed/<video_id>` in a 1×1 transparent
 *     WebView with JavaScript enabled.
 *  2. On `onPageFinished`, evaluate [REPORT_SCRIPT] — a single JS expression
 *     that returns `{ "apiKey": "...", "visitorData": "...", "hasPlayer": ... }`.
 *  3. Optionally, kick off [CHALLENGE_SCRIPT] (the `att/get` POST) and poll
 *     [CHALLENGE_POLL_SCRIPT] for the result. The full 8-stage botguard
 *     program-loading + VM-execution + token-minting flow (Obereg's
 *     `step7Script` / `mintScript`) is left as a TODO — see [mintPoToken].
 *
 * The Kotlin [getToken] method blocks the calling thread (Rust runs it on a
 * `spawn_blocking` task) until the WebView finishes (or the 15 s timeout
 * expires) and returns a JSON string the Rust side deserialises.
 *
 * Reference: `/tmp/obereg/android/app/src/main/java/app/obereg/player/tokenprobe.kt`
 * is the canonical implementation we ported from.
 */
object AttestationWebView {
    private const val TAG = "LookOnAttest"
    private const val TIMEOUT_SEC = 15L

    /** Canonical probe video — the page that always loads + has ytcfg. */
    private const val PROBE_VIDEO_ID = "dQw4w9WgXcQ"

    /**
     * Synchronously fetch the attestation material for `videoId`.
     *
     * @return JSON string `{"apiKey": "...", "visitorData": "...", "poToken": null}`
     *         (poToken is non-null only when the full botguard mint succeeds —
     *         currently always null; see [mintPoToken]).
     */
    @JvmStatic
    fun getToken(videoId: String): String {
        val ctx = ExoPlayerManager.applicationContext()
            ?: return errorJson("no Android context available")
        val id = videoId.ifBlank { PROBE_VIDEO_ID }

        val latch = CountDownLatch(1)
        val resultRef = AtomicReference<String?>(null)
        val main = Handler(Looper.getMainLooper())

        // WebView MUST be created + configured on the UI thread.
        main.post {
            try {
                runOnUi(ctx, id, latch, resultRef)
            } catch (t: Throwable) {
                Log.e(TAG, "attestation failed", t)
                resultRef.set(errorJson("ui exception: ${t.message}"))
                latch.countDown()
            }
        }

        try {
            if (!latch.await(TIMEOUT_SEC, TimeUnit.SECONDS)) {
                Log.w(TAG, "attestation timed out after ${TIMEOUT_SEC}s")
                main.post { resultRef.get()?.let {} } // no-op to keep lint happy
                return errorJson("attestation timed out after ${TIMEOUT_SEC}s")
            }
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            return errorJson("attestation interrupted")
        }

        return resultRef.get() ?: errorJson("attestation returned no result")
    }

    // ---------- UI-thread body ----------

    private fun runOnUi(
        ctx: Context,
        videoId: String,
        latch: CountDownLatch,
        resultRef: AtomicReference<String?>,
    ) {
        val webView = WebView(ctx).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.userAgentString = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
            setLayerType(android.view.View.LAYER_TYPE_NONE, null)
            setBackgroundColor(0x00000000)
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    Log.d(TAG, "onPageFinished: $url")
                    // Give ytcfg a moment to populate — the embed page bootstraps
                    // it lazily after the document is parsed.
                    view?.postDelayed({
                        view?.evaluateJavascript(REPORT_SCRIPT) { raw ->
                            handleReport(view, videoId, raw, latch, resultRef)
                        }
                    }, 600L)
                }
            }
            webChromeClient = WebChromeClient()
        }

        val embedUrl = "https://www.youtube.com/embed/$videoId?hl=en&gl=US"
        Log.i(TAG, "loading embed: $embedUrl")
        webView.loadUrl(embedUrl)
    }

    private fun handleReport(
        view: WebView?,
        videoId: String,
        raw: String?,
        latch: CountDownLatch,
        resultRef: AtomicReference<String?>,
    ) {
        val text = decodeJsString(raw).orEmpty()
        Log.d(TAG, "report raw: ${text.take(200)}")
        val root = runCatching { JSONObject(text) }.getOrNull()
        if (root == null) {
            resultRef.set(errorJson("report JSON parse failed: ${text.take(120)}"))
            latch.countDown()
            return
        }
        val apiKey = root.optString("apiKey").orEmpty()
        val visitorData = root.optString("visitorData").orEmpty()
        if (apiKey.isBlank()) {
            // ytcfg might not be ready yet — retry once after 1.5 s.
            view?.postDelayed({
                view?.evaluateJavascript(REPORT_SCRIPT) { second ->
                    val s = decodeJsString(second).orEmpty()
                    val r2 = runCatching { JSONObject(s) }.getOrNull()
                    val key2 = r2?.optString("apiKey").orEmpty()
                    val vis2 = r2?.optString("visitorData").orEmpty()
                    finishReport(view, videoId, key2, vis2, latch, resultRef)
                }
            }, 1500L)
            return
        }
        finishReport(view, videoId, apiKey, visitorData, latch, resultRef)
    }

    private fun finishReport(
        view: WebView?,
        videoId: String,
        apiKey: String,
        visitorData: String,
        latch: CountDownLatch,
        resultRef: AtomicReference<String?>,
    ) {
        // PO-token minting via the full botguard VM flow is intentionally left
        // as a TODO here — see [mintPoToken]. The VISIONOS client profile used
        // by `yt_extract` works without a PO token for the vast majority of
        // videos, so this returns `poToken: null` for now.
        val poToken: String? = try { mintPoToken(view, videoId, apiKey, visitorData) } catch (t: Throwable) {
            Log.w(TAG, "mintPoToken failed (non-fatal): ${t.message}")
            null
        }
        val out = JSONObject()
            .put("apiKey", apiKey)
            .put("visitorData", visitorData)
        // JSONObject.put(key, null) *removes* the key, so to emit an explicit
        // JSON `null` we have to use JSONObject.NULL.
        out.put("poToken", if (poToken != null) poToken else JSONObject.NULL)
        val result = out.toString()
        Log.i(TAG, "attestation ok: apiKey=${apiKey.take(8)}… visitorData=${visitorData.take(8)}… poToken=${if (poToken != null) "yes" else "no"}")
        resultRef.set(result)
        latch.countDown()
    }

    /**
     * Attempt the full botguard → integrity-token → PO-token minting flow.
     *
     * This is a **stub** that always returns `null` — the full 8-stage flow
     * (Obereg's `challengeScript` → `challengeDetailScript` → `programCheckScript`
     * → `programIntrospectScript` → `interpreterFindScript` → `step7Script` →
     * `mintScript` → `mintPollScript`) needs to be ported from
     * `/tmp/obereg/android/app/src/main/java/app/obereg/player/tokenprobe.kt`.
     *
     * The challenge scripts are large (~600 lines of JS) and require:
     *  - multiple `evaluateJavascript` round-trips with 300-600 ms polling,
     *  - downloading + `eval`-ing the botguard interpreter from the URL found
     *    in the `att/get` response,
     *  - running the botguard VM to produce a snapshot,
     *  - exchanging the snapshot for an integrity token via the WAA `/Create`
     *    endpoint, then
     *  - calling the minter function with the integrity token to get the
     *    final PO token bound to `videoId`.
     *
     * For now we return `null` and rely on the VISIONOS profile. When this
     * returns a non-null token, the Rust `yt_extract` command attaches it as
     * `serviceIntegrityDimensions.poToken` for the WEB/MWEB profiles.
     */
    private fun mintPoToken(
        view: WebView?,
        videoId: String,
        apiKey: String,
        visitorData: String,
    ): String? {
        // TODO: port Obereg's `challengeScript` + `step7Script` + `mintScript`.
        // The VISIONOS profile works without a PO token, so this is only
        // needed for age-restricted or region-locked content.
        val _ = listOf(view, videoId, apiKey, visitorData)
        return null
    }

    // ---------- helpers ----------

    /**
     * `WebView.evaluateJavascript` returns the JavaScript value JSON-encoded
     * (so a JS string `"foo"` comes back as the 5-char Kotlin string `"\"foo\""`,
     * and a JS object `{a:1}` comes back as `"{\"a\":1}"`). To get the raw JS
     * value back as a Kotlin string we wrap it in a JSON array and pull the
     * first element — `optString` on a JSONObject element returns its JSON
     * text, on a string element returns the unquoted string, on a number
     * returns its decimal text.
     */
    private fun decodeJsString(raw: String?): String? {
        if (raw.isNullOrBlank() || raw == "null") return null
        return runCatching { org.json.JSONArray("[$raw]").optString(0) }.getOrNull() ?: raw
    }

    private fun errorJson(msg: String): String {
        Log.e(TAG, msg)
        return JSONObject()
            .put("apiKey", "")
            .put("visitorData", "")
            .put("poToken", JSONObject.NULL)
            .put("error", msg)
            .toString()
    }

    // ---------- JavaScript snippets (ported from Obereg's TokenProbe) ----------

    /**
     * Report script: returns a compact JSON with the YouTube page's
     * `INNERTUBE_API_KEY`, `VISITOR_DATA`, and a few diagnostic flags.
     *
     * Ported from `TokenProbe.reportScript()` in
     * `/tmp/obereg/android/app/src/main/java/app/obereg/player/tokenprobe.kt`.
     */
    private val REPORT_SCRIPT: String = """
        (function(){
          try {
            var out = { apiKey: '', visitorData: '', hasYtcfg: false, hasPlayer: false, url: location.href };
            try {
              if (typeof ytcfg !== 'undefined' && ytcfg.get) {
                out.hasYtcfg = true;
                out.apiKey = ytcfg.get('INNERTUBE_API_KEY') || '';
                out.visitorData = ytcfg.get('VISITOR_DATA') || '';
              }
            } catch (e) { out.ytcfgError = String(e).slice(0, 120); }
            try {
              // ytcfg isn't always populated immediately on the embed page.
              // Fall back to scraping the page HTML for the key.
              if (!out.apiKey) {
                var html = document.documentElement.innerHTML || '';
                var m = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
                if (m) { out.apiKey = m[1]; }
              }
              if (!out.visitorData) {
                var html2 = document.documentElement.innerHTML || '';
                var m2 = html2.match(/"visitorData":"([^"]+)"/);
                if (m2) { out.visitorData = m2[1]; }
              }
            } catch (e2) { out.scrapeError = String(e2).slice(0, 120); }
            out.hasPlayer = !!document.querySelector('#movie_player');
            return JSON.stringify(out);
          } catch (e) {
            return JSON.stringify({error: String(e)});
          }
        })()
    """.trimIndent()

    /**
     * Challenge script: kicks off the `att/get` POST (the botguard challenge
     * fetch) and stores the result on `window.__lookonChallenge`. Ported (and
     * simplified) from Obereg's `TokenProbe.challengeScript()`.
     *
     * Currently unused — kept here so the full minting flow can be wired up
     * without re-deriving the URL/headers. See [mintPoToken].
     */
    @Suppress("unused")
    private val CHALLENGE_SCRIPT: String = """
        (function(){
          window.__lookonChallenge = '';
          try {
            if (typeof ytcfg === 'undefined' || !ytcfg.get) {
              window.__lookonChallenge = JSON.stringify({error: 'no ytcfg'});
              return 'started';
            }
            var context = ytcfg.get('INNERTUBE_CONTEXT');
            var key = ytcfg.get('INNERTUBE_API_KEY');
            if (!context || !key) {
              window.__lookonChallenge = JSON.stringify({error: 'no context or key'});
              return 'started';
            }
            fetch('/youtubei/v1/att/get?key=' + key + '&prettyPrint=false', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({context: context})
            }).then(function(r){
              return r.text().then(function(text){
                window.__lookonChallenge = JSON.stringify({status: r.status, length: text.length, head: text.slice(0, 240)});
              });
            }).catch(function(e){
              window.__lookonChallenge = JSON.stringify({error: 'network: ' + String(e)});
            });
            return 'started';
          } catch (e) {
            window.__lookonChallenge = JSON.stringify({error: String(e)});
            return 'started';
          }
        })()
    """.trimIndent()

    @Suppress("unused")
    private val CHALLENGE_POLL_SCRIPT: String = "(window.__lookonChallenge || '')"
}
