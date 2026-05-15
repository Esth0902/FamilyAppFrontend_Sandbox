import { apiFetch } from "@/src/api/client";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

type NotificationsModule = typeof import("expo-notifications");

const CURRENT_PUSH_TOKEN_STORAGE_KEY = "currentPushToken";
const isExpoGo = Constants.executionEnvironment === "storeClient" || Constants.appOwnership === "expo";

let notificationsModulePromise: Promise<NotificationsModule> | null = null;
let currentPushTokenCache: string | null = null;
let hasLoadedCurrentPushToken = false;

const loadNotificationsModule = async (): Promise<NotificationsModule> => {
  if (!notificationsModulePromise) {
    notificationsModulePromise = import("expo-notifications");
  }

  return notificationsModulePromise;
};

const normalizeToken = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const getCurrentDeviceName = (): string | null => {
  const rawName = typeof Device.deviceName === "string" ? Device.deviceName : "";
  const normalized = rawName.trim();
  return normalized.length > 0 ? normalized : null;
};

const getEasProjectId = (): string | null => {
  const explicit = Constants.easConfig?.projectId;
  if (typeof explicit === "string" && explicit.trim().length > 0) {
    return explicit.trim();
  }

  const extraProjectId = (
    Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  )?.eas?.projectId;
  if (typeof extraProjectId === "string" && extraProjectId.trim().length > 0) {
    return extraProjectId.trim();
  }

  return null;
};

const cacheCurrentPushToken = async (token: string | null): Promise<void> => {
  const normalizedToken = normalizeToken(token);
  currentPushTokenCache = normalizedToken;
  hasLoadedCurrentPushToken = true;

  if (normalizedToken) {
    await SecureStore.setItemAsync(CURRENT_PUSH_TOKEN_STORAGE_KEY, normalizedToken);
    return;
  }

  await SecureStore.deleteItemAsync(CURRENT_PUSH_TOKEN_STORAGE_KEY);
};

export const getCurrentPushToken = async (): Promise<string | null> => {
  if (hasLoadedCurrentPushToken) {
    return currentPushTokenCache;
  }

  const storedToken = await SecureStore.getItemAsync(CURRENT_PUSH_TOKEN_STORAGE_KEY);
  const normalizedStoredToken = normalizeToken(storedToken);
  currentPushTokenCache = normalizedStoredToken;
  hasLoadedCurrentPushToken = true;
  return normalizedStoredToken;
};

export const getNotificationsPermissionStatus = async (): Promise<
  "granted" | "denied" | "undetermined" | "unavailable"
> => {
  if (isExpoGo) {
    return "unavailable";
  }

  const Notifications = await loadNotificationsModule();
  const permissions = await Notifications.getPermissionsAsync();
  const status = String(permissions?.status ?? "").trim();

  if (status === "granted" || status === "denied" || status === "undetermined") {
    return status;
  }

  return "undetermined";
};

export const registerPushToken = async (input: {
  token: string;
  platform?: string | null;
  deviceName?: string | null;
}): Promise<void> => {
  const normalizedToken = normalizeToken(input.token);
  if (!normalizedToken) {
    return;
  }

  await apiFetch("/notifications/push-token", {
    method: "POST",
    body: JSON.stringify({
      token: normalizedToken,
      platform: input.platform ?? null,
      device_name: input.deviceName ?? null,
    }),
  });

  await cacheCurrentPushToken(normalizedToken);
};

export const revokePushToken = async (token?: string | null): Promise<void> => {
  const normalizedToken = normalizeToken(token);
  await apiFetch("/notifications/push-token", {
    method: "DELETE",
    body: JSON.stringify({
      token: normalizedToken,
    }),
  });

  if (normalizedToken) {
    const currentToken = await getCurrentPushToken();
    if (currentToken === normalizedToken) {
      await cacheCurrentPushToken(null);
    }
  }
};

export const revokeCurrentPushToken = async (): Promise<void> => {
  let currentToken = await getCurrentPushToken();

  if (!currentToken && !isExpoGo && Device.isDevice) {
    try {
      const Notifications = await loadNotificationsModule();
      const permissions = await Notifications.getPermissionsAsync();
      const status = String(permissions?.status ?? "").trim();

      if (status === "granted") {
        const projectId = getEasProjectId();
        const expoPushToken = projectId
          ? await Notifications.getExpoPushTokenAsync({ projectId })
          : await Notifications.getExpoPushTokenAsync();
        currentToken = normalizeToken(String(expoPushToken?.data ?? ""));
      }
    } catch {
      currentToken = null;
    }
  }

  if (!currentToken) {
    return;
  }

  await revokePushToken(currentToken);
};

export const syncPushTokenWithSystemPermissions = async (options?: {
  requestPermission?: boolean;
}): Promise<{
  permissionStatus: "granted" | "denied" | "undetermined" | "unavailable";
  pushToken: string | null;
  canUseRemotePush: boolean;
}> => {
  if (isExpoGo) {
    return {
      permissionStatus: "unavailable",
      pushToken: null,
      canUseRemotePush: false,
    };
  }

  const Notifications = await loadNotificationsModule();
  const requestPermission = options?.requestPermission !== false;

  let permissions = await Notifications.getPermissionsAsync();
  let status = String(permissions?.status ?? "").trim();

  if (requestPermission && status !== "granted") {
    permissions = await Notifications.requestPermissionsAsync();
    status = String(permissions?.status ?? "").trim();
  }

  if (status !== "granted") {
    await revokeCurrentPushToken();
    return {
      permissionStatus: status === "denied" ? "denied" : "undetermined",
      pushToken: null,
      canUseRemotePush: false,
    };
  }

  await Notifications.setNotificationChannelAsync("default", {
    name: "default",
    importance: Notifications.AndroidImportance.DEFAULT,
  });

  if (!Device.isDevice) {
    return {
      permissionStatus: "granted",
      pushToken: null,
      canUseRemotePush: false,
    };
  }

  const projectId = getEasProjectId();
  const expoPushToken = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();
  const pushTokenValue = normalizeToken(String(expoPushToken?.data ?? ""));

  if (!pushTokenValue) {
    return {
      permissionStatus: "granted",
      pushToken: null,
      canUseRemotePush: false,
    };
  }

  await registerPushToken({
    token: pushTokenValue,
    platform: Platform.OS,
    deviceName: getCurrentDeviceName(),
  });

  return {
    permissionStatus: "granted",
    pushToken: pushTokenValue,
    canUseRemotePush: true,
  };
};
