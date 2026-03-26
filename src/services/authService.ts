import {
  apiFetch,
  isApiClientError,
  isApiUnauthorizedError,
  type ApiClientError,
} from "@/src/api/client";
import {
  normalizeStoredUser,
  persistStoredUser,
  type StoredUser,
} from "@/src/session/user-cache";
import { logoutAuth, persistAuthToken } from "@/src/store/useAuthStore";

type AuthApiResponse = {
  access_token?: unknown;
  token?: unknown;
  user?: unknown;
  errors?: unknown;
  message?: unknown;
};

export type AuthErrorKind =
  | "validation"
  | "network"
  | "unauthorized"
  | "server"
  | "invalid_response"
  | "unknown";

export type AuthFieldErrors = Record<string, string>;

export class AuthServiceError extends Error {
  kind: AuthErrorKind;
  status: number;
  fieldErrors: AuthFieldErrors | null;
  cause: unknown;

  constructor(input: {
    message: string;
    kind: AuthErrorKind;
    status?: number;
    fieldErrors?: AuthFieldErrors | null;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "AuthServiceError";
    this.kind = input.kind;
    this.status = Number.isFinite(input.status) ? Math.trunc(Number(input.status)) : 0;
    this.fieldErrors = input.fieldErrors ?? null;
    this.cause = input.cause;
  }
}

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
  passwordConfirmation: string;
};

export type ChangePasswordIfRequiredPayload = {
  email: string;
  password: string;
  passwordConfirmation: string;
};

export type ForgotPasswordPayload = {
  email: string;
};

export type ResetPasswordPayload = {
  token: string;
  email: string;
  password: string;
  passwordConfirmation: string;
};

export type AuthResult = {
  token: string;
  user: StoredUser | null;
  mustChangePassword: boolean;
};

export type AuthMessageResult = {
  message: string;
};

const extractFieldErrors = (error: ApiClientError): AuthFieldErrors | null => {
  const rawErrors = (error.data as { errors?: unknown } | null)?.errors;
  if (!rawErrors || typeof rawErrors !== "object") {
    return null;
  }

  const normalized: AuthFieldErrors = {};
  for (const [field, value] of Object.entries(rawErrors as Record<string, unknown>)) {
    if (Array.isArray(value) && value.length > 0) {
      const message = String(value[0] ?? "").trim();
      if (message) {
        normalized[field] = message;
      }
      continue;
    }

    const message = String(value ?? "").trim();
    if (message) {
      normalized[field] = message;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
};

export const toAuthServiceError = (
  error: unknown,
  fallbackMessage = "Une erreur est survenue."
): AuthServiceError => {
  if (error instanceof AuthServiceError) {
    return error;
  }

  if (isApiClientError(error)) {
    if (isApiUnauthorizedError(error)) {
      return new AuthServiceError({
        message: error.message || "Session expirée.",
        kind: "unauthorized",
        status: error.status,
        cause: error,
      });
    }

    if (error.code === "VALIDATION" || error.status === 400 || error.status === 422) {
      return new AuthServiceError({
        message: error.message || "Données invalides.",
        kind: "validation",
        status: error.status,
        fieldErrors: extractFieldErrors(error),
        cause: error,
      });
    }

    if (error.code === "NETWORK" || error.code === "CONFIG" || error.status === 0) {
      return new AuthServiceError({
        message: error.message || "Impossible de contacter le serveur.",
        kind: "network",
        status: error.status,
        cause: error,
      });
    }

    if (error.status >= 500) {
      return new AuthServiceError({
        message: error.message || "Serveur indisponible.",
        kind: "server",
        status: error.status,
        cause: error,
      });
    }

    return new AuthServiceError({
      message: error.message || fallbackMessage,
      kind: "unknown",
      status: error.status,
      cause: error,
    });
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    return new AuthServiceError({
      message: message || fallbackMessage,
      kind: "unknown",
      cause: error,
    });
  }

  return new AuthServiceError({
    message: fallbackMessage,
    kind: "unknown",
    cause: error,
  });
};

const extractAccessToken = (response: AuthApiResponse): string => {
  const accessToken = typeof response.access_token === "string" && response.access_token.trim().length > 0
    ? response.access_token
    : typeof response.token === "string" && response.token.trim().length > 0
      ? response.token
      : null;

  if (!accessToken) {
    throw new AuthServiceError({
      message: "Réponse d'authentification invalide (token manquant).",
      kind: "invalid_response",
    });
  }

  return accessToken;
};

const persistToken = async (token: string): Promise<void> => {
  await persistAuthToken(token);
};

const normalizeUser = (rawUser: unknown): StoredUser | null => {
  return normalizeStoredUser((rawUser ?? null) as StoredUser | null);
};

const syncUserFromMeOrFallback = async (fallbackUser: StoredUser | null): Promise<StoredUser | null> => {
  try {
    const meUser = await fetchMe();
    return meUser ?? fallbackUser;
  } catch {
    return fallbackUser;
  }
};

const buildAuthResult = async (response: AuthApiResponse): Promise<AuthResult> => {
  const token = extractAccessToken(response);
  await persistToken(token);

  const fallbackUser = normalizeUser(response.user);
  const resolvedUser = await syncUserFromMeOrFallback(fallbackUser);

  if (resolvedUser) {
    await persistStoredUser(resolvedUser);
  }

  return {
    token,
    user: resolvedUser,
    mustChangePassword: Boolean(resolvedUser?.must_change_password),
  };
};

const resolveResponseMessage = (
  response: AuthApiResponse | null | undefined,
  fallbackMessage: string
): string => {
  const message = typeof response?.message === "string" ? response.message.trim() : "";
  return message.length > 0 ? message : fallbackMessage;
};

export const fetchMe = async (): Promise<StoredUser | null> => {
  try {
    const response = (await apiFetch("/me")) as AuthApiResponse | null;
    return normalizeUser(response?.user);
  } catch (error) {
    throw toAuthServiceError(error, "Impossible de récupérer le profil.");
  }
};

export const login = async (payload: LoginPayload): Promise<AuthResult> => {
  try {
    const response = (await apiFetch("/login", {
      method: "POST",
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
      }),
    })) as AuthApiResponse | null;

    return await buildAuthResult(response ?? {});
  } catch (error) {
    throw toAuthServiceError(error, "Identifiants incorrects.");
  }
};

