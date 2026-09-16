package com.crewpocket.crewbuilder

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import org.json.JSONObject

class LocationNativeBridge(
    private val activity: Activity,
    private val onLocationResult: (String) -> Unit
) {
    companion object {
        const val LOCATION_PERMISSION_REQUEST = 703
        private const val LOCATION_TIMEOUT_MS = 10_000L
        private const val FRESH_LOCATION_MS = 60_000L
    }

    private val handler = Handler(Looper.getMainLooper())
    private val pendingPermissionRequests = linkedSetOf<String>()
    private val listeners = mutableMapOf<String, LocationListener>()
    private val timeouts = mutableMapOf<String, Runnable>()

    @JavascriptInterface
    fun requestLocation(requestId: String?) {
        val id = requestId.orEmpty().trim()
        if (id.isBlank()) return
        activity.runOnUiThread {
            if (!hasPermission()) {
                pendingPermissionRequests += id
                activity.requestPermissions(
                    arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                    LOCATION_PERMISSION_REQUEST
                )
            } else {
                acquire(id)
            }
        }
    }

    fun onRequestPermissionsResult(requestCode: Int) {
        if (requestCode != LOCATION_PERMISSION_REQUEST) return
        val requests = pendingPermissionRequests.toList()
        pendingPermissionRequests.clear()
        if (hasPermission()) {
            requests.forEach(::acquire)
        } else {
            requests.forEach {
                deliverError(it, "LOCATION_PERMISSION_DENIED", "Location permission was denied")
            }
        }
    }

    private fun hasPermission(): Boolean =
        activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            activity.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun acquire(requestId: String) {
        if (!hasPermission()) {
            deliverError(requestId, "LOCATION_PERMISSION_DENIED", "Location permission was denied")
            return
        }

        val manager = activity.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val enabledProviders = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            .filter { provider -> runCatching { manager.isProviderEnabled(provider) }.getOrDefault(false) }

        if (enabledProviders.isEmpty()) {
            deliverError(requestId, "LOCATION_SERVICES_DISABLED", "Location services are turned off")
            return
        }

        val lastKnown = enabledProviders.mapNotNull { provider ->
            runCatching { manager.getLastKnownLocation(provider) }.getOrNull()
        }.maxByOrNull { it.time }

        if (lastKnown != null && System.currentTimeMillis() - lastKnown.time <= FRESH_LOCATION_MS) {
            deliverLocation(requestId, lastKnown)
            return
        }

        val provider = if (LocationManager.GPS_PROVIDER in enabledProviders) {
            LocationManager.GPS_PROVIDER
        } else {
            enabledProviders.first()
        }

        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                cleanup(requestId, manager)
                deliverLocation(requestId, location)
            }

            @Deprecated("Deprecated in Android")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
            override fun onProviderEnabled(provider: String) = Unit
            override fun onProviderDisabled(provider: String) = Unit
        }
        listeners[requestId] = listener

        val timeout = Runnable {
            cleanup(requestId, manager)
            if (lastKnown != null) {
                deliverLocation(requestId, lastKnown)
            } else {
                deliverError(requestId, "LOCATION_UNAVAILABLE", "Could not get the current location")
            }
        }
        timeouts[requestId] = timeout

        try {
            manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
            handler.postDelayed(timeout, LOCATION_TIMEOUT_MS)
        } catch (error: SecurityException) {
            cleanup(requestId, manager)
            deliverError(requestId, "LOCATION_PERMISSION_DENIED", error.message ?: "Location permission was denied")
        } catch (error: Exception) {
            cleanup(requestId, manager)
            deliverError(requestId, "LOCATION_UNAVAILABLE", error.message ?: "Could not get the current location")
        }
    }

    private fun cleanup(requestId: String, manager: LocationManager) {
        timeouts.remove(requestId)?.let { timeout -> handler.removeCallbacks(timeout) }
        listeners.remove(requestId)?.let { listener ->
            runCatching { manager.removeUpdates(listener) }
        }
    }

    private fun deliverLocation(requestId: String, location: Location) {
        val value = JSONObject()
            .put("lat", location.latitude)
            .put("lng", location.longitude)
            .put("accuracy", location.accuracy)
            .put("timestamp", location.time)
        deliver(requestId, value, null, null)
    }

    private fun deliverError(requestId: String, code: String, message: String) {
        deliver(requestId, null, code, message)
    }

    private fun deliver(requestId: String, value: JSONObject?, code: String?, error: String?) {
        val payload = JSONObject()
            .put("requestId", requestId)
            .put("value", value ?: JSONObject.NULL)
            .put("code", code ?: JSONObject.NULL)
            .put("error", error ?: JSONObject.NULL)
            .toString()
        activity.runOnUiThread { onLocationResult(payload) }
    }

    fun destroy() {
        val manager = activity.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        listeners.keys.toList().forEach { cleanup(it, manager) }
        pendingPermissionRequests.clear()
    }
}
