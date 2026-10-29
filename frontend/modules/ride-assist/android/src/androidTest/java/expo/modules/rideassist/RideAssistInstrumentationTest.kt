package expo.modules.rideassist

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumentation smoke test — requires a device or emulator.
 * Run with: gradlew.bat connectedAndroidTest
 */
@RunWith(AndroidJUnit4::class)
class RideAssistInstrumentationTest {

    @Test
    fun eventHubBuffersAndDrains() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        assertNotNull(context)

        RideAssistContextHolder.applicationContext = context
        assertEquals(0, RideAssistEventHub.bufferedCount())

        val event = RideEventNormalizer.buildEvent(
            id = "itest-1",
            platform = "rapido",
            title = "New ride request",
            text = "₹184 · Pickup 1.2 km",
            subText = null,
            postedAt = System.currentTimeMillis(),
            source = "notification",
            removed = false,
        )
        RideAssistEventHub.emit(event)
        assertEquals(1, RideAssistEventHub.bufferedCount())

        val drained = RideAssistEventHub.drainPending()
        assertEquals(1, drained.length())
        assertEquals("rapido", drained.getJSONObject(0).optString("platform"))
        assertEquals(0, RideAssistEventHub.bufferedCount())
    }
}
