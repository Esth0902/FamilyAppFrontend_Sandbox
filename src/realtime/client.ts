import { API_BASE_URL } from "@/src/api/client";
import { getAuthStateSnapshot, hydrateAuthState } from "@/src/store/useAuthStore";
import {
  resolvePublicPusherCluster,
  resolvePublicReverbHost,
  resolvePublicReverbKey,
  resolvePublicReverbPort,
  resolvePublicReverbScheme,
} from "@/src/config/public-env";

export type RealtimeMessage = {
  module?: string;
  type?: string;
  payload?: Record<string, unknown>;
  emitted_at?: string;
};

export type HouseholdRealtimeMessage = RealtimeMessage;
export type UserRealtimeMessage = RealtimeMessage;

type RealtimeCallback = (message: RealtimeMessage) => void;
type RealtimeErrorCallback = (error: unknown) => void;

type PusherInstance = any;
type PusherConstructor = new (key: string, options: Record<string, unknown>) => PusherInstance;

let pusherInstance: PusherInstance | null = null;
let pusherToken: string | null = null;
let pusherInitPromise: Promise<PusherInstance | null> | null = null;
let pusherCtorPromise: Promise<PusherConstructor | null> | null = null;
let realtimeListenerIdCounter = 1;

type RealtimeListener = {
  onMessage: RealtimeCallback;
  onError?: RealtimeErrorCallback;
};

type RealtimeSubscriptionEntry = {
  pusher: PusherInstance;
  channelName: string;
  eventName: string;
  channel: any;
  listeners: Map<number, RealtimeListener>;
  mode: "ephemeral" | "sticky";
  teardownTimer: ReturnType<typeof setTimeout> | null;
  realtimeHandler: (message: RealtimeMessage) => void;
  subscribedHandler: () => void;
  errorHandler: (error: unknown) => void;
  connectionErrorHandler: (error: unknown) => void;
};

const realtimeSubscriptionRegistry = new Map<string, RealtimeSubscriptionEntry>();
const REALTIME_SUBSCRIPTION_RETAIN_MS = 90_000;

const buildSubscriptionKey = (channelName: string, eventName: string) => `${channelName}::${eventName}`;

function disposeRealtimeSubscription(subscriptionKey: string, subscription: RealtimeSubscriptionEntry) {
  if (subscription.teardownTimer) {
    clearTimeout(subscription.teardownTimer);
    subscription.teardownTimer = null;
  }

  subscription.channel.unbind(subscription.eventName, subscription.realtimeHandler);
  subscription.channel.unbind("pusher:subscription_succeeded", subscription.subscribedHandler);
  subscription.channel.unbind("pusher:subscription_error", subscription.errorHandler);
  subscription.pusher.connection.unbind("error", subscription.connectionErrorHandler);
  subscription.pusher.unsubscribe(subscription.channelName);
  realtimeSubscriptionRegistry.delete(subscriptionKey);
}

const clearRealtimeSubscriptionRegistry = () => {
  for (const [subscriptionKey, subscription] of realtimeSubscriptionRegistry.entries()) {
    disposeRealtimeSubscription(subscriptionKey, subscription);
  }
  realtimeListenerIdCounter = 1;
};

const loadPusherConstructor = async (): Promise<PusherConstructor | null> => {
  if (!pusherCtorPromise) {
    pusherCtorPromise = import("pusher-js/react-native")
      .then((module) => module.default as unknown as PusherConstructor)
      .catch(() => null);
  }

  return pusherCtorPromise;
};

const trimRightSlash = (value: string) => value.replace(/\/+$/, "");

const resolveApiBase = () => {
  if (!API_BASE_URL) {
    return null;
  }
  return trimRightSlash(API_BASE_URL);
};

const resolveReverbHost = () => {
  const explicit = resolvePublicReverbHost();
  if (explicit) {
    return explicit;
  }

  const apiBase = resolveApiBase();
  if (!apiBase) {
    return null;
  }

  try {
    return new URL(apiBase).hostname;
  } catch {
    return null;
  }
};

const resolveReverbPort = (scheme: "http" | "https") => {
  const explicit = Number(resolvePublicReverbPort());
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  return scheme === "https" ? 443 : 8080;
};

const resolveReverbScheme = () => {
  const explicit = resolvePublicReverbScheme()?.toLowerCase();
  if (explicit === "http" || explicit === "https") {
    return explicit;
  }

  const apiBase = resolveApiBase();
  if (!apiBase) {
    return "http";
  }

  try {
    return new URL(apiBase).protocol === "https:" ? "https" : "http";
  } catch {
    return "http";
  }
};

const resolveRealtimeConfig = () => {
  const apiBase = resolveApiBase();
  const host = resolveReverbHost();

  if (!apiBase || !host) {
    return null;
  }

  const scheme = resolveReverbScheme();
  const port = resolveReverbPort(scheme);
  const key = resolvePublicReverbKey() || "familyapp-local-key";

  return {
    key,
    host,
    port,
    scheme,
    authEndpoint: `${apiBase}/broadcasting/auth`,
  };
};

