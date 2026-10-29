// Typed wrapper around the RideAssist native Android module (Kotlin).
//
// The module is present only in a development/production Android build
// (modules/ride-assist). In Expo Go or on web it is absent — every call
// degrades to a safe, clearly-reported no-op instead of crashing.
//
// Guarantees:
// - At most ONE native event subscription exists at any time (fan-out to
//   registered JS handlers, removed when the last handler unsubscribes).
// - Events emitted before the JS tree mounted are pulled via
//   drainPendingEvents (native buffers them, bounded).
// - Malformed native payloads are dropped.
import { requireOptionalNativeModule } from "expo-modules-core";
import { AppState } from "react-native";
import { useEffect, useRef } from "react";
import type { NativeNotificationEvent } from "@/src/models/types";

export type PermissionState = "granted" | "denied" | "unavailable";

export interface NativePermissionStatusPayload {
  notificationListener: PermissionState;
  accessibility: PermissionState;
}

interface RideAssistNativeModule {
  getPermissionStatus?: () => Promise<NativePermissionStatusPayload>;
  openNotificationAccessSettings?: () => Promise<void>;
  openAccessibilitySettings?: () => Promise<void>;
  startMonitoring?: () => Promise<boolean>;
  stopMonitoring?: () => Promise<boolean>;
  isPackageInstalled?: (packageName: string) => Promise<boolean>;
  syncPlatformPackages?: (packages: Record<string, string>) => Promise<boolean>;
  getPendingEvents?: () => Promise<NativeNotificationEvent[]>;
  clearPendingEvents?: () => Promise<void>;
  addListener?: (eventName: string, listener: (event: NativeNotificationEvent) => void) => { remove: () => void };
}

let cachedModule: RideAssistNativeModule | null | undefined;

export function getNativeModule(): RideAssistNativeModule | null {
  if (cachedModule !== undefined) return cachedModule;
  try {
    const mod = requireOptionalNativeModule<RideAssistNativeModule>("RideAssist");
    cachedModule = mod ?? null;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export function nativeModuleAvailable(): boolean {
  return getNativeModule() !== null;
}

function isRideAssistEvent(value: unknown): value is NativeNotificationEvent {
  if (typeof value !== "object" || value === null) return false;
  const evt = value as Partial<NativeNotificationEvent>;
  return (
    typeof evt.id === "string" &&
    (evt.platform === "rapido" || evt.platform === "uber" || evt.platform === "ola") &&
    typeof evt.title === "string" &&
    typeof evt.text === "string" &&
    typeof evt.postedAt === "number" &&
    (evt.source === "notification" || evt.source === "screen") &&
    typeof evt.removed === "boolean"
  );
}

type NativeEventHandler = (event: NativeNotificationEvent) => void;

class NativeBridge {
  private handlers = new Set<NativeEventHandler>();
  private subscription: { remove: () => void } | null = null;
  private appStateSub: { remove: () => void } | null = null;

  isAvailable(): boolean {
    return nativeModuleAvailable();
  }

  async refreshPermissionStatus(): Promise<NativePermissionStatusPayload | null> {
    const mod = getNativeModule();
    if (!mod?.getPermissionStatus) return null;
    try {
      return await mod.getPermissionStatus();
    } catch {
      return null;
    }
  }

  async openNotificationAccessSettings(): Promise<void> {
    await getNativeModule()?.openNotificationAccessSettings?.();
  }

  async openAccessibilitySettings(): Promise<void> {
    await getNativeModule()?.openAccessibilitySettings?.();
  }

  /** Returns true when the native listener acknowledged, null when unavailable. */
  async setMonitoring(on: boolean): Promise<boolean | null> {
    const mod = getNativeModule();
    const fn = on ? mod?.startMonitoring : mod?.stopMonitoring;
    if (!fn) return null;
    try {
      return (await fn()) === true;
    } catch {
      return null;
    }
  }

  async isPackageInstalled(packageName: string): Promise<boolean | null> {
    const fn = getNativeModule()?.isPackageInstalled;
    if (!fn) return null;
    try {
      return (await fn(packageName)) === true;
    } catch {
      return null;
    }
  }

  /** Push the (possibly user-corrected) platform → package-id map to the native listener. */
  async syncPlatformPackages(packages: Record<string, string>): Promise<boolean> {
    const fn = getNativeModule()?.syncPlatformPackages;
    if (!fn) return false;
    try {
      return (await fn(packages)) === true;
    } catch {
      return false;
    }
  }

  /**
   * Pull events that were buffered natively before the JS tree was ready
   * (cold start, process death, background launch). Buffered events are
   * cleared after a successful drain.
   */
  async drainPendingEvents(handler: NativeEventHandler): Promise<number> {
    const mod = getNativeModule();
    if (!mod?.getPendingEvents) return 0;
    try {
      const pending = (await mod.getPendingEvents()) ?? [];
      const valid = pending.filter(isRideAssistEvent);
      for (const event of valid) handler(event);
      await mod.clearPendingEvents?.();
      return valid.length;
    } catch {
      return 0;
    }
  }

  /**
   * Register a handler for live native events. Exactly one native
   * subscription exists while at least one handler is registered.
   */
  addEventListener(handler: NativeEventHandler): () => void {
    this.handlers.add(handler);
    this.ensureSubscription();
    this.ensureAppStateDrain(handler);
    return () => {
      this.handlers.delete(handler);
      if (this.handlers.size === 0 && this.subscription) {
        this.subscription.remove();
        this.subscription = null;
      }
    };
  }

  private ensureSubscription() {
    if (this.subscription) return;
    const mod = getNativeModule();
    if (!mod?.addListener) return;
    try {
      this.subscription = mod.addListener("onRideAssistEvent", (event: NativeNotificationEvent) => {
        if (!isRideAssistEvent(event)) return;
        for (const handler of this.handlers) handler(event);
      });
    } catch {
      this.subscription = null;
    }
  }

  private appStateListener: NativeEventHandler | null = null;

  private ensureAppStateDrain(handler: NativeEventHandler) {
    if (this.appStateSub) return;
    this.appStateListener = handler;
    this.appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void this.drainPendingEvents((event) => this.dispatch(event));
      }
    });
  }

  private dispatch(event: NativeNotificationEvent) {
    for (const handler of this.handlers) handler(event);
  }
}

export const nativeBridge = new NativeBridge();

/** Hook: subscribe to native events + drain buffered ones while mounted. */
export function useNativeRideEvents(onEvent: NativeEventHandler): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  useEffect(() => {
    const forward = (event: NativeNotificationEvent) => handlerRef.current(event);
    const off = nativeBridge.addEventListener(forward);
    void nativeBridge.drainPendingEvents(forward);
    return off;
  }, []);
}
