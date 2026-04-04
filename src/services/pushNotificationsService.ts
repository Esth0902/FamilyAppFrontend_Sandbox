import { apiFetch } from "@/src/api/client";

export const registerPushToken = async (input: {
  token: string;
  platform?: string | null;
  deviceName?: string | null;
}): Promise<void> => {
  await apiFetch("/notifications/push-token", {
    method: "POST",
    body: JSON.stringify({
      token: input.token,
      platform: input.platform ?? null,
      device_name: input.deviceName ?? null,
    }),
  });
};

export const revokePushToken = async (token?: string | null): Promise<void> => {
  await apiFetch("/notifications/push-token", {
    method: "DELETE",
    body: JSON.stringify({
      token: token ?? null,
    }),
  });
};

