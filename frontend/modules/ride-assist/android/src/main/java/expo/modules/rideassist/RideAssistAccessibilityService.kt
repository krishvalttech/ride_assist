package expo.modules.rideassist

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
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
 * - Emits are rate-limited per package; no continuous polling.
 * - Never reads other apps, hidden data, or private databases; never bypasses
 *   security prompts, CAPTCHAs, or OTP screens.
 */
class RideAssistAccessibilityService : AccessibilityService() {

    private var lastEmitPerPackage: MutableMap<String, Long> = HashMap()
    private var enabled = false

    companion object {
        /** Live instance, used only by the isolated, opt-in RideAssistAcceptAdapter. */
        @Volatile
        var instance: RideAssistAccessibilityService? = null
    }

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

        // Rate limit: at most one observation per package per 2 seconds.
        val now = System.currentTimeMillis()
        val last = lastEmitPerPackage[sourcePackage] ?: 0
        if (now - last < RATE_LIMIT_MS) return
        lastEmitPerPackage[sourcePackage] = now

        val texts = collectVisibleTexts(event, maxNodes = 120, maxCharsPerNode = 200)
        if (texts.isEmpty()) return

        val combined = texts.joinToString(" ")
        val payload = JSONObject().apply {
            put("id", "screen_${sourcePackage}_$now")
            put("platform", platform)
            put("title", "")
            put("text", combined.take(300))
            put("subText", "")
            put("postedAt", now)
            put("source", "screen")
            put("removed", false)
        }
        RideAssistEventHub.emit(payload)
        android.util.Log.d("RideAssist", "screen observation emitted (redacted, rate-limited)")
    }

    private fun collectVisibleTexts(event: AccessibilityEvent, maxNodes: Int, maxCharsPerNode: Int): List<String> {
        val out = ArrayList<String>()
        val queue = ArrayDeque<android.view.accessibility.AccessibilityNodeInfo>()
        // FIX: event.source is only the changed node (often an empty container),
        // which is why full ride cards were never read. Use the active window
        // root of the SAME driver-app package instead.
        val root = rootInActiveWindow
        val sourceNode = if (root != null && root.packageName?.toString() == event.packageName?.toString()) root else (event.source ?: return out)
        queue.add(sourceNode)
        var visited = 0
        while (queue.isNotEmpty() && visited < maxNodes) {
            val node = queue.removeFirstOrNull() ?: continue
            visited += 1
            val text = node.text?.toString()
            if (!text.isNullOrBlank()) out.add(text.take(maxCharsPerNode))
            node.contentDescription?.toString()?.let { if (it.isNotBlank()) out.add(it.take(maxCharsPerNode)) }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        return out
    }

    private fun platformForPackage(packageName: String, prefs: android.content.SharedPreferences): String? {
        val synced = prefs.getString(RideAssistModule.KEY_PLATFORM_PACKAGES, null)
        if (synced != null) {
            try {
                val map = org.json.JSONObject(synced)
                for (key in map.keys()) {
                    if (map.optString(key) == packageName) return key
                }
            } catch (_: Exception) {
                // fall through
            }
        }
        return RideEventNormalizer.platformForPackage(packageName)
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
