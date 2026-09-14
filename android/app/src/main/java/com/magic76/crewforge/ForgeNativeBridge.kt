package com.magic76.crewforge

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.webkit.JavascriptInterface

class ForgeNativeBridge(private val activity: Activity) {
    @JavascriptInterface
    fun vibrate(durationMs: Long) {
        val duration = durationMs.coerceIn(1L, 2000L)
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            activity.getSystemService(VibratorManager::class.java).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            activity.getSystemService(Vibrator::class.java)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(duration)
        }
    }

    @JavascriptInterface
    fun share(title: String?, text: String?, url: String?) {
        activity.runOnUiThread {
            val payload = listOfNotNull(text?.takeIf { it.isNotBlank() }, url?.takeIf { it.isNotBlank() })
                .joinToString("\n")
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_SUBJECT, title.orEmpty())
                putExtra(Intent.EXTRA_TEXT, payload)
            }
            activity.startActivity(Intent.createChooser(intent, title?.takeIf { it.isNotBlank() } ?: "Share"))
        }
    }
}
