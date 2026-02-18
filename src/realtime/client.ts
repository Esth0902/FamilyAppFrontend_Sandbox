import * as SecureStore from "expo-secure-store";

import { API_BASE_URL } from "@/src/api/client";

export type HouseholdRealtimeMessage = {
  module?: string;
  type?: string;
  payload?: Record<string, unknown>;
  emitted_at?: string;
};

type RealtimeCallback = (message: HouseholdRealtimeMessage) => void;
type RealtimeErrorCallback = (error: unknown) => void;

type PusherInstance = any;
type PusherConstructor = new (key: string, options: Record<string, unknown>) => PusherInstance;

let pusherInstance: PusherInstance | null = null;
let pusherToken: string | null = null;
let pusherInitPromise: Promise<PusherInstance | null> | null = null;
let pusherCtorPromise: Promise<PusherConstructor | null> | null = null;

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
  const explicit = process.env.EXPO_PUBLIC_REVERB_HOST?.trim();
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

const resolveReverbPort = () => {
  const explicit = Number(process.env.EXPO_PUBLIC_REVERB_PORT);
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  return 8080;
};

const resolveReverbScheme = () => {
  const explicit = process.env.EXPO_PUBLIC_REVERB_SCHEME?.toLowerCase();
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

  const port = resolveReverbPort();
  const scheme = resolveReverbScheme();
  const key = process.env.EXPO_PUBLIC_REVERB_KEY?.trim() || "familyapp-local-key";

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

  const token = await SecureStore.getItemAsync("authToken");
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
    }

    const pusher = new Pusher(config.key, {
      cluster: process.env.EXPO_PUBLIC_PUSHER_APP_CLUSTER || "mt1",
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

export const subscribeToHouseholdRealtime = async (
  householdId: number,
  onMessage: RealtimeCallback,
  onError?: RealtimeErrorCallback
): Promise<() => void> => {
  if (!Number.isFinite(householdId) || householdId <= 0) {
    return () => {};
  }

  const pusher = await getOrCreatePusher();
  if (!pusher) {
    return () => {};
  }

  const channelName = `private-household.${householdId}`;
  const channel = pusher.subscribe(channelName);

  const realtimeHandler = (message: HouseholdRealtimeMessage) => {
    onMessage(message);
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
    if (onError) {
      onError(error);
    }
  };

  const connectionErrorHandler = (error: unknown) => {
    if (__DEV__) {
      console.warn("[realtime] connection error", error);
    }
    if (onError) {
      onError(error);
    }
  };

  channel.bind("household.realtime", realtimeHandler);
  channel.bind("pusher:subscription_succeeded", subscribedHandler);
  channel.bind("pusher:subscription_error", errorHandler);
  pusher.connection.bind("error", connectionErrorHandler);

  return () => {
    channel.unbind("household.realtime", realtimeHandler);
    channel.unbind("pusher:subscription_succeeded", subscribedHandler);
    channel.unbind("pusher:subscription_error", errorHandler);
    pusher.connection.unbind("error", connectionErrorHandler);
    pusher.unsubscribe(channelName);
  };
};

export const disconnectRealtime = () => {
  if (pusherInstance) {
    pusherInstance.disconnect();
    pusherInstance = null;
    pusherToken = null;
  }
};
