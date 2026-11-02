import { describe, expect, it, jest } from "@jest/globals";
import { nativeBridge } from "@/src/services/nativeBridge";
import type { NativeNotificationEvent } from "@/src/models/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely-typed test doubles
type AnyFn = (...args: any[]) => any;
const mockModule = {
  addListener: jest.fn<AnyFn>(),
  getPendingEvents: jest.fn<AnyFn>(),
  clearPendingEvents: jest.fn<AnyFn>(),
  getPermissionStatus: jest.fn<AnyFn>(),
  startMonitoring: jest.fn<AnyFn>(),
};

jest.mock("react-native", () => ({
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
}));

jest.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => mockModule,
}));

const validEvent: NativeNotificationEvent = {
  id: "evt_1",
  platform: "rapido",
  title: "New ride request",
  text: "Ride request — ₹184",
  postedAt: 1720000000000,
  source: "notification",
  removed: false,
};

describe("native bridge wrapper", () => {
  it("reports the native module as available when present", () => {
    expect(nativeBridge.isAvailable()).toBe(true);
  });

  it("fans live events out to every handler with exactly ONE native subscription", () => {
    let nativeCallback: ((event: NativeNotificationEvent) => void) | null = null;
    mockModule.addListener.mockImplementation((_name: string, cb: (e: NativeNotificationEvent) => void) => {
      nativeCallback = cb;
      return { remove: () => (nativeCallback = null) };
    });

    const receivedA: NativeNotificationEvent[] = [];
    const receivedB: NativeNotificationEvent[] = [];
    const offA = nativeBridge.addEventListener((e) => receivedA.push(e));
    const offB = nativeBridge.addEventListener((e) => receivedB.push(e));
    expect(mockModule.addListener).toHaveBeenCalledTimes(1);

    nativeCallback!(validEvent);
    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(1);

    offA();
    offB();
    expect(nativeCallback).toBeNull(); // native subscription removed with the last handler
  });

  it("drops malformed native payloads", () => {
    let nativeCallback: ((event: NativeNotificationEvent) => void) | null = null;
    mockModule.addListener.mockImplementation((_name: string, cb: (e: NativeNotificationEvent) => void) => {
      nativeCallback = cb;
      return { remove: () => (nativeCallback = null) };
    });

    const received: NativeNotificationEvent[] = [];
    const off = nativeBridge.addEventListener((e) => received.push(e));
    nativeCallback!({ garbage: true } as unknown as NativeNotificationEvent);
    nativeCallback!({ ...validEvent, platform: "swiggy" } as unknown as NativeNotificationEvent);
    expect(received).toHaveLength(0);
    off();
  });

  it("drains buffered events once and clears the buffer", async () => {
    mockModule.getPendingEvents.mockResolvedValue([
      validEvent,
      { malformed: true },
    ]);
    mockModule.clearPendingEvents.mockResolvedValue(undefined);

    const received: NativeNotificationEvent[] = [];
    const count = await nativeBridge.drainPendingEvents((e) => received.push(e));
    expect(count).toBe(1);
    expect(received[0].id).toBe("evt_1");
    expect(mockModule.clearPendingEvents).toHaveBeenCalled();
  });

  it("passes permission status through", async () => {
    mockModule.getPermissionStatus.mockResolvedValue({
      notificationListener: "granted",
      accessibility: "denied",
    });
    const status = await nativeBridge.refreshPermissionStatus();
    expect(status?.notificationListener).toBe("granted");
    expect(status?.accessibility).toBe("denied");
  });

  it("start/stop monitoring propagates the native acknowledgement", async () => {
    mockModule.startMonitoring.mockResolvedValue(true);
    const result = await nativeBridge.setMonitoring(true);
    expect(result).toBe(true);
    expect(mockModule.startMonitoring).toHaveBeenCalled();
  });
});
