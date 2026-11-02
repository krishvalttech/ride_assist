import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { subscriptionService, SubscriptionPlan, SubscriptionStatus } from "@/src/services/subscription";
import { rideStore } from "@/src/services/rideStore";
import { acceptanceManager } from "@/src/services/acceptance";
import { storage, __resetStorage } from "./mocks/storage";
import { apiRequest } from "@/src/services/apiClient";
import type { NativeNotificationEvent } from "@/src/models/types";

// Mock apiClient and nativeBridge
jest.mock("@/src/services/apiClient", () => ({
  apiRequest: jest.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(opts: { message: string; status: number }) {
      super(opts.message);
      this.status = opts.status;
    }
  },
}));

jest.mock("@/src/services/nativeBridge", () => ({
  nativeBridge: {
    isAvailable: () => false,
    setMonitoring: async () => null,
    refreshPermissionStatus: async () => null,
    openNotificationAccessSettings: async () => undefined,
    openAccessibilitySettings: async () => undefined,
    isPackageInstalled: async () => null,
    syncPlatformPackages: async () => false,
    drainPendingEvents: async () => 0,
    addEventListener: () => () => undefined,
  },
}));

interface MockApiRequest {
  mockResolvedValueOnce: (val: any) => MockApiRequest;
  mockRejectedValueOnce: (err: any) => MockApiRequest;
  mockReset: () => void;
}
const mockApiRequest = apiRequest as unknown as MockApiRequest;

