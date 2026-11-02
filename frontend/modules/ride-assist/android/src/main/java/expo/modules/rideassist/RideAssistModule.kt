package expo.modules.rideassist

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

/**
 * React Native bridge for RideAssist native capabilities.
 *
 * Only necessary, justified capabilities are exposed:
 * - permission status queries (notification listener / accessibility),
 * - deep links to the matching system settings screens,
 * - monitoring start/stop,
 * - platform → package-id sync,
 * - bounded pending-event drain (events emitted before JS mounted).
 */
class RideAssistModule : Module() {

    companion object {
        const val EVENT_NAME = "onRideAssistEvent"
        const val PREFS_NAME = "rideassist_native"
        const val KEY_MONITORING = "monitoring_enabled"
        const val KEY_PLATFORM_PACKAGES = "platform_packages"
        const val KEY_RECENT_EVENTS = "recent_events"
        const val KEY_PENDING_QUEUE = "pending_event_queue"
    }

    private val context: Context?
        get() = appContext.reactContext?.applicationContext

    private fun prefs() = context?.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    override fun definition() = ModuleDefinition {
        Name("RideAssist")
        Events(EVENT_NAME)

        OnCreate {
            RideAssistContextHolder.applicationContext = context
            RideAssistEventHub.onEvent = { event ->
                sendEvent(EVENT_NAME, event.toBundle())
            }
        }

        OnDestroy {
            RideAssistEventHub.onEvent = null
        }

        AsyncFunction("getPermissionStatus") { promise: Promise ->
            val ctx = context
            if (ctx == null) {
                promise.resolve(
                    mapOf(
                        "notificationListener" to "unavailable",
                        "accessibility" to "unavailable",
                    ),
                )
                return@AsyncFunction
            }
            val listenerGranted = isNotificationListenerEnabled(ctx)
            val accessibilityGranted = isAccessibilityServiceEnabled(ctx)
            promise.resolve(
                mapOf(
                    "notificationListener" to if (listenerGranted) "granted" else "denied",
                    "accessibility" to if (accessibilityGranted) "granted" else "denied",
                ),
            )
        }

        Function("openNotificationAccessSettings") {
            val ctx = context ?: return@Function false
            ctx.startActivity(
                Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            true
        }

        Function("openAccessibilitySettings") {
            val ctx = context ?: return@Function false
            ctx.startActivity(
                Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            true
        }

        /** Returns whether the listener permission is actually granted — the
         *  enabled flag alone never implies permission. */
        Function("startMonitoring") {
            prefs()?.edit()?.putBoolean(KEY_MONITORING, true)?.apply()
            val ctx = context
            ctx != null && isNotificationListenerEnabled(ctx)
        }

        Function("stopMonitoring") {
            prefs()?.edit()?.putBoolean(KEY_MONITORING, false)?.apply()
            true
        }

        Function("isPackageInstalled") { packageName: String ->
            val ctx = context ?: return@Function null
            try {
                ctx.packageManager.getPackageInfo(packageName, 0)
                true
            } catch (e: PackageManager.NameNotFoundException) {
                false
            } catch (e: Exception) {
                null
            }
        }

        /** Syncs the user-editable platform → package-id map into the listener. */
        Function("syncPlatformPackages") { packages: Map<String, String> ->
            val json = JSONObject()
            for ((platform, pkg) in packages) json.put(platform, pkg)
            prefs()?.edit()?.putString(KEY_PLATFORM_PACKAGES, json.toString())?.apply()
            true
        }

        AsyncFunction("getPendingEvents") { promise: Promise ->
            promise.resolve(RideAssistEventHub.drainPending().toMapList())
        }

        /** Opt-in accessibility accept tap for the active request (see RideAssistAcceptAdapter). */
        Function("requestAcceptance") { platform: String, fare: Double? ->
            val result = RideAssistAcceptAdapter.requestAcceptance(platform, fare)
            mapOf("status" to result.status, "reason" to result.reason)
        }

        Function("getAcceptanceEvidence") { platform: String ->
            val result = RideAssistAcceptAdapter.checkEvidence(platform)
            mapOf("status" to result.status, "reason" to result.reason)
        }

        /** Last time a REAL event was seen per platform (epoch ms, 0 = never). */
        Function("getPlatformActivity") {
            val p = prefs()
            mapOf(
                "rapido" to (p?.getLong("last_event_rapido", 0L) ?: 0L).toDouble(),
                "uber" to (p?.getLong("last_event_uber", 0L) ?: 0L).toDouble(),
                "ola" to (p?.getLong("last_event_ola", 0L) ?: 0L).toDouble(),
            )
        }

        Function("isIgnoringBatteryOptimizations") {
            val ctx = context ?: return@Function false
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
            pm.isIgnoringBatteryOptimizations(ctx.packageName)
        }

        /** Opens the system battery-optimization list; the user chooses — never silently changed. */
        Function("openBatteryOptimizationSettings") {
            val ctx = context ?: return@Function false
            ctx.startActivity(
                Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            true
        }

        Function("clearPendingEvents") {
            RideAssistEventHub.clearPending()
            true
        }
    }

    private fun isNotificationListenerEnabled(ctx: Context): Boolean {
        return try {
            NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.packageName)
        } catch (e: Exception) {
            false
        }
    }

    private fun isAccessibilityServiceEnabled(ctx: Context): Boolean {
        val enabled = Settings.Secure.getString(
            ctx.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
        ) ?: return false
        return enabled.split(":").any {
            it.contains(ctx.packageName) && it.contains("RideAssistAccessibilityService")
        }
    }
}

private fun JSONObject.toBundle(): Bundle {
    val bundle = Bundle()
    for (key in keys()) {
        when (val value = get(key)) {
            is String -> bundle.putString(key, value)
            is Boolean -> bundle.putBoolean(key, value)
            is Int -> bundle.putInt(key, value)
            is Long -> bundle.putLong(key, value)
            is Double -> bundle.putDouble(key, value)
        }
    }
    return bundle
}

private fun JSONArray.toMapList(): List<Map<String, Any>> {
    val out = ArrayList<Map<String, Any>>(length())
    for (i in 0 until length()) {
        val obj = optJSONObject(i) ?: continue
        val map = HashMap<String, Any>()
        for (key in obj.keys()) {
            val value = obj.get(key)
            if (value != JSONObject.NULL) map[key] = value
        }
        out.add(map)
    }
    return out
}
