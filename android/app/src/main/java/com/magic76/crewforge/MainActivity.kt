package com.crewpocket.crewbuilder

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Bundle
import android.os.SystemClock
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import kotlin.math.sqrt

class MainActivity : Activity(), SensorEventListener {
    private lateinit var webView: WebView
    private lateinit var nativeBridge: ForgeNativeBridge
    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private var lastSensorDispatch = 0L
    private var lastShakeDispatch = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        nativeBridge = ForgeNativeBridge(this, { resolveGemini(it) }, { resolveLive(it) })
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
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

    override fun onResume() {
        super.onResume()
        accelerometer?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
    }

    override fun onPause() {
        sensorManager.unregisterListener(this)
        super.onPause()
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type != Sensor.TYPE_ACCELEROMETER || event.values.size < 3) return
        val x = event.values[0]
        val y = event.values[1]
        val z = event.values[2]
        val now = SystemClock.elapsedRealtime()
        if (now - lastSensorDispatch >= 80) {
            lastSensorDispatch = now
            sendSensorEvent(JSONObject().put("type", "accelerometer").put("x", x).put("y", y).put("z", z).put("timestamp", System.currentTimeMillis()).toString())
        }
        val g = sqrt((x * x + y * y + z * z).toDouble()) / SensorManager.GRAVITY_EARTH
        if (g >= 2.35 && now - lastShakeDispatch >= 850) {
            lastShakeDispatch = now
            sendSensorEvent(JSONObject().put("type", "shake").put("strength", g).put("timestamp", System.currentTimeMillis()).toString())
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun loadBuilder() {
        val html = asset("index.html")
        val bundled = html
            .replace("<link rel=\"stylesheet\" href=\"./forge.css\" />", "<style>${asset("forge.css")}</style>")
            .replace("<link rel=\"stylesheet\" href=\"./gemini.css\" />", "<style>${asset("gemini.css")}</style>")
            .replace("<script src=\"./forge.js\"></script>", "<script>${asset("forge.js")}</script>")
            .replace("<script src=\"./native-adapter.js\"></script>", "<script>${asset("native-adapter.js")}</script>")
            .replace("<script src=\"./live-runtime.js\"></script>", "<script>${asset("live-runtime.js")}</script>")
            .replace("<script src=\"./ui-runtime.js\"></script>", "<script>${asset("ui-runtime.js")}</script>")
            .replace("<script src=\"./builder-ux.js\"></script>", "<script>${asset("builder-ux.js")}</script>")
            .replace("<script src=\"./builder-next.js\"></script>", "<script>${asset("builder-next.js")}</script>")
        webView.loadDataWithBaseURL("https://app.crewbuilder.local/", bundled, "text/html", "UTF-8", null)
    }

    private fun asset(name: String) = assets.open("forge/$name").bufferedReader().use { it.readText() }
    private fun sendJs(fn: String, payload: String) {
        if (!::webView.isInitialized) return
        val q = JSONObject.quote(payload)
        runOnUiThread { webView.evaluateJavascript("$fn && $fn($q)", null) }
    }
    private fun sendSensorEvent(payload: String) = sendJs("window.__crewSensorEvent", payload)
    fun resolveGemini(p: String) = sendJs("window.__crewGeminiResolve", p)
    fun resolveLive(p: String) = sendJs("window.__crewLiveEvent", p)

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { if (webView.canGoBack()) webView.goBack() else super.onBackPressed() }

    override fun onDestroy() {
        sensorManager.unregisterListener(this)
        nativeBridge.destroy()
        webView.removeJavascriptInterface("CrewNative")
        webView.destroy()
        super.onDestroy()
    }
}
