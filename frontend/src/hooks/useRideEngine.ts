// React bindings for the ride store (useSyncExternalStore with selector support).
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { rideStore, type RideAssistState } from "@/src/services/rideStore";
import { nativeBridge } from "@/src/services/nativeBridge";
import { subscriptionService } from "@/src/services/subscription";
import type { DiagnosticCategory, DiagnosticEntry, RideRequest } from "@/src/models/types";

export function useRideAssistState(): RideAssistState {
  return useSyncExternalStore(rideStore.subscribe, rideStore.getSnapshot, rideStore.getSnapshot);
}

/**
 * Granular selector hook: components subscribe only to the slice of state
 * they need. Prevents re-renders across the entire tree when unrelated
 * store keys change.
 */
export function useRideAssistSelector<T>(
  selector: (state: RideAssistState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const sliceRef = useRef<T | undefined>(undefined);

  const getSnapshot = useCallback(() => {
    const next = selector(rideStore.getSnapshot());
    if (sliceRef.current !== undefined && isEqual(sliceRef.current, next)) {
      return sliceRef.current;
    }
    sliceRef.current = next;
    return next;
  }, [selector, isEqual]);

  return useSyncExternalStore(rideStore.subscribe, getSnapshot, getSnapshot);
}

export function useRideAssistReady(): boolean {
  return useRideAssistSelector((s) => s.ready);
}

export function useSimulatorOn(): boolean {
  return useRideAssistSelector((s) => s.simulatorOn);
}

export function useVoiceAlertsOn(): boolean {
  return useRideAssistSelector((s) => s.voiceAlertsOn);
}

export function useMonitoringState(): {
  monitoring: boolean;
  nativePermission: RideAssistState["nativePermission"];
} {
  return useRideAssistSelector(
    (s) => ({
      monitoring: s.monitoring,
      nativePermission: s.nativePermission,
    }),
    (a, b) =>
      a.monitoring === b.monitoring &&
      a.nativePermission?.notificationListener === b.nativePermission?.notificationListener &&
      a.nativePermission?.accessibility === b.nativePermission?.accessibility,
  );
}

/** One-time engine init: loads persisted state, starts the expiry sweeper. */
export function useRideEngineInit(): boolean {
  const ready = useRideAssistReady();
  useEffect(() => {
    void rideStore.init();
  }, []);
  return ready;
}

export type RideFilter = "all" | "active" | "eligible" | "rejected" | "accepted";

export function useFilteredRides(filter: RideFilter): RideRequest[] {
  const rides = useRideAssistSelector((s) => s.rides);
  return useMemo(() => {
    switch (filter) {
      case "active":
        return rides.filter((r) => !isTerminalStatus(r.status));
      case "eligible":
        return rides.filter((r) => r.ruleResult?.eligible && !isTerminalStatus(r.status));
      case "rejected":
        return rides.filter((r) => r.status === "REJECTED");
      case "accepted":
        return rides.filter((r) => r.status === "ACCEPTED");
      default:
        return rides;
    }
  }, [rides, filter]);
}

function isTerminalStatus(status: RideRequest["status"]): boolean {
  return status === "ACCEPTED" || status === "REJECTED" || status === "FAILED" || status === "EXPIRED";
}

export type LogFilter = "all" | DiagnosticCategory;

export function useFilteredLogs(filter: LogFilter): DiagnosticEntry[] {
  const logs = useRideAssistSelector((s) => s.logs);
  return useMemo(() => {
    const reversed = [...logs].reverse(); // newest first
    return filter === "all" ? reversed : reversed.filter((l) => l.category === filter);
  }, [logs, filter]);
}

/**
 * Wire the native listener (when present) to the store: live events,
 * buffered-event drain on mount, and permission polling while monitoring.
 * Safe no-op in Expo Go / web.
 */
export function useNativeListenerWiring(): void {
  const monitoring = useRideAssistSelector((s) => s.monitoring);
  const platformConfigs = useRideAssistSelector((s) => s.platformConfigs);

  // Keep the native listener's package → platform map in sync with the
  // (user-editable) platform configuration.
  useEffect(() => {
    if (!nativeBridge.isAvailable()) return;
    const map: Record<string, string> = {};
    for (const config of platformConfigs) map[config.platform] = config.packageName;
    void nativeBridge.syncPlatformPackages(map);
  }, [platformConfigs]);

  useEffect(() => {
    if (!nativeBridge.isAvailable()) return;
    const off = nativeBridge.addEventListener((event) => {
      void rideStore.ingestNotification(event);
    });
    void nativeBridge.drainPendingEvents((event) => {
      void rideStore.ingestNotification(event);
    });
    void nativeBridge.refreshPermissionStatus().then((status) => {
      if (status) rideStore.setNativePermission(status);
    });
    return off;
  }, []);

  useEffect(() => {
    if (!nativeBridge.isAvailable() || !monitoring) return;
    const timer = setInterval(() => {
      void nativeBridge.refreshPermissionStatus().then((status) => {
        if (status) rideStore.setNativePermission(status);
      });
    }, 15000);
    return () => clearInterval(timer);
  }, [monitoring]);
}

/** Convenience callbacks wired to the store + native bridge. */
export function useMonitoringControls() {
  return useMemo(
    () => ({
      toggleMonitoring: async (): Promise<{ next: boolean; acknowledged: boolean | null; blockedReason?: string }> => {
        const current = rideStore.getSnapshot().monitoring;
        const next = !current;
        if (next) {
          // Mandatory Tracking Access Guard: check server entitlement
          const sub = await subscriptionService.getMySubscription();
          if (!sub.has_access) {
            return {
              next: false,
              acknowledged: false,
              blockedReason: sub.reason || "Active subscription pass required to start tracking",
            };
          }
        }
        const acknowledged = await nativeBridge.setMonitoring(next); // null = no native module
        rideStore.setMonitoring(next);
        return { next, acknowledged };
      },
      openNotificationAccessSettings: () => nativeBridge.openNotificationAccessSettings(),
      openAccessibilitySettings: () => nativeBridge.openAccessibilitySettings(),
      refreshPermissions: async () => {
        const status = await nativeBridge.refreshPermissionStatus();
        rideStore.setNativePermission(status);
        return status;
      },
    }),
    [],
  );
}
