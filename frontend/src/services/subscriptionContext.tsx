// Subscription Context & Hook for Ride Assist
//
// Exposes authoritative entitlement state, remaining time, active plan,
// and refresh actions across the mobile application.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import dayjs from "dayjs";
import { AppState, type AppStateStatus } from "react-native";

import {
  subscriptionService,
  type SubscriptionStatus,
} from "@/src/services/subscription";
import { useAuth } from "@/src/services/auth";

interface SubscriptionContextValue {
  subscription: SubscriptionStatus | null;
  loading: boolean;
  hasAccess: boolean;
  activePlanName: string | null;
  formattedExpiry: string | null;
  remainingTimeText: string | null;
  refresh: () => Promise<SubscriptionStatus>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<SubscriptionStatus> => {
    if (!user) {
      const empty: SubscriptionStatus = {
        has_access: false,
        entitlement_status: "none",
        server_time: new Date().toISOString(),
        reason: "Please log in to check subscription status",
      };
      setSubscription(empty);
      setLoading(false);
      return empty;
    }
    setLoading(true);
    try {
      const status = await subscriptionService.getMySubscription();
      setSubscription(status);
      return status;
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial load on user login / change
  useEffect(() => {
    void (async () => {
      // Optimistic load from local storage
      const cached = await subscriptionService.getCachedSubscription();
      if (cached) {
        setSubscription(cached);
      }
      if (user) {
        await refresh();
      } else {
        setSubscription(null);
        setLoading(false);
      }
    })();
  }, [user, refresh]);

  // Re-check entitlement when app resumes to foreground
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active" && user) {
        void refresh();
      }
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [user, refresh]);

  const hasAccess = Boolean(subscription?.has_access);

  const activePlanName = useMemo(() => {
    if (!subscription?.has_access) return null;
    return subscription.plan_name || subscription.active_plan?.toUpperCase() || null;
  }, [subscription]);

  const formattedExpiry = useMemo(() => {
    if (!subscription?.has_access) return null;
    if (subscription.entitlement_status === "lifetime_active") {
      return "Lifetime (Never Expires)";
    }
    if (!subscription.expires_at) return null;
    return dayjs(subscription.expires_at).format("DD MMM YYYY, hh:mm A");
  }, [subscription]);

  const remainingTimeText = useMemo(() => {
    if (!subscription?.has_access) return null;
    if (subscription.entitlement_status === "lifetime_active") {
      return "Permanent Access";
    }
    const rem = subscription.remaining_seconds;
    if (rem === null || rem === undefined) return null;
    if (rem <= 0) return "Expired";

    const days = Math.floor(rem / 86400);
    const hours = Math.floor((rem % 86400) / 3600);
    const mins = Math.floor((rem % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h ${mins}m remaining`;
    return `${mins}m remaining`;
  }, [subscription]);

  const value = useMemo(
    () => ({
      subscription,
      loading,
      hasAccess,
      activePlanName,
      formattedExpiry,
      remainingTimeText,
      refresh,
    }),
    [
      subscription,
      loading,
      hasAccess,
      activePlanName,
      formattedExpiry,
      remainingTimeText,
      refresh,
    ],
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return ctx;
}
