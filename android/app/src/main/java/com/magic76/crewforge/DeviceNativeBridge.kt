package com.crewpocket.crewbuilder

import android.app.Activity
import android.content.Context
import android.os.BatteryManager
import android.speech.tts.TextToSpeech
import org.json.JSONObject
import java.util.Locale

class DeviceNativeBridge(private val activity: Activity) : TextToSpeech.OnInitListener {
    private var tts: TextToSpeech? = TextToSpeech(activity.applicationContext, this)
    private var ready = false

    override fun onInit(status: Int) {
        ready = status == TextToSpeech.SUCCESS
    }

    fun getBattery(): String {
        val manager = activity.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val level = manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).coerceIn(0, 100)
        val charging = manager.isCharging
        return JSONObject().put("level", level).put("charging", charging).toString()
    }

    fun speak(text: String?, language: String?): Boolean {
        val value = text.orEmpty().trim().take(1000)
        if (!ready || value.isBlank()) return false
        activity.runOnUiThread {
            val locale = when (language.orEmpty().lowercase()) {
                "zh-tw", "zh_tw" -> Locale.TAIWAN
                "zh-cn", "zh_cn" -> Locale.SIMPLIFIED_CHINESE
                "ja", "ja-jp" -> Locale.JAPAN
                "en", "en-us" -> Locale.US
                else -> Locale.getDefault()
            }
            tts?.language = locale
            tts?.speak(value, TextToSpeech.QUEUE_FLUSH, null, "crew-${System.currentTimeMillis()}")
        }
        return true
    }

    fun stopSpeaking() {
        activity.runOnUiThread { tts?.stop() }
    }

    fun destroy() {
        tts?.stop()
        tts?.shutdown()
        tts = null
    }
}