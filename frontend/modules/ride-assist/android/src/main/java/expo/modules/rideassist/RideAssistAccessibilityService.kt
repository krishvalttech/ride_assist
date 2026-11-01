package expo.modules.rideassist

import android.accessibilityservice.AccessibilityService
import android.content.SharedPreferences
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject

/**
 * OPTIONAL, read-only screen observation for explicitly configured driver
 * apps.
 *
 * Compliance contract (enforced in code, not just intent):
 * - Observation here is read-only. The ONLY interaction path is the isolated
 *   RideAssistAcceptAdapter (standard AccessibilityNodeInfo.ACTION_CLICK on a
 *   visible "Accept" node), which runs only when the user explicitly enabled
 *   auto-accept for that platform. No dispatchGesture, no global actions, no
 *   input injection.
 * - Only events from configured driver-app packages are inspected.
 * - Only visible node text is collected (bounded walk, capped depth/count).
 * - Emits are rate-limited per package; legitimate ride-request cards bypass
 *   non-ride cooldowns so ride requests are never silently discarded.
 * - Never reads other apps, hidden data, or private databases; never bypasses
 *   security prompts, CAPTCHAs, or OTP screens.
 */
class RideAssistAccessibilityService : AccessibilityService() {
    companion object {
        const val RATE_LIMIT_MS = 2000L

        /** Live instance, used only by the isolated, opt-in RideAssistAcceptAdapter. */
        @Volatile
        var instance: RideAssistAccessibilityService? = null
    }

    private val lock = Any()
    private val lastEmitPerPackage: MutableMap<String, Long> = HashMap()
    private val lastRideHashPerPackage: MutableMap<String, Int> = HashMap()
    @Volatile
    private var enabled = false

    override fun onServiceConnected() {
        super.onServiceConnected()
        enabled = true
        instance = this
        RideAssistContextHolder.applicationContext = applicationContext
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (!enabled || event == null) return
        val prefs = getSharedPreferences(RideAssistModule.PREFS_NAME, MODE_PRIVATE)
        if (!prefs.getBoolean(RideAssistModule.KEY_MONITORING, false)) return

        val sourcePackage = event.packageName?.toString() ?: return
        val platform = platformForPackage(sourcePackage, prefs) ?: return

        val texts = collectVisibleTexts(event, maxNodes = 120, maxCharsPerNode = 200)
        if (texts.isEmpty()) return

        val combined = texts.joinToString(" ").trim()
        if (combined.isEmpty()) return

        val now = System.currentTimeMillis()
        val shouldEmit = synchronized(lock) {
            val lastEmit = lastEmitPerPackage[sourcePackage] ?: 0L
            val lastRideHash = lastRideHashPerPackage[sourcePackage]
            val allow = RideEventNormalizer.shouldEmitScreenObservation(
                text = combined,
                nowMs = now,
                lastEmitMs = lastEmit,
                lastRideHash = lastRideHash,
                rateLimitMs = RATE_LIMIT_MS,
            )
            if (allow) {
                lastEmitPerPackage[sourcePackage] = now
                if (RideEventNormalizer.looksLikeRideScreen(combined)) {
                    lastRideHashPerPackage[sourcePackage] = combined.hashCode()
                }
            }
            allow
        }
        if (!shouldEmit) return

        val payload = RideEventNormalizer.buildEvent(
            id = "screen_${sourcePackage}_$now",
            platform = platform,
            title = "",
            text = combined,
            subText = "",
            postedAt = now,
            source = "screen",
            removed = false,
        )
        RideAssistEventHub.emit(payload)
        android.util.Log.d("RideAssist", "screen observation emitted (rate-limited)")
    }

    private fun collectVisibleTexts(
        event: AccessibilityEvent,
        maxNodes: Int,
        maxCharsPerNode: Int
    ): List<String> {
        val out = ArrayList<String>()
        val queue = ArrayDeque<AccessibilityNodeInfo>()

        // event.source is only the changed node (often an empty container), so
        // prefer the active window root when it belongs to the same app.
        val root = rootInActiveWindow
        val sourceNode =
            if (root != null && root.packageName?.toString() == event.packageName?.toString()) root
            else (event.source ?: return out)

        queue.add(sourceNode)
        var visited = 0
        while (queue.isNotEmpty() && visited < maxNodes) {
            val node = queue.removeFirstOrNull() ?: continue
            visited += 1
            val text = node.text?.toString()
            if (!text.isNullOrBlank()) out.add(text.take(maxCharsPerNode))
            node.contentDescription?.toString()?.let {
                if (it.isNotBlank() && it != text) out.add(it.take(maxCharsPerNode))
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        return out
    }

    fun resolvePlatform(packageName: String): String? {
        val prefs = getSharedPreferences(RideAssistModule.PREFS_NAME, MODE_PRIVATE)
        return platformForPackage(packageName, prefs)
    }

    private fun platformForPackage(packageName: String, prefs: SharedPreferences): String? {
        val synced = prefs.getString(RideAssistModule.KEY_PLATFORM_PACKAGES, null)
        return RideEventNormalizer.resolvePlatform(packageName, synced)
    }

    override fun onInterrupt() {
        // No-op: read-only observation has no stateful work to interrupt.
    }

    override fun onDestroy() {
        enabled = false
        if (instance === this) instance = null
        super.onDestroy()
    }
}
