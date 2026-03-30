/* eslint-env jest */
const mockGetAuthStateSnapshot = jest.fn();
const mockLogoutAuth = jest.fn();
const mockUnsubscribeUnauthorized = jest.fn();
let unauthorizedListener: ((error: unknown) => Promise<void> | void) | null = null;

const mockSubscribeToApiUnauthorized = jest.fn((listener: (error: unknown) => Promise<void> | void) => {
  unauthorizedListener = listener;
  return mockUnsubscribeUnauthorized;
});

jest.mock("@/src/api/client", () => ({
  isApiUnauthorizedError: (error: unknown) => {
    if (!error || typeof error !== "object") {
      return false;
    }

    return Number((error as { status?: unknown }).status) === 401;
  },
  subscribeToApiUnauthorized: (listener: (error: unknown) => Promise<void> | void) =>
    mockSubscribeToApiUnauthorized(listener),
}));

jest.mock("@/src/store/useAuthStore", () => ({
  getAuthStateSnapshot: () => mockGetAuthStateSnapshot(),
  logoutAuth: () => mockLogoutAuth(),
}));

import {
  installUnauthorizedSessionHandler,
  invalidateSessionFromUnauthorized,
} from "@/src/session/session-expiration";

describe("session-expiration", () => {
  beforeEach(() => {
    mockGetAuthStateSnapshot.mockReset();
    mockLogoutAuth.mockReset();
    mockSubscribeToApiUnauthorized.mockClear();
    mockUnsubscribeUnauthorized.mockClear();
    unauthorizedListener = null;

    mockLogoutAuth.mockResolvedValue(undefined);
  });

  it("ignores non-401 errors and 401 without active token", async () => {
    mockGetAuthStateSnapshot.mockReturnValue({
      token: "token-active",
    });
    await invalidateSessionFromUnauthorized({ status: 500 });
    expect(mockLogoutAuth).not.toHaveBeenCalled();

    mockGetAuthStateSnapshot.mockReset();
    mockGetAuthStateSnapshot.mockReturnValueOnce({
      token: null,
    });
    await invalidateSessionFromUnauthorized({ status: 401 });
    expect(mockLogoutAuth).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent 401 handling and logs out once", async () => {
    mockGetAuthStateSnapshot.mockReturnValue({
      token: "token-active",
    });

    let resolveLogout: (() => void) | undefined;
    mockLogoutAuth.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveLogout = resolve; })
    );

    const first = invalidateSessionFromUnauthorized({ status: 401 });
    const second = invalidateSessionFromUnauthorized({ status: 401 });

    expect(mockLogoutAuth).toHaveBeenCalledTimes(1);

    if (resolveLogout) {
      resolveLogout();
    }
    await Promise.all([first, second]);
    expect(mockLogoutAuth).toHaveBeenCalledTimes(1);
  });

  it("installs API unauthorized listener and forwards to invalidation flow", async () => {
    mockGetAuthStateSnapshot.mockReturnValue({
      token: "token-active",
    });

    const unsubscribe = installUnauthorizedSessionHandler();
    expect(mockSubscribeToApiUnauthorized).toHaveBeenCalledTimes(1);
    expect(unauthorizedListener).toBeTruthy();

    if (!unauthorizedListener) {
      throw new Error("Unauthorized listener should be registered.");
    }
    await unauthorizedListener({ status: 401 });
    expect(mockLogoutAuth).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(mockUnsubscribeUnauthorized).toHaveBeenCalledTimes(1);
  });
});
