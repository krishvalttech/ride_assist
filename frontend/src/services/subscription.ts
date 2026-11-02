// Subscription and Payment Client Service
//
// Manages Razorpay order creation, payment verification, and authoritative
// entitlement checks with the Ride Assist backend.
import { apiRequest } from "@/src/services/apiClient";
import { storage } from "@/src/utils/storage";

export type PlanDurationType = "hours" | "days" | "months" | "lifetime";

export interface SubscriptionPlan {
  plan_id: "daily" | "weekly" | "monthly" | "lifetime";
  name: string;
  amount_paise: number;
  price_inr: number;
  currency: string;
  duration_type: PlanDurationType;
  duration_value: number;
  description: string;
  features: string[];
}

export type EntitlementStatus =
  | "active"
  | "lifetime_active"
  | "expired"
  | "none"
  | "revoked"
  | "cancelled";

export interface SubscriptionStatus {
  has_access: boolean;
  entitlement_status: EntitlementStatus;
  active_plan?: string | null;
  plan_name?: string | null;
  starts_at?: string | null;
  expires_at?: string | null;
  remaining_seconds?: number | null;
  server_time: string;
  reason?: string | null;
}

export interface OrderDetails {
  local_order_id: string;
  razorpay_order_id: string;
  amount_paise: number;
  price_inr: number;
  currency: string;
  key_id: string;
  plan_id: string;
  plan_name: string;
  user_email: string;
}

export interface VerifyPaymentPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface PaymentVerificationResult {
  success: boolean;
  message: string;
  entitlement: SubscriptionStatus;
}

export interface PurchaseHistoryItem {
  payment_id: string;
  plan_id: string;
  plan_name: string;
  amount_paise: number;
  amount_inr: number;
  currency: string;
  payment_status: string;
  razorpay_order_id: string;
  razorpay_payment_id?: string;
  created_at: string;
}

const STORAGE_KEY_SUB = "subscription_status";

// Hardcoded fallback plans if network is unreachable
export const FALLBACK_PLANS: SubscriptionPlan[] = [
  {
    plan_id: "daily",
    name: "Daily Pass",
    amount_paise: 3000,
    price_inr: 30,
    currency: "INR",
    duration_type: "hours",
    duration_value: 24,
    description: "24 hours of unlimited ride tracking & auto-accept",
    features: [
      "24 hours unlimited tracking",
      "Rapido, Uber & Ola monitoring",
      "Auto-accept assistance",
      "Spoken voice alerts",
    ],
  },
  {
    plan_id: "weekly",
    name: "Weekly Pass",
    amount_paise: 17000,
    price_inr: 170,
    currency: "INR",
    duration_type: "days",
    duration_value: 7,
    description: "7 days of unlimited ride tracking & auto-accept",
    features: [
      "7 days unlimited tracking",
      "All driver platforms supported",
      "Full profit & filter rules",
      "Priority notification alerts",
    ],
  },
  {
    plan_id: "monthly",
    name: "Monthly Pass",
    amount_paise: 50000,
    price_inr: 500,
    currency: "INR",
    duration_type: "months",
    duration_value: 1,
    description: "One calendar month with month-end date protection",
    features: [
      "Full calendar month validity",
      "All driver platforms supported",
      "Daily & weekly earnings analytics",
      "Auto-accept assistance",
    ],
  },
  {
    plan_id: "lifetime",
    name: "Lifetime Pass",
    amount_paise: 500000,
    price_inr: 5000,
    currency: "INR",
    duration_type: "lifetime",
    duration_value: 0,
    description: "Lifetime access with no periodic expiration",
    features: [
      "Permanent unlimited access",
      "No recurring payments or renewals",
      "All future platform updates",
      "Priority support & telemetry",
    ],
  },
];

class SubscriptionService {
  private cachedStatus: SubscriptionStatus | null = null;
  private pendingOrder: OrderDetails | null = null;

  private async getAuthToken(): Promise<string | null> {
    try {
      const token = await storage.secureGet("auth_token", "");
      return token || null;
    } catch {
      return null;
    }
  }

  async getPlans(): Promise<SubscriptionPlan[]> {
    try {
      const token = await this.getAuthToken();
      const plans = await apiRequest<SubscriptionPlan[]>("/subscriptions/plans", {
        method: "GET",
        token,
      });
      return plans && plans.length > 0 ? plans : FALLBACK_PLANS;
    } catch {
      return FALLBACK_PLANS;
    }
  }

  async getCachedSubscription(): Promise<SubscriptionStatus | null> {
    if (this.cachedStatus) return this.cachedStatus;
    try {
      const raw = await storage.getItem(STORAGE_KEY_SUB, "");
      if (raw) {
        const parsed = JSON.parse(raw) as SubscriptionStatus;
        this.cachedStatus = parsed;
        return parsed;
      }
    } catch {
      // ignore
    }
    return null;
  }

  async getMySubscription(): Promise<SubscriptionStatus> {
    try {
      const token = await this.getAuthToken();
      const status = await apiRequest<SubscriptionStatus>("/subscriptions/me", {
        method: "GET",
        token,
      });
      this.cachedStatus = status;
      await storage.setItem(STORAGE_KEY_SUB, JSON.stringify(status));
      return status;
    } catch {
      // Fallback to cached status if offline
      const cached = await this.getCachedSubscription();
      if (cached) {
        // If cached time has expired, conservatively mark false
        if (cached.expires_at && new Date(cached.expires_at).getTime() < Date.now()) {
          return {
            ...cached,
            has_access: false,
            entitlement_status: "expired",
            reason: "Subscription expired. Reconnect to renew.",
          };
        }
        return cached;
      }
      return {
        has_access: false,
        entitlement_status: "none",
        server_time: new Date().toISOString(),
        reason: "Unable to verify subscription with server. Check internet connection.",
      };
    }
  }

  async createOrder(plan_id: string): Promise<OrderDetails> {
    const token = await this.getAuthToken();
    const order = await apiRequest<OrderDetails>("/subscriptions/orders", {
      method: "POST",
      body: { plan_id },
      token,
    });
    this.pendingOrder = order;
    return order;
  }

  getPendingOrder(): OrderDetails | null {
    return this.pendingOrder;
  }

  clearPendingOrder(): void {
    this.pendingOrder = null;
  }

  async verifyPayment(payload: VerifyPaymentPayload): Promise<PaymentVerificationResult> {
    const token = await this.getAuthToken();
    const result = await apiRequest<PaymentVerificationResult>("/subscriptions/verify-payment", {
      method: "POST",
      body: payload,
      token,
    });
    if (result.success && result.entitlement) {
      this.cachedStatus = result.entitlement;
      await storage.setItem(STORAGE_KEY_SUB, JSON.stringify(result.entitlement));
      this.clearPendingOrder();
    }
    return result;
  }

  async getHistory(): Promise<PurchaseHistoryItem[]> {
    try {
      const token = await this.getAuthToken();
      const history = await apiRequest<PurchaseHistoryItem[]>("/subscriptions/history", {
        method: "GET",
        token,
      });
      return history || [];
    } catch {
      return [];
    }
  }

  clearCache(): void {
    this.cachedStatus = null;
    void storage.removeItem(STORAGE_KEY_SUB);
  }
}

export const subscriptionService = new SubscriptionService();
