package com.crewpocket.crewbuilder

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var nativeBridge: ForgeNativeBridge

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        nativeBridge = ForgeNativeBridge(this, { resolveGemini(it) }, { resolveLive(it) })
        webView = WebView(this).apply {
            setBackgroundColor(android.graphics.Color.rgb(9, 12, 18))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mediaPlaybackRequiresUserGesture = false
            addJavascriptInterface(nativeBridge, "CrewNative")
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    val uri = request?.url ?: return false
                    if (uri.host == "app.crewbuilder.local") return false
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    return true
                }
            }
        }
        setContentView(webView)
        loadBuilder()
    }

    private fun loadBuilder() {
        val html = assets.open("forge/index.html").bufferedReader().use { it.readText() }
        val css = assets.open("forge/forge.css").bufferedReader().use { it.readText() }
        val geminiCss = assets.open("forge/gemini.css").bufferedReader().use { it.readText() }
        val js = assets.open("forge/forge.js").bufferedReader().use { it.readText() }
        val nativeAdapter = assets.open("forge/native-adapter.js").bufferedReader().use { it.readText() }
        val liveRuntime = assets.open("forge/live-runtime.js").bufferedReader().use { it.readText() }
        val uiRuntime = assets.open("forge/ui-runtime.js").bufferedReader().use { it.readText() }
        val bundled = html
            .replace("<link rel=\"stylesheet\" href=\"./forge.css\" />", "<style>$css</style>")
            .replace("<link rel=\"stylesheet\" href=\"./gemini.css\" />", "<style>$geminiCss</style>")
            .replace("<script src=\"./forge.js\"></script>", "<script>$js</script>")
            .replace("<script src=\"./native-adapter.js\"></script>", "<script>$nativeAdapter</script>")
            .replace("<script src=\"./live-runtime.js\"></script>", "<script>$liveRuntime</script>")
            .replace("<script src=\"./ui-runtime.js\"></script>", "<script>$uiRuntime</script>")
        webView.loadDataWithBaseURL("https://app.crewbuilder.local/", bundled, "text/html", "UTF-8", null)
    }

    private fun sendJs(function: String, payload: String) {
        if (!::webView.isInitialized) return
        val quoted = JSONObject.quote(payload)
        runOnUiThread { webView.evaluateJavascript("$function && $function($quoted)", null) }
    }

    fun resolveGemini(payload: String) = sendJs("window.__crewGeminiResolve", payload)
    fun resolveLive(payload: String) = sendJs("window.__crewLiveEvent", payload)

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        nativeBridge.destroy()
        webView.removeJavascriptInterface("CrewNative")
        webView.destroy()
        super.onDestroy()
    }
}