describe("Subscription Service & Access Control", () => {
  beforeEach(async () => {
    __resetStorage();
    subscriptionService.clearCache();
    subscriptionService.clearPendingOrder();
    mockApiRequest.mockReset();
    await rideStore.init();
    rideStore.setMonitoring(false);
  });

  describe("Plan Catalog", () => {
    it("returns backend canonical plans on success", async () => {
      const mockPlans: SubscriptionPlan[] = [
        {
          plan_id: "daily",
          name: "Daily Pass",
          amount_paise: 3000,
          price_inr: 30,
          currency: "INR",
          duration_type: "hours",
          duration_value: 24,
          description: "24 hours pass",
          features: ["Tracking"],
        },
      ];
      mockApiRequest.mockResolvedValueOnce(mockPlans);

      const plans = await subscriptionService.getPlans();
      expect(plans).toHaveLength(1);
      expect(plans[0].plan_id).toBe("daily");
      expect(plans[0].amount_paise).toBe(3000);
      expect(plans[0].price_inr).toBe(30);
    });

    it("falls back to hardcoded 4 canonical plans on network failure", async () => {
      mockApiRequest.mockRejectedValueOnce(new Error("Network offline"));

      const plans = await subscriptionService.getPlans();
      expect(plans).toHaveLength(4);
      expect(plans.map((p) => p.plan_id)).toEqual(["daily", "weekly", "monthly", "lifetime"]);
      expect(plans.find((p) => p.plan_id === "daily")?.amount_paise).toBe(3000);
      expect(plans.find((p) => p.plan_id === "weekly")?.amount_paise).toBe(17000);
      expect(plans.find((p) => p.plan_id === "monthly")?.amount_paise).toBe(50000);
      expect(plans.find((p) => p.plan_id === "lifetime")?.amount_paise).toBe(500000);
    });
  });

  describe("Order Creation & Verification", () => {
    it("creates an order and stores pending order details", async () => {
      const orderData = {
        local_order_id: "ord_local_123",
        razorpay_order_id: "order_rzp_456",
        amount_paise: 3000,
        price_inr: 30,
        currency: "INR",
        key_id: "rzp_test_123",
        plan_id: "daily",
        plan_name: "Daily Pass",
        user_email: "driver@test.com",
      };
      mockApiRequest.mockResolvedValueOnce(orderData);

      const order = await subscriptionService.createOrder("daily");
      expect(order.razorpay_order_id).toBe("order_rzp_456");
      expect(subscriptionService.getPendingOrder()?.razorpay_order_id).toBe("order_rzp_456");
    });

    it("verifies payment, caches entitlement, and clears pending order", async () => {
      const activeStatus: SubscriptionStatus = {
        has_access: true,
        entitlement_status: "active",
        active_plan: "daily",
        plan_name: "Daily Pass",
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        remaining_seconds: 86400,
        server_time: new Date().toISOString(),
      };

      mockApiRequest.mockResolvedValueOnce({
        success: true,
        message: "Payment verified successfully",
        entitlement: activeStatus,
      });

      const res = await subscriptionService.verifyPayment({
        razorpay_order_id: "order_rzp_456",
        razorpay_payment_id: "pay_789",
        razorpay_signature: "valid_sig",
      });

      expect(res.success).toBe(true);
      expect(subscriptionService.getPendingOrder()).toBeNull();

      const cached = await subscriptionService.getCachedSubscription();
      expect(cached?.has_access).toBe(true);
      expect(cached?.active_plan).toBe("daily");
    });
  });

  describe("Offline Entitlement Caching & Expiry", () => {
    it("returns offline cached status when network fails", async () => {
      const activeStatus: SubscriptionStatus = {
        has_access: true,
        entitlement_status: "active",
        active_plan: "weekly",
        plan_name: "Weekly Pass",
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 500000000).toISOString(),
        remaining_seconds: 500000,
        server_time: new Date().toISOString(),
      };
      await storage.setItem("subscription_status", JSON.stringify(activeStatus));

      mockApiRequest.mockRejectedValueOnce(new Error("Network timeout"));

      const sub = await subscriptionService.getMySubscription();
      expect(sub.has_access).toBe(true);
      expect(sub.active_plan).toBe("weekly");
    });

    it("marks entitlement expired if offline cached passes its expiry date", async () => {
      const expiredStatus: SubscriptionStatus = {
        has_access: true,
        entitlement_status: "active",
        active_plan: "daily",
        plan_name: "Daily Pass",
        starts_at: new Date(Date.now() - 100000000).toISOString(),
        expires_at: new Date(Date.now() - 1000).toISOString(), // expired 1s ago
        remaining_seconds: 0,
        server_time: new Date().toISOString(),
      };
      await storage.setItem("subscription_status", JSON.stringify(expiredStatus));

      mockApiRequest.mockRejectedValueOnce(new Error("Network timeout"));

      const sub = await subscriptionService.getMySubscription();
      expect(sub.has_access).toBe(false);
      expect(sub.entitlement_status).toBe("expired");
    });
  });

  describe("Tracking Access Control & Entitlement Guards", () => {
    it("rideStore startup enforces that monitoring is disabled without active subscription", async () => {
      const expiredSub: SubscriptionStatus = {
        has_access: false,
        entitlement_status: "expired",
        server_time: new Date().toISOString(),
      };
      await storage.setItem("subscription_status", JSON.stringify(expiredSub));
      await storage.setItem("rideassist_monitoring_v1", "true");

      // Reset store readiness to trigger init logic
      (rideStore as unknown as { state: { ready: boolean } }).state.ready = false;
      await rideStore.init();

      expect(rideStore.getSnapshot().monitoring).toBe(false);
    });

    it("initiateAcceptance blocks auto-accept when user has no active subscription", async () => {
      // Ingest a real ride request
      const testEvent: NativeNotificationEvent = {
        id: "evt_guard_accept",
        platform: "rapido",
        title: "Rapido Captain",
        text: "₹250 cab ride, pickup 1.5 km",
        postedAt: Date.now(),
        source: "notification",
        removed: false,
        simulated: false,
      };

      const ingested = await rideStore.ingestNotification(testEvent);
      expect(ingested).not.toBeNull();
      expect(ingested!.status).toBe("AWAITING_CONFIRMATION");

      // Now set inactive/expired subscription
      const noSub: SubscriptionStatus = {
        has_access: false,
        entitlement_status: "expired",
        server_time: new Date().toISOString(),
      };
      await storage.setItem("subscription_status", JSON.stringify(noSub));
      subscriptionService.clearCache();

      const result = await acceptanceManager.initiateAcceptance(ingested!.id);
      expect(result.ok).toBe(false);
      expect(result.message).toContain("Active subscription pass required");
      expect(result.manualFallback).toBe(true);
    });
  });
});
