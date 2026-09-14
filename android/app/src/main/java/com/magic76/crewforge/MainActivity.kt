package com.magic76.crewforge

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            setBackgroundColor(android.graphics.Color.rgb(9, 12, 18))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mediaPlaybackRequiresUserGesture = false
            addJavascriptInterface(ForgeNativeBridge(this@MainActivity), "CrewNative")
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    val uri = request?.url ?: return false
                    if (uri.host == "127.0.0.1" || uri.host == "localhost") return false
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

        val bundled = html
            .replace("<link rel=\"stylesheet\" href=\"./forge.css\" />", "<style>$css</style>")
            .replace("<script src=\"./forge.js\"></script>", "<script>$js</script>")

        // Deliberately use the Crew Pocket local server as the document base URL.
        // Relative /api/* requests are therefore same-origin and keep SSE streaming intact.
        webView.loadDataWithBaseURL(
            "http://127.0.0.1:8000/",
            bundled,
            "text/html",
            "UTF-8",
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