const getOrCreatePusher = async (): Promise<PusherInstance | null> => {
  const config = resolveRealtimeConfig();
  if (!config) {
    return null;
  }

  const Pusher = await loadPusherConstructor();
  if (!Pusher) {
    return null;
  }

  const authSnapshot = getAuthStateSnapshot();
  const hydratedAuth = authSnapshot.hydrated ? authSnapshot : await hydrateAuthState();
  const token = hydratedAuth.token;
  if (!token) {
    return null;
  }

  if (pusherInstance && pusherToken === token) {
    return pusherInstance;
  }

  if (pusherInitPromise) {
    return pusherInitPromise;
  }

  pusherInitPromise = Promise.resolve().then(() => {
    if (pusherInstance) {
      pusherInstance.disconnect();
      pusherInstance = null;
      clearRealtimeSubscriptionRegistry();
    }

    const pusher = new Pusher(config.key, {
      cluster: resolvePublicPusherCluster() || "mt1",
      wsHost: config.host,
      wsPort: config.port,
      wssPort: config.port,
      forceTLS: config.scheme === "https",
      enabledTransports: ["ws", "wss"],
      disableStats: true,
      channelAuthorization: {
        endpoint: config.authEndpoint,
        transport: "ajax",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    });

    pusherInstance = pusher;
    pusherToken = token;
    return pusher;
  }).finally(() => {
    pusherInitPromise = null;
  });

  return pusherInitPromise;
};

const subscribeToRealtimeChannel = async (
  channelName: string,
  eventName: string,
  onMessage: RealtimeCallback,
  onError?: RealtimeErrorCallback,
  options?: { mode?: "ephemeral" | "sticky" }
): Promise<() => void> => {
  const pusher = await getOrCreatePusher();
  if (!pusher) {
    return () => {};
  }

  const mode = options?.mode ?? "ephemeral";

  const subscriptionKey = buildSubscriptionKey(channelName, eventName);
  let subscription = realtimeSubscriptionRegistry.get(subscriptionKey);

  if (!subscription) {
    const listeners = new Map<number, RealtimeListener>();
    const channel = pusher.subscribe(channelName);

    const realtimeHandler = (message: RealtimeMessage) => {
      for (const listener of listeners.values()) {
        listener.onMessage(message);
      }
    };

    const subscribedHandler = () => {
      if (__DEV__) {
        console.log(`[realtime] subscribed to ${channelName}`);
      }
    };

    const errorHandler = (error: unknown) => {
      if (__DEV__) {
        console.warn(`[realtime] subscription error on ${channelName}`, error);
      }
      for (const listener of listeners.values()) {
        listener.onError?.(error);
      }
    };

    const connectionErrorHandler = (error: unknown) => {
      if (__DEV__) {
        console.warn("[realtime] connection error", error);
      }
      for (const listener of listeners.values()) {
        listener.onError?.(error);
      }
    };

    channel.bind(eventName, realtimeHandler);
    channel.bind("pusher:subscription_succeeded", subscribedHandler);
    channel.bind("pusher:subscription_error", errorHandler);
    pusher.connection.bind("error", connectionErrorHandler);

    subscription = {
      pusher,
      channelName,
      eventName,
      channel,
      listeners,
      mode,
      teardownTimer: null,
      realtimeHandler,
      subscribedHandler,
      errorHandler,
      connectionErrorHandler,
    };
    realtimeSubscriptionRegistry.set(subscriptionKey, subscription);
  }

  if (subscription.teardownTimer) {
    clearTimeout(subscription.teardownTimer);
    subscription.teardownTimer = null;
  }

  const listenerId = realtimeListenerIdCounter++;
  subscription.listeners.set(listenerId, { onMessage, onError });

  return () => {
    const currentSubscription = realtimeSubscriptionRegistry.get(subscriptionKey);
    if (!currentSubscription) {
      return;
    }

    currentSubscription.listeners.delete(listenerId);
    if (currentSubscription.listeners.size > 0) {
      return;
    }
    if (currentSubscription.mode === "sticky") {
      return;
    }
    if (currentSubscription.teardownTimer) {
      return;
    }

    // Évite de fermer/réouvrir le même canal pendant une navigation rapide entre écrans.
    currentSubscription.teardownTimer = setTimeout(() => {
      const pendingSubscription = realtimeSubscriptionRegistry.get(subscriptionKey);
      if (!pendingSubscription) {
        return;
      }
      if (pendingSubscription.listeners.size > 0) {
        pendingSubscription.teardownTimer = null;
        return;
      }
      disposeRealtimeSubscription(subscriptionKey, pendingSubscription);
    }, REALTIME_SUBSCRIPTION_RETAIN_MS);
  };
};

export const subscribeToHouseholdRealtime = async (
  householdId: number,
  onMessage: (message: HouseholdRealtimeMessage) => void,
  onError?: RealtimeErrorCallback
): Promise<() => void> => {
  if (!Number.isFinite(householdId) || householdId <= 0) {
    return () => {};
  }

  const channelName = `private-household.${householdId}`;
  return subscribeToRealtimeChannel(
    channelName,
    "household.realtime",
    onMessage,
    onError,
    { mode: "sticky" }
  );
};

export const subscribeToUserRealtime = async (
  userId: number,
  onMessage: (message: UserRealtimeMessage) => void,
  onError?: RealtimeErrorCallback
): Promise<() => void> => {
  if (!Number.isFinite(userId) || userId <= 0) {
    return () => {};
  }

  const channelName = `private-App.Models.User.${userId}`;
  return subscribeToRealtimeChannel(channelName, "user.realtime", onMessage, onError);
};

export const disconnectRealtime = () => {
  clearRealtimeSubscriptionRegistry();
  if (pusherInstance) {
    pusherInstance.disconnect();
    pusherInstance = null;
    pusherToken = null;
  }
};
