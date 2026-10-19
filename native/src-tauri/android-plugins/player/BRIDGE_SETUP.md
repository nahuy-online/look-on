# Player Bridge Registration

After `cargo tauri android init`, you need to register the PlayerBridge
JavaScript interface in the generated MainActivity.

## Steps

1. Open `src-tauri/gen/android/app/src/main/java/com/lookon/app/MainActivity.kt`

2. Add these imports at the top:
```kotlin
import com.lookon.player.PlayerBridge
import android.webkit.WebView
```

3. Inside the `MainActivity` class, add:
```kotlin
override fun onWebViewCreated(webView: WebView) {
    super.onWebViewCreated(webView)
    webView.addJavascriptInterface(PlayerBridge(this), "lookonPlayer")
    android.util.Log.i("LookOnPlayer", "PlayerBridge registered as window.lookonPlayer")
}
```

If `onWebViewCreated` doesn't exist (depends on Tauri version), use this instead:
```kotlin
// In onCreate, after super.onCreate:
// The WebView is created by Tauri's ndk_glue. We need to find it and
// register our JavascriptInterface. Since we can't hook into the WebView
// creation directly, we use a delayed handler.
android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
    try {
        val webView = findViewById<android.webkit.WebView>(android.R.id.content)
            ?.findViewById<android.webkit.WebView>(android.R.id.content)
        if (webView != null) {
            webView.addJavascriptInterface(PlayerBridge(this), "lookonPlayer")
            android.util.Log.i("LookOnPlayer", "PlayerBridge registered")
        }
    } catch (e: Exception) {
        android.util.Log.e("LookOnPlayer", "Failed to register PlayerBridge: ${e.message}")
    }
}, 500)
```

## Alternative: use window.prompt interception

If addJavascriptInterface doesn't work, we can intercept `window.prompt()` calls
from the WebView and route them to PlayerBridge methods. Tauri's WebView
supports `WebChromeClient.onJsPrompt()`.

## Verify

After registration, the frontend can call:
```javascript
window.lookonPlayer.init()
window.lookonPlayer.load(JSON.stringify({url: "...", headers: {}}))
window.lookonPlayer.play()
window.lookonPlayer.pause()
window.lookonPlayer.setSpeed(2.0)
```
