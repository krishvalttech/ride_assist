// React bindings for the ride store (useSyncExternalStore — no extra deps).
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { rideStore, type RideAssistState } from "@/src/services/rideStore";
import { nativeBridge } from "@/src/services/nativeBridge";
import type { DiagnosticCategory, DiagnosticEntry, RideRequest } from "@/src/models/types";

export function useRideAssistState(): RideAssistState {
  return useSyncExternalStore(rideStore.subscribe, rideStore.getSnapshot, rideStore.getSnapshot);
}

export function useRideAssistReady(): boolean {
  const state = useRideAssistState();
  return state.ready;
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
  const state = useRideAssistState();
  return useMemo(() => {
    const rides = state.rides;
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
  }, [state.rides, filter]);
}

function isTerminalStatus(status: RideRequest["status"]): boolean {
  return status === "ACCEPTED" || status === "REJECTED" || status === "FAILED" || status === "EXPIRED";
}

export type LogFilter = "all" | DiagnosticCategory;

export function useFilteredLogs(filter: LogFilter): DiagnosticEntry[] {
  const state = useRideAssistState();
  return useMemo(() => {
    const logs = [...state.logs].reverse(); // newest first
    return filter === "all" ? logs : logs.filter((l) => l.category === filter);
  }, [state.logs, filter]);
}

/**
 * Wire the native listener (when present) to the store: live events,
 * buffered-event drain on mount, and permission polling while monitoring.
 * Safe no-op in Expo Go / web.
 */
export function useNativeListenerWiring(): void {
  const state = useRideAssistState();
  const monitoring = state.monitoring;
  const platformConfigs = state.platformConfigs;

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
      toggleMonitoring: async () => {
        const next = !rideStore.getSnapshot().monitoring;
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
