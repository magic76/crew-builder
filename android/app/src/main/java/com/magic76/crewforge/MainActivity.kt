package com.magic76.crewforge

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            id = android.R.id.content
            setBackgroundColor(android.graphics.Color.rgb(9, 12, 18))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mediaPlaybackRequiresUserGesture = false
            addJavascriptInterface(
                ForgeNativeBridge(this@MainActivity) { payload -> resolveGemini(payload) },
                "CrewNative"
            )
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    val uri = request?.url ?: return false
                    if (uri.host == "app.crewforge.local") return false
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    return true
                }
            }
        }

        setContentView(webView)
        loadForge()
    }

    private fun loadForge() {
        val html = assets.open("forge/index.html").bufferedReader().use { it.readText() }
        val css = assets.open("forge/forge.css").bufferedReader().use { it.readText() }
        val js = assets.open("forge/forge.js").bufferedReader().use { it.readText() }
        val nativeAdapter = assets.open("forge/native-adapter.js").bufferedReader().use { it.readText() }

        val bundled = html
            .replace("<link rel=\"stylesheet\" href=\"./forge.css\" />", "<style>$css</style>")
            .replace("<script src=\"./forge.js\"></script>", "<script>$js</script>")
            .replace("<script src=\"./native-adapter.js\"></script>", "<script>$nativeAdapter</script>")

        // Stable HTTPS-like origin for DOM storage. Gemini traffic goes through CrewNative,
        // so the APK no longer requires Crew Pocket or a localhost server.
        webView.loadDataWithBaseURL(
            "https://app.crewforge.local/",
            bundled,
            "text/html",
            "UTF-8",
            null
        )
    }

    fun resolveGemini(payload: String) {
        if (!::webView.isInitialized) return
        val quoted = JSONObject.quote(payload)
        webView.evaluateJavascript(
            "window.__crewGeminiResolve && window.__crewGeminiResolve($quoted)",
            null
        )
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }

    override fun onDestroy() {
        webView.removeJavascriptInterface("CrewNative")
        webView.destroy()
        super.onDestroy()
    }
}
