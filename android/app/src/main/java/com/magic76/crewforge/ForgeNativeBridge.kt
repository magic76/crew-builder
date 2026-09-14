package com.crewpocket.crewbuilder

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class ForgeNativeBridge(
    private val activity: Activity,
    private val onGeminiResult: (String) -> Unit,
    private val onLiveEvent: (String) -> Unit
) {
    companion object {
        private const val TAG = "CrewBuilder"
        private const val PREFS = "crew_builder_config"
        private const val LEGACY_PREFS = "crew_forge_config"
        private const val KEY_API_KEY = "gemini_api_key"
        private const val KEY_ALIAS = "crew_builder_gemini_key"
        private const val ENCRYPTED_PREFIX = "enc:"
        private const val MIC_REQUEST = 701
        private val FALLBACK_MODELS = listOf(
            "gemini-3.6-flash",
            "gemini-3.5-flash-lite",
            "gemini-3.5-flash",
            "gemini-3.0-flash",
            "gemini-3-flash",
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "gemini-1.5-flash"
        )
    }

    private class GeminiHttpException(val statusCode: Int, detail: String) : IllegalStateException("HTTP $statusCode $detail")

    private val executor = Executors.newCachedThreadPool()
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()
    private val live = GeminiLiveClient(onLiveEvent)

    init { migratePreferences() }

    @JavascriptInterface fun hasGeminiApiKey(): Boolean = getApiKey().isNotBlank()

    @JavascriptInterface
    fun setGeminiApiKey(key: String?) {
        val value = key.orEmpty().trim()
        if (value.isBlank()) prefs().edit().remove(KEY_API_KEY).apply()
        else prefs().edit().putString(KEY_API_KEY, encrypt(value)).apply()
    }

    @JavascriptInterface fun clearGeminiApiKey() { prefs().edit().remove(KEY_API_KEY).apply() }

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
            val failures = mutableListOf<String>()
            for (model in models) {
                try {
                    val text = callGeminiWithRetry(apiKey, model, prompt)
                    if (text.isNotBlank()) { deliver(requestId, text, model, null); return@execute }
                    failures.add("$model returned an empty response")
                } catch (error: Exception) {
                    val detail = "$model: ${compactError(error.message ?: error.javaClass.simpleName)}"
                    failures.add(detail)
                    Log.w(TAG, "Gemini model failed request=$requestId $detail")
                    val status = (error as? GeminiHttpException)?.statusCode
                    if (status == 401 || status == 403) break
                }
            }
            deliver(requestId, null, null, summarizeFailures(failures))
        }
    }

    private fun callGeminiWithRetry(apiKey: String, model: String, prompt: String): String {
        var lastError: Exception? = null
        var attempt = 0
        while (attempt < 2) {
            try {
                return callGemini(apiKey, model, prompt)
            } catch (error: Exception) {
                lastError = error
                val status = (error as? GeminiHttpException)?.statusCode
                val retryable = error is java.io.IOException || (status != null && status in 500..599)
                if (!retryable || attempt == 1) break
                Thread.sleep(800L)
                attempt++
            }
        }
        throw lastError ?: IllegalStateException("Gemini request failed")
    }

    private fun callGemini(apiKey: String, model: String, prompt: String): String {
        val endpoint = "https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$apiKey"
        val payload = JSONObject().apply {
            put("contents", JSONArray().put(JSONObject().put("role", "user").put("parts", JSONArray().put(JSONObject().put("text", prompt)))))
            put("generationConfig", JSONObject().put("maxOutputTokens", 8192))
        }
        val request = Request.Builder()
            .url(endpoint)
            .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            .build()
        httpClient.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw GeminiHttpException(response.code, compactError(body).take(360))
            val candidates = JSONObject(body).optJSONArray("candidates") ?: throw IllegalStateException("No candidates")
            val parts = candidates.optJSONObject(0)?.optJSONObject("content")?.optJSONArray("parts") ?: throw IllegalStateException("No content parts")
            return buildString { for (i in 0 until parts.length()) append(parts.optJSONObject(i)?.optString("text").orEmpty()) }.trim()
        }
    }

    private fun deliver(requestId: String, text: String?, model: String?, error: String?) {
        val payload = JSONObject().put("requestId", requestId).put("text", text ?: JSONObject.NULL).put("model", model ?: JSONObject.NULL).put("error", error ?: JSONObject.NULL).toString()
        activity.runOnUiThread { onGeminiResult(payload) }
    }

    private fun summarizeFailures(failures: List<String>): String {
        if (failures.any { it.contains("HTTP 429") }) {
            return "Gemini quota exceeded (HTTP 429). Wait for quota reset or use another API key."
        }
        if (failures.any { it.contains("HTTP 401") || it.contains("HTTP 403") }) {
            return "Gemini API key rejected. Check the key permissions and billing."
        }
        if (failures.any { it.contains("Unable to resolve host") || it.contains("timeout", ignoreCase = true) || it.contains("timed out", ignoreCase = true) }) {
            return "Gemini network unavailable. Check the phone connection and try again."
        }
        if (failures.isEmpty()) return "No Gemini model succeeded"
        return failures.take(3).joinToString("; ").take(900)
    }

    private fun compactError(value: String): String = value.replace(Regex("\\s+"), " ").trim()

    private fun prefs() = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun getApiKey(): String {
        val stored = prefs().getString(KEY_API_KEY, "").orEmpty().trim()
        if (stored.isBlank()) return ""
        if (stored.startsWith(ENCRYPTED_PREFIX)) return decrypt(stored).orEmpty().trim()
        return stored.also {
            try { prefs().edit().putString(KEY_API_KEY, encrypt(it)).apply() } catch (_: Exception) {}
        }
    }

    private fun migratePreferences() {
        val current = prefs()
        if (current.contains(KEY_API_KEY)) {
            getApiKey()
            return
        }
        val legacy = activity.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)
        val legacyKey = legacy.getString(KEY_API_KEY, "").orEmpty().trim()
        if (legacyKey.isNotBlank()) setGeminiApiKey(legacyKey)
    }

    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        )
        return generator.generateKey()
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        val payload = ByteArray(1 + cipher.iv.size + encrypted.size)
        payload[0] = cipher.iv.size.toByte()
        System.arraycopy(cipher.iv, 0, payload, 1, cipher.iv.size)
        System.arraycopy(encrypted, 0, payload, 1 + cipher.iv.size, encrypted.size)
        return ENCRYPTED_PREFIX + Base64.encodeToString(payload, Base64.NO_WRAP)
    }

    private fun decrypt(value: String): String? {
        return try {
            val payload = Base64.decode(value.removePrefix(ENCRYPTED_PREFIX), Base64.NO_WRAP)
            if (payload.isEmpty()) return null
            val ivLength = payload[0].toInt() and 0xFF
            if (ivLength <= 0 || payload.size <= 1 + ivLength) return null
            val iv = payload.copyOfRange(1, 1 + ivLength)
            val encrypted = payload.copyOfRange(1 + ivLength, payload.size)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(encrypted), Charsets.UTF_8)
        } catch (_: Exception) { null }
    }

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
