package com.magic76.crewforge

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class ForgeNativeBridge(
    private val activity: Activity,
    private val onGeminiResult: (String) -> Unit,
    private val onLiveEvent: (String) -> Unit
) {
    companion object {
        private const val PREFS = "crew_forge_config"
        private const val KEY_API_KEY = "gemini_api_key"
        private const val MIC_REQUEST = 701
        private val FALLBACK_MODELS = listOf("gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview", "gemini-2.5-flash")
    }

    private val executor = Executors.newCachedThreadPool()
    private val live = GeminiLiveClient(onLiveEvent)

    @JavascriptInterface fun hasGeminiApiKey(): Boolean = getApiKey().isNotBlank()
    @JavascriptInterface fun setGeminiApiKey(key: String?) { activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_API_KEY, key.orEmpty().trim()).apply() }
    @JavascriptInterface fun clearGeminiApiKey() { activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_API_KEY).apply() }

    @JavascriptInterface
    fun startGeminiLive(appContext: String?) {
        val key = getApiKey()
        if (key.isBlank()) { onLiveEvent(JSONObject().put("type", "state").put("state", "error").put("message", "Gemini API key is missing").toString()); return }
        if (Build.VERSION.SDK_INT >= 23 && activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            activity.runOnUiThread { activity.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), MIC_REQUEST) }
            onLiveEvent(JSONObject().put("type", "state").put("state", "permission").put("message", "Allow microphone access, then tap Live again").toString())
            return
        }
        live.start(key, appContext.orEmpty())
    }

    @JavascriptInterface fun stopGeminiLive() = live.stop()
    @JavascriptInterface fun respondGeminiLive(callId: String, name: String, resultJson: String) = live.toolResponse(callId, name, resultJson)

    @JavascriptInterface
    fun generateGemini(requestId: String, prompt: String, preferredModel: String?) {
        executor.execute {
            val apiKey = getApiKey()
            if (apiKey.isBlank()) { deliver(requestId, null, null, "Gemini API key is missing"); return@execute }
            val requested = preferredModel.orEmpty().trim()
            val models = mutableListOf<String>()
            if (requested.isNotEmpty() && requested != "auto") models.add(requested)
            FALLBACK_MODELS.forEach { if (!models.contains(it)) models.add(it) }
            var lastError = "No Gemini model succeeded"
            for (model in models) {
                try {
                    val text = callGemini(apiKey, model, prompt)
                    if (text.isNotBlank()) { deliver(requestId, text, model, null); return@execute }
                    lastError = "$model returned an empty response"
                } catch (error: Exception) { lastError = "$model: ${error.message ?: error.javaClass.simpleName}" }
            }
            deliver(requestId, null, null, lastError)
        }
    }

    private fun callGemini(apiKey: String, model: String, prompt: String): String {
        val connection = (URL("https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$apiKey").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; connectTimeout = 20_000; readTimeout = 90_000; doOutput = true; setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }
        val payload = JSONObject().apply {
            put("contents", JSONArray().put(JSONObject().put("role", "user").put("parts", JSONArray().put(JSONObject().put("text", prompt)))))
            put("generationConfig", JSONObject().put("maxOutputTokens", 32768))
        }
        try {
            connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val body = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) throw IllegalStateException("HTTP $status ${body.take(240)}")
            val candidates = JSONObject(body).optJSONArray("candidates") ?: throw IllegalStateException("No candidates")
            val parts = candidates.optJSONObject(0)?.optJSONObject("content")?.optJSONArray("parts") ?: throw IllegalStateException("No content parts")
            return buildString { for (i in 0 until parts.length()) append(parts.optJSONObject(i)?.optString("text").orEmpty()) }.trim()
        } finally { connection.disconnect() }
    }

    private fun deliver(requestId: String, text: String?, model: String?, error: String?) {
        val payload = JSONObject().put("requestId", requestId).put("text", text ?: JSONObject.NULL).put("model", model ?: JSONObject.NULL).put("error", error ?: JSONObject.NULL).toString()
        activity.runOnUiThread { onGeminiResult(payload) }
    }

    private fun getApiKey(): String = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_API_KEY, "").orEmpty().trim()

    @JavascriptInterface fun vibrate(durationMs: Long) {
        val duration = durationMs.coerceIn(1L, 2000L)
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) activity.getSystemService(VibratorManager::class.java).defaultVibrator else { @Suppress("DEPRECATION") activity.getSystemService(Vibrator::class.java) }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE)) else { @Suppress("DEPRECATION") vibrator.vibrate(duration) }
    }

    @JavascriptInterface fun share(title: String?, text: String?, url: String?) {
        activity.runOnUiThread {
            val payload = listOfNotNull(text?.takeIf { it.isNotBlank() }, url?.takeIf { it.isNotBlank() }).joinToString("\n")
            val intent = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_SUBJECT, title.orEmpty()); putExtra(Intent.EXTRA_TEXT, payload) }
            activity.startActivity(Intent.createChooser(intent, title?.takeIf { it.isNotBlank() } ?: "Share"))
        }
    }

    fun destroy() { live.stop(); executor.shutdownNow() }
}
