/* eslint-env jest */
const mockApiFetch = jest.fn();
const mockPersistStoredUser = jest.fn();
const mockNormalizeStoredUser = jest.fn((user: unknown) => user);
const mockLogoutAuth = jest.fn();
const mockPersistAuthToken = jest.fn();

jest.mock("@/src/api/client", () => ({
  apiFetch: (endpoint: string, options?: unknown) => mockApiFetch(endpoint, options),
  isApiClientError: (error: unknown) => {
    if (!error || typeof error !== "object") {
      return false;
    }

    const typedError = error as { status?: unknown; code?: unknown };
    return typeof typedError.status === "number" && typeof typedError.code === "string";
  },
  isApiUnauthorizedError: (error: unknown) => {
    if (!error || typeof error !== "object") {
      return false;
    }

    return Number((error as { status?: unknown }).status) === 401;
  },
}));

jest.mock("@/src/session/user-cache", () => ({
  persistStoredUser: (user: unknown) => mockPersistStoredUser(user),
  normalizeStoredUser: (user: unknown) => mockNormalizeStoredUser(user),
}));

jest.mock("@/src/store/useAuthStore", () => ({
  logoutAuth: () => mockLogoutAuth(),
  persistAuthToken: (token: unknown) => mockPersistAuthToken(token),
}));

import {
  AuthServiceError,
  login,
  logout,
  toAuthServiceError,
} from "@/src/services/authService";

describe("authService", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPersistStoredUser.mockReset();
    mockNormalizeStoredUser.mockReset();
    mockLogoutAuth.mockReset();
    mockPersistAuthToken.mockReset();

    mockNormalizeStoredUser.mockImplementation((user: unknown) => user);
    mockLogoutAuth.mockResolvedValue(undefined);
    mockPersistAuthToken.mockResolvedValue(undefined);
    mockPersistStoredUser.mockResolvedValue(undefined);
  });

  it("maps API validation errors with field errors", () => {
    const authError = toAuthServiceError({
      status: 422,
      code: "VALIDATION",
      message: "Validation failed",
      data: {
        errors: {
          email: ["Adresse e-mail invalide"],
        },
      },
    });

    expect(authError).toBeInstanceOf(AuthServiceError);
    expect(authError.kind).toBe("validation");
    expect(authError.fieldErrors).toEqual({
      email: "Adresse e-mail invalide",
    });
  });

  it("login persists token and user from login response", async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        access_token: "token-123",
        user: {
          id: 42,
          household_id: 7,
          must_change_password: true,
        },
      });

    const result = await login({
      email: "parent@example.com",
      password: "secret",
    });

    expect(mockPersistAuthToken).toHaveBeenCalledWith("token-123");
    expect(mockPersistStoredUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42, household_id: 7 })
    );
    expect(result.token).toBe("token-123");
    expect(result.user).toEqual(expect.objectContaining({ id: 42 }));
    expect(result.mustChangePassword).toBe(true);
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      1,
      "/login",
      expect.objectContaining({ method: "POST" })
    );
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it("login throws invalid_response when token is missing", async () => {
    mockApiFetch.mockResolvedValueOnce({
      user: { id: 1 },
    });

    await expect(
      login({
        email: "parent@example.com",
        password: "secret",
      })
    ).rejects.toMatchObject({
      kind: "invalid_response",
    });

    expect(mockPersistAuthToken).not.toHaveBeenCalled();
  });

  it("logout always purges session and warns only for non-401 backend errors", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    mockApiFetch.mockRejectedValueOnce({
      status: 500,
      code: "SERVER",
      message: "Serveur indisponible",
      data: null,
    });

    await logout();

    expect(mockLogoutAuth).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockClear();
    mockApiFetch.mockRejectedValueOnce({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Session expirée",
      data: null,
    });

    await logout();

    expect(mockLogoutAuth).toHaveBeenCalledTimes(2);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
