package expo.modules.rideassist

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-Kotlin unit tests for the notification normalizer. These run with
 * `gradlew.bat test` / `./gradlew test` in a full Android build environment
 * (see README — the Emergent container cannot execute Gradle).
 */
class RideEventNormalizerTest {

    @Test
    fun `maps configured packages to platforms`() {
        assertEquals("rapido", RideEventNormalizer.platformForPackage("com.rapido.captain"))
        assertEquals("uber", RideEventNormalizer.platformForPackage("com.ubercab.driver"))
        assertEquals("ola", RideEventNormalizer.platformForPackage("com.olacabs.driver"))
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
