import {
  isApiUnauthorizedError,
  subscribeToApiUnauthorized,
  type UnauthorizedApiError,
} from "@/src/api/client";
import { getAuthStateSnapshot, logoutAuth } from "@/src/store/useAuthStore";

let unauthorizedHandlingPromise: Promise<void> | null = null;

const hasActiveSession = (): boolean => {
  const { token } = getAuthStateSnapshot();
  return typeof token === "string" && token.trim().length > 0;
};

export const invalidateSessionFromUnauthorized = async (error: unknown): Promise<void> => {
  if (!isApiUnauthorizedError(error)) {
    return;
  }

  if (!hasActiveSession()) {
    return;
  }

  if (!unauthorizedHandlingPromise) {
    unauthorizedHandlingPromise = (async () => {
      try {
        await logoutAuth();
      } finally {
        unauthorizedHandlingPromise = null;
      }
    })();
  }

  await unauthorizedHandlingPromise;
};

export const installUnauthorizedSessionHandler = (): (() => void) => {
  return subscribeToApiUnauthorized(async (error: UnauthorizedApiError) => {
    await invalidateSessionFromUnauthorized(error);
  });
};
