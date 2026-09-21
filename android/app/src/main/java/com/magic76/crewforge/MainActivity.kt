package com.crewpocket.crewbuilder

import android.app.Activity
import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Bundle
import android.content.pm.PackageManager
import android.net.Uri
import android.os.SystemClock
import android.webkit.WebResourceRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import kotlin.math.sqrt

class MainActivity : Activity(), SensorEventListener {
    private lateinit var webView: WebView
    private lateinit var nativeBridge: ForgeNativeBridge
    private lateinit var deviceBridge: DeviceNativeBridge
    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private var gyroscope: Sensor? = null
    private var lastSensorDispatch = 0L
    private var lastGyroDispatch = 0L
    private var lastShakeDispatch = 0L
    private val requestedSensors = mutableSetOf<String>()
    private var resumed = false
    private var hostReplyProxy: JavaScriptReplyProxy? = null
    private val pendingHostReplies = mutableMapOf<String, JavaScriptReplyProxy>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        nativeBridge = ForgeNativeBridge(
            this,
            { completeGeminiRequest(it) },
            { emitHostEvent("live", it) },
            { completeLocationRequest(it) }
        )
        deviceBridge = DeviceNativeBridge(this)
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
        webView = WebView(this).apply {
            setBackgroundColor(android.graphics.Color.rgb(9, 12, 18))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mediaPlaybackRequiresUserGesture = false
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    val uri = request?.url ?: return false
                    if (uri.scheme == "https" && uri.host == "app.crewbuilder.local") return false
                    return true
                }
            }
        }
        installHostBridge()
        setContentView(webView)
        loadBuilder()
    }

    override fun onResume() {
        super.onResume()
        resumed = true
        syncSensorSubscriptions()
    }

    override fun onPause() {
        resumed = false
        sensorManager.unregisterListener(this)
        super.onPause()
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null || event.values.size < 3) return
        val now = SystemClock.elapsedRealtime()
        val x = event.values[0]; val y = event.values[1]; val z = event.values[2]
        if (event.sensor.type == Sensor.TYPE_GYROSCOPE) {
            if ("gyroscope" in requestedSensors && now - lastGyroDispatch >= 80) {
                lastGyroDispatch = now
                emitHostEvent("sensor", JSONObject().put("type", "gyroscope").put("x", x).put("y", y).put("z", z).put("timestamp", System.currentTimeMillis()).toString())
            }
            return
        }
        if (event.sensor.type != Sensor.TYPE_ACCELEROMETER) return
        if ("accelerometer" in requestedSensors && now - lastSensorDispatch >= 80) {
            lastSensorDispatch = now
            emitHostEvent("sensor", JSONObject().put("type", "accelerometer").put("x", x).put("y", y).put("z", z).put("timestamp", System.currentTimeMillis()).toString())
        }
        if ("shake" in requestedSensors) {
            val g = sqrt((x * x + y * y + z * z).toDouble()) / SensorManager.GRAVITY_EARTH
            if (g >= 2.35 && now - lastShakeDispatch >= 850) {
                lastShakeDispatch = now
                emitHostEvent("sensor", JSONObject().put("type", "shake").put("strength", g).put("timestamp", System.currentTimeMillis()).toString())
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun loadBuilder() {
        val html = asset("index.html")
        val bundled = html
            .replace("<link rel=\"stylesheet\" href=\"./forge.css\" />", "<style>${asset("forge.css")}</style>")
            .replace("<link rel=\"stylesheet\" href=\"./gemini.css\" />", "<style>${asset("gemini.css")}</style>")
            .replace("<script src=\"./storage-runtime.js\"></script>", "<script>${asset("storage-runtime.js")}</script>")
            .replace("<script src=\"./forge.js\"></script>", "<script>${asset("forge.js")}</script>")
            .replace("<script src=\"./native-adapter.js\"></script>", "<script>${asset("native-adapter.js")}</script>")
            .replace("<script src=\"./live-runtime.js\"></script>", "<script>${asset("live-runtime.js")}</script>")
            .replace("<script src=\"./ui-runtime.js\"></script>", "<script>${asset("ui-runtime.js")}</script>")
            .replace("<script src=\"./builder-ux.js\"></script>", "<script>${asset("builder-ux.js")}</script>")
            .replace("<script src=\"./builder-next.js\"></script>", "<script>${asset("builder-next.js")}</script>")
            .replace("<script src=\"./language-prompts.js\"></script>", "<script>${asset("language-prompts.js")}</script>")
            .replace("<script src=\"./appspec-runtime.js\"></script>", "<script>${asset("appspec-runtime.js")}</script>")
        webView.loadDataWithBaseURL("https://app.crewbuilder.local/", bundled, "text/html", "UTF-8", null)
    }

    private fun asset(name: String) = assets.open("forge/$name").bufferedReader().use { it.readText() }

    private fun installHostBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            throw IllegalStateException("This Android WebView does not support secure web messaging.")
        }
        WebViewCompat.addWebMessageListener(
            webView,
            "CrewHost",
            setOf("https://app.crewbuilder.local"),
            object : WebViewCompat.WebMessageListener {
                override fun onPostMessage(
                    view: WebView,
                    message: WebMessageCompat,
                    sourceOrigin: Uri,
                    isMainFrame: Boolean,
                    replyProxy: JavaScriptReplyProxy
                ) {
                    if (!isMainFrame || sourceOrigin.scheme != "https" || sourceOrigin.host != "app.crewbuilder.local") return
                    val data = message.data ?: return
                    hostReplyProxy = replyProxy
                    handleHostMessage(data, replyProxy)
                }
            }
        )
    }

    private fun handleHostMessage(raw: String, replyProxy: JavaScriptReplyProxy) {
        try {
            val message = JSONObject(raw)
            val id = message.optString("id")
            val method = message.optString("method")
            val payload = message.optJSONObject("payload") ?: JSONObject()
            if (id.isBlank() || method.isBlank()) return

            when (method) {
                "gemini.hasKey" -> replyHost(replyProxy, id, nativeBridge.hasGeminiApiKey())
                "gemini.setKey" -> {
                    nativeBridge.setGeminiApiKey(payload.optString("key"))
                    replyHost(replyProxy, id, true)
                }
                "gemini.clearKey" -> {
                    nativeBridge.clearGeminiApiKey()
                    replyHost(replyProxy, id, true)
                }
                "gemini.generate" -> {
                    pendingHostReplies[id] = replyProxy
                    nativeBridge.generateGemini(id, payload.optString("prompt"), payload.optString("model", "auto"))
                }
                "live.start" -> {
                    nativeBridge.startGeminiLive(payload.optString("context"))
                    replyHost(replyProxy, id, true)
                }
                "live.stop" -> {
                    nativeBridge.stopGeminiLive()
                    replyHost(replyProxy, id, true)
                }
                "live.respond" -> {
                    nativeBridge.respondGeminiLive(
                        payload.optString("callId"),
                        payload.optString("name"),
                        payload.optString("resultJson", "{}")
                    )
                    replyHost(replyProxy, id, true)
                }
                "vibrate" -> {
                    nativeBridge.vibrate(payload.optLong("duration", 60L))
                    replyHost(replyProxy, id, true)
                }
                "share" -> {
                    nativeBridge.share(payload.optString("title"), payload.optString("text"), payload.optString("url"))
                    replyHost(replyProxy, id, true)
                }
                "clipboard" -> {
                    nativeBridge.copyToClipboard(payload.optString("text"))
                    replyHost(replyProxy, id, true)
                }
                "location" -> {
                    pendingHostReplies[id] = replyProxy
                    nativeBridge.requestLocation(id)
                }
                "device.battery" -> replyHost(replyProxy, id, JSONObject(deviceBridge.getBattery()))
                "tts.speak" -> replyHost(replyProxy, id, deviceBridge.speak(payload.optString("text"), payload.optString("language")))
                "tts.stop" -> {
                    deviceBridge.stopSpeaking()
                    replyHost(replyProxy, id, true)
                }
                "sensor.subscribe" -> {
                    setSensorSubscription(payload.optString("sensor"), true)
                    replyHost(replyProxy, id, true)
                }
                "sensor.unsubscribe" -> {
                    setSensorSubscription(payload.optString("sensor"), false)
                    replyHost(replyProxy, id, true)
                }
                "sensor.clear" -> {
                    requestedSensors.clear()
                    syncSensorSubscriptions()
                    replyHost(replyProxy, id, true)
                }
                else -> replyHost(replyProxy, id, null, "Unsupported native method: " + method)
            }
        } catch (error: Exception) {
            val id = try { JSONObject(raw).optString("id") } catch (_: Exception) { "" }
            if (id.isNotBlank()) replyHost(replyProxy, id, null, error.message ?: "Native bridge error")
        }
    }

    private fun replyHost(proxy: JavaScriptReplyProxy, id: String, result: Any?, error: String? = null) {
        val message = JSONObject().put("id", id)
        if (error != null) message.put("error", error)
        else message.put("result", result ?: JSONObject.NULL)
        proxy.postMessage(message.toString())
    }

    private fun completeGeminiRequest(raw: String) {
        val payload = JSONObject(raw)
        val id = payload.optString("requestId")
        val proxy = pendingHostReplies.remove(id) ?: return
        val error = if (payload.isNull("error")) null else payload.optString("error")
        if (error != null) {
            replyHost(proxy, id, null, error)
            return
        }
        val result = JSONObject()
            .put("text", if (payload.isNull("text")) "" else payload.optString("text"))
            .put("model", if (payload.isNull("model")) "" else payload.optString("model"))
        replyHost(proxy, id, result)
    }

    private fun completeLocationRequest(raw: String) {
        val payload = JSONObject(raw)
        val id = payload.optString("requestId")
        val proxy = pendingHostReplies.remove(id) ?: return
        val error = if (payload.isNull("error")) null else payload.optString("error")
        if (error != null) replyHost(proxy, id, null, error)
        else replyHost(proxy, id, if (payload.isNull("value")) null else payload.optJSONObject("value"))
    }

    private fun emitHostEvent(channel: String, payloadJson: String) {
        val payload = try { JSONObject(payloadJson) } catch (_: Exception) { JSONObject().put("value", payloadJson) }
        runOnUiThread {
            val proxy = hostReplyProxy ?: return@runOnUiThread
            proxy.postMessage(
                JSONObject()
                    .put("type", "event")
                    .put("channel", channel)
                    .put("payload", payload)
                    .toString()
            )
        }
    }

    private fun setSensorSubscription(sensor: String, enabled: Boolean) {
        if (sensor !in setOf("shake", "accelerometer", "gyroscope")) return
        if (enabled) requestedSensors.add(sensor) else requestedSensors.remove(sensor)
        syncSensorSubscriptions()
    }

    private fun syncSensorSubscriptions() {
        sensorManager.unregisterListener(this)
        if (!resumed) return
        if ("shake" in requestedSensors || "accelerometer" in requestedSensors) {
            accelerometer?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        }
        if ("gyroscope" in requestedSensors) {
            gyroscope?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == ForgeNativeBridge.LOCATION_REQUEST) {
            nativeBridge.onLocationPermissionResult(grantResults.any { it == PackageManager.PERMISSION_GRANTED })
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        resumed = false
        requestedSensors.clear()
        sensorManager.unregisterListener(this)
        pendingHostReplies.clear()
        hostReplyProxy = null
        nativeBridge.destroy()
        deviceBridge.destroy()
        webView.destroy()
        super.onDestroy()
    }
}