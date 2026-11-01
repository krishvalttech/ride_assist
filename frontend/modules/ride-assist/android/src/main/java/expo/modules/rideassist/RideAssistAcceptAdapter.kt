package expo.modules.rideassist

import android.view.accessibility.AccessibilityNodeInfo

/**
 * Isolated, opt-in acceptance adapter (UNVERIFIED on real driver-app versions).
 *
 * How it works — standard Android accessibility API only:
 * 1. The active window must belong to the requested platform's package (using
 *    synced custom package IDs or default package mappings).
 * 2. If a fare is known, that fare must be visible on screen (guards against
 *    tapping a DIFFERENT request than the one that matched the filters).
 * 3. Exactly one visible node whose text/description is an accept label is
 *    clicked with ACTION_CLICK (or its nearest clickable ancestor).
 * No root, ADB, uinput, gesture injection, or security-prompt bypass.
 *
 * Evidence is reported separately (checkEvidence): a tap is never treated as
 * an accepted ride.
 */
object RideAssistAcceptAdapter {

    private val ACCEPT_LABELS = Regex(
        "^\\s*(accept|accept ride|accept trip|tap to accept|swipe to accept|confirm|accept request)\\s*$",
        RegexOption.IGNORE_CASE,
    )
    private val ACCEPTED_MARKERS = Regex(
        "(go to pickup|navigate|arrived|reached pickup|start trip|start ride|picking up|on the way to pickup|i have arrived)",
        RegexOption.IGNORE_CASE,
    )
    private val UNAVAILABLE_MARKERS = Regex(
        "(no longer available|accepted by another|request expired|missed|request cancelled|ride cancelled)",
        RegexOption.IGNORE_CASE,
    )

    data class Result(val status: String, val reason: String)

    private fun rootFor(platform: String): AccessibilityNodeInfo? {
        val service = RideAssistAccessibilityService.instance ?: return null
        val root = service.rootInActiveWindow ?: return null
        val pkg = root.packageName?.toString() ?: return null
        return if (service.resolvePlatform(pkg) == platform) root else null
    }

    private fun walk(root: AccessibilityNodeInfo, maxNodes: Int = 250, visit: (AccessibilityNodeInfo) -> Unit) {
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var seen = 0
        while (queue.isNotEmpty() && seen < maxNodes) {
            val node = queue.removeFirst()
            seen += 1
            visit(node)
            for (i in 0 until node.childCount) node.getChild(i)?.let { queue.add(it) }
        }
    }

    private fun label(node: AccessibilityNodeInfo): String =
        (node.text?.toString() ?: node.contentDescription?.toString() ?: "").trim()

    fun requestAcceptance(platform: String, fare: Double?): Result {
        if (RideAssistAccessibilityService.instance == null) {
            return Result("UNAVAILABLE", "Accessibility service is not enabled")
        }
        val root = rootFor(platform) ?: return Result("UNAVAILABLE", "The $platform app is not on screen")

        val screenText = StringBuilder()
        val acceptNodes = ArrayList<AccessibilityNodeInfo>()
        walk(root) { node ->
            val text = label(node)
            if (text.isNotEmpty()) screenText.append(text).append(' ')
            if (node.isVisibleToUser && ACCEPT_LABELS.matches(text)) acceptNodes.add(node)
        }

        if (fare != null) {
            val fareText = if (fare % 1.0 == 0.0) fare.toLong().toString() else fare.toString()
            if (!screenText.contains(fareText)) {
                return Result("FAILED", "On-screen request does not show the matched fare — not tapping")
            }
        }
        if (acceptNodes.isEmpty()) return Result("UNAVAILABLE", "No visible Accept button found")
        if (acceptNodes.size > 1) return Result("FAILED", "Multiple Accept buttons visible — ambiguous, not tapping")

        var target: AccessibilityNodeInfo? = acceptNodes[0]
        var depth = 0
        while (target != null && !target.isClickable && depth < 5) {
            target = target.parent
            depth += 1
        }
        if (target == null || !target.isClickable) {
            return Result("UNAVAILABLE", "Accept control is not clickable via accessibility (e.g. swipe-only)")
        }
        val clicked = target.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        return if (clicked) Result("REQUESTED", "Accept tapped via accessibility") else Result("FAILED", "Tap was rejected by the system")
    }

    /** CONFIRMED only with a positive post-accept marker; conflicting/absent → UNKNOWN. */
    fun checkEvidence(platform: String): Result {
        val root = rootFor(platform) ?: return Result("UNKNOWN", "Driver app not on screen — verify manually")
        val text = StringBuilder()
        var acceptStillVisible = false
        walk(root) { node ->
            val t = label(node)
            if (t.isNotEmpty()) text.append(t).append(' ')
            if (node.isVisibleToUser && ACCEPT_LABELS.matches(t)) acceptStillVisible = true
        }
        val accepted = ACCEPTED_MARKERS.containsMatchIn(text)
        val unavailable = UNAVAILABLE_MARKERS.containsMatchIn(text)
        return when {
            accepted && !acceptStillVisible && !unavailable -> Result("CONFIRMED", "Post-accept screen detected")
            unavailable && !accepted -> Result("NOT_CONFIRMED", "Driver app reports the request is unavailable")
            acceptStillVisible && !accepted -> Result("NOT_CONFIRMED", "Accept button is still showing")
            else -> Result("UNKNOWN", "No reliable confirmation on screen")
        }
    }
}
