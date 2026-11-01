package expo.modules.rideassist

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-Kotlin unit tests for the notification normalizer and rate-limit
 * gating. These run with `gradlew.bat test` / `./gradlew test` in a full
 * Android build environment.
 */
class RideEventNormalizerTest {

    @Test
    fun `maps configured packages to platforms`() {
        assertEquals("rapido", RideEventNormalizer.platformForPackage("com.rapido.captain"))
        assertEquals("rapido", RideEventNormalizer.platformForPackage("com.rapido.partner"))
        assertEquals("uber", RideEventNormalizer.platformForPackage("com.ubercab.driver"))
        assertEquals("ola", RideEventNormalizer.platformForPackage("com.olacabs.oladriver"))
        assertEquals("ola", RideEventNormalizer.platformForPackage("com.olacabs.driver"))
    }

    @Test
    fun `resolves custom synced packages and falls back to defaults`() {
        val synced = """{"rapido":"com.custom.rapido","uber":"com.ubercab.driver"}"""
        assertEquals("rapido", RideEventNormalizer.resolvePlatform("com.custom.rapido", synced))
        assertEquals("ola", RideEventNormalizer.resolvePlatform("com.olacabs.oladriver", synced))
        assertNull(RideEventNormalizer.resolvePlatform("com.whatsapp", synced))
    }

    @Test
    fun `ignores unconfigured packages`() {
        assertNull(RideEventNormalizer.platformForPackage("com.whatsapp"))
        assertNull(RideEventNormalizer.platformForPackage("com.android.systemui"))
    }

    @Test
    fun `ride keywords gate notifications`() {
        assertTrue(RideEventNormalizer.looksLikeRideNotification("New ride request", "₹184 pickup 1.2 km"))
        assertTrue(RideEventNormalizer.looksLikeRideNotification("Trip request", "Tap to accept"))
        assertFalse(RideEventNormalizer.looksLikeRideNotification("Verification", "Your OTP is 482113"))
        assertFalse(RideEventNormalizer.looksLikeRideNotification("", ""))
    }

    @Test
    fun `rate limiting never discards a legitimate new ride request screen after non-ride noise`() {
        val t0 = 1_000_000L
        // 1. Non-ride screen emitted at t0
        assertTrue(
            RideEventNormalizer.shouldEmitScreenObservation(
                text = "Online · Searching for rides",
                nowMs = t0,
                lastEmitMs = 0L,
                lastRideHash = null,
                rateLimitMs = 2000L,
            ),
        )
        // 2. Non-ride update 200ms later is suppressed by rate limit
        assertFalse(
            RideEventNormalizer.shouldEmitScreenObservation(
                text = "Online · Searching for rides · Map updated",
                nowMs = t0 + 200L,
                lastEmitMs = t0,
                lastRideHash = null,
                rateLimitMs = 2000L,
            ),
        )
        // 3. Legitimate ride request card 300ms after t0 MUST NOT be discarded
        val rideCard = "Bike ₹184 Pickup 1.2 km Drop 6.4 km Accept"
        assertTrue(
            RideEventNormalizer.shouldEmitScreenObservation(
                text = rideCard,
                nowMs = t0 + 300L,
                lastEmitMs = t0,
                lastRideHash = null,
                rateLimitMs = 2000L,
            ),
        )
        // 4. Identical ride card 500ms later is rate-limited
        assertFalse(
            RideEventNormalizer.shouldEmitScreenObservation(
                text = rideCard,
                nowMs = t0 + 500L,
                lastEmitMs = t0 + 300L,
                lastRideHash = rideCard.hashCode(),
                rateLimitMs = 2000L,
            ),
        )
    }

    @Test
    fun `redacts otp codes and long digit runs`() {
        val redacted = RideEventNormalizer.redact("Your OTP is 482113. Call +91 9876543210")
        assertFalse(redacted.contains("482113"))
        assertFalse(redacted.contains("9876543210"))
        assertTrue(redacted.contains("••••"))
    }

    @Test
    fun `redacts labeled passcodes`() {
        val redacted = RideEventNormalizer.redact("code 5521 for your order")
        assertFalse(redacted.contains("5521"))
    }

    @Test
    fun `keeps fares readable`() {
        val redacted = RideEventNormalizer.redact("Fare ₹184")
        assertTrue(redacted.contains("184"))
    }

    @Test
    fun `builds normalized event with bounded fields`() {
        val event = RideEventNormalizer.buildEvent(
            id = "n1",
            platform = "rapido",
            title = "New ride request",
            text = "Ride request — ₹184 · Pickup 1.2 km",
            subText = null,
            postedAt = 1720000000000L,
            source = "notification",
            removed = false,
        )
        assertEquals("rapido", event.optString("platform"))
        assertEquals(1720000000000L, event.optLong("postedAt"))
        assertFalse(event.optBoolean("removed"))
        assertEquals("notification", event.optString("source"))
    }

    @Test
    fun `persistence preview is redacted and bounded`() {
        val event = RideEventNormalizer.buildEvent(
            id = "n2",
            platform = "uber",
            title = "Verification code 998877",
            text = "Your driver OTP is 45678912 share karein".repeat(20),
            subText = null,
            postedAt = 1720000000000L,
            source = "notification",
            removed = false,
        )
        val preview = RideEventNormalizer.previewForPersistence(event)
        val previewText = preview.optString("preview")
        assertTrue(previewText.length <= 160)
        assertFalse(previewText.contains("998877"))
        assertFalse(previewText.contains("45678912"))
    }
}