export const register = async (payload: RegisterPayload): Promise<AuthResult> => {
  try {
    const response = (await apiFetch("/register", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        email: payload.email,
        password: payload.password,
        password_confirmation: payload.passwordConfirmation,
      }),
    })) as AuthApiResponse | null;

    return await buildAuthResult(response ?? {});
  } catch (error) {
    throw toAuthServiceError(error, "Impossible de créer le compte.");
  }
};

export const changePasswordIfRequired = async (
  payload: ChangePasswordIfRequiredPayload
): Promise<StoredUser | null> => {
  try {
    const response = (await apiFetch("/auth/change-initial-credentials", {
      method: "POST",
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
        password_confirmation: payload.passwordConfirmation,
      }),
    })) as AuthApiResponse | null;

    const normalizedUser = normalizeUser(response?.user);
    if (!normalizedUser) {
      return null;
    }

    const userToPersist = normalizeStoredUser({
      ...normalizedUser,
      must_change_password: false,
    } as StoredUser);

    if (userToPersist) {
      await persistStoredUser(userToPersist);
    }

    return userToPersist;
  } catch (error) {
    throw toAuthServiceError(error, "Impossible de mettre à jour les identifiants.");
  }
};

export const forgotPassword = async (
  payload: ForgotPasswordPayload
): Promise<AuthMessageResult> => {
  try {
    const response = (await apiFetch("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({
        email: payload.email,
      }),
    })) as AuthApiResponse | null;

    return {
      message: resolveResponseMessage(
        response,
        "Si un compte existe, un e-mail de réinitialisation a été envoyé."
      ),
    };
  } catch (error) {
    throw toAuthServiceError(error, "Impossible d'envoyer la demande de réinitialisation.");
  }
};

export const resetPassword = async (
  payload: ResetPasswordPayload
): Promise<AuthMessageResult> => {
  try {
    const response = (await apiFetch("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        token: payload.token,
        email: payload.email,
        password: payload.password,
        password_confirmation: payload.passwordConfirmation,
      }),
    })) as AuthApiResponse | null;

    return {
      message: resolveResponseMessage(response, "Mot de passe réinitialisé."),
    };
  } catch (error) {
    throw toAuthServiceError(error, "Impossible de réinitialiser le mot de passe.");
  }
};

export const logout = async (): Promise<void> => {
  try {
    await apiFetch("/logout", {
      method: "POST",
    });
  } catch (error) {
    const authError = toAuthServiceError(error, "Impossible de fermer la session côté serveur.");
    if (authError.kind !== "unauthorized") {
      console.warn("Logout backend error:", authError);
    }
  } finally {
    await logoutAuth();
  }
};

// Alias conservés pour compatibilité progressive.
export const fetchAuthenticatedUser = fetchMe;
export const logoutAuthenticatedUser = logout;
