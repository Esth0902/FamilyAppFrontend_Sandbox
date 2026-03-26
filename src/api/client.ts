import { resolvePublicApiUrl } from "@/src/config/public-env";
import { getAuthStateSnapshot, hydrateAuthState } from "@/src/store/useAuthStore";

const trimRightSlash = (value: string) => value.replace(/\/+$/, "");

const resolvedApiBaseUrl = resolvePublicApiUrl();
export const API_BASE_URL = resolvedApiBaseUrl ? trimRightSlash(resolvedApiBaseUrl) : null;

const parseJsonSafe = async (response: Response) => {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export type ApiFetchOptions = RequestInit & {
  cacheTtlMs?: number;
  bypassCache?: boolean;
};

export type ApiErrorCode =
  | "CONFIG"
  | "NETWORK"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "VALIDATION"
  | "SERVER"
  | "UNKNOWN";

export type ApiErrorInput = {
  status: number;
  code: ApiErrorCode;
  message: string;
  data?: unknown;
  method: string;
  endpoint: string;
  retryable: boolean;
  cause?: unknown;
};

export class ApiClientError extends Error {
  status: number;
  code: ApiErrorCode;
  data: unknown;
  method: string;
  endpoint: string;
  retryable: boolean;

  constructor(input: ApiErrorInput) {
    super(input.message);
    this.name = "ApiClientError";
    this.status = input.status;
    this.code = input.code;
    this.data = input.data ?? null;
    this.method = input.method;
    this.endpoint = input.endpoint;
    this.retryable = input.retryable;
    if (input.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = input.cause;
    }
  }
}

export class UnauthorizedApiError extends ApiClientError {
  constructor(input: ApiErrorInput) {
    super(input);
    this.name = "UnauthorizedApiError";
  }
}

export const isApiClientError = (error: unknown): error is ApiClientError =>
  error instanceof ApiClientError;

export const isApiUnauthorizedError = (error: unknown): boolean =>
  error instanceof UnauthorizedApiError || (isApiClientError(error) && error.status === 401);

export type ApiUnauthorizedListener = (error: UnauthorizedApiError) => void | Promise<void>;

const unauthorizedListeners = new Set<ApiUnauthorizedListener>();

export const subscribeToApiUnauthorized = (listener: ApiUnauthorizedListener): (() => void) => {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
};

const notifyApiUnauthorized = (error: UnauthorizedApiError): void => {
  if (unauthorizedListeners.size === 0) {
    return;
  }

  for (const listener of unauthorizedListeners) {
    void Promise.resolve(listener(error)).catch((notificationError) => {
      console.error("Erreur listener 401 API:", notificationError);
    });
  }
};

export const getApiErrorMessage = (error: unknown, fallback = "Une erreur est survenue."): string => {
  if (isApiClientError(error)) {
    return error.message || fallback;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    return message.length > 0 ? message : fallback;
  }
  return fallback;
};

const isRetryableStatus = (status: number): boolean => {
  if (status <= 0) {
    return true;
  }
  if (status === 408 || status === 425 || status === 429) {
    return true;
  }
  return status >= 500;
};

const mapStatusToCode = (status: number): ApiErrorCode => {
  if (status === 0) return "NETWORK";
  if (status === 400 || status === 422) return "VALIDATION";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMIT";
  if (status >= 500) return "SERVER";
  return "UNKNOWN";
};

const buildDefaultMessage = (status: number): string => {
  if (status === 0) {
    return "Connexion impossible. Vérifie ta connexion internet.";
  }
  if (status === 401) {
    return "Session expirée. Reconnecte-toi pour continuer.";
  }
  if (status === 403) {
    return "Action non autorisée pour ce compte.";
  }
  if (status === 404) {
    return "Ressource introuvable.";
  }
  if (status === 429) {
    return "Trop de requêtes. Réessaie dans quelques secondes.";
  }
  if (status >= 500) {
    return "Serveur temporairement indisponible. Réessaie dans un instant.";
  }
  return `Erreur HTTP ${status}`;
};

const extractApiMessage = (status: number, data: unknown): string => {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const explicitMessage = String(obj.message ?? "").trim();
    if (explicitMessage.length > 0) {
      return explicitMessage;
    }

    const validationErrors = obj.errors;
    if (validationErrors && typeof validationErrors === "object") {
      const firstField = Object.keys(validationErrors as Record<string, unknown>)[0];
      if (firstField) {
        const firstValue = (validationErrors as Record<string, unknown>)[firstField];
        if (Array.isArray(firstValue) && firstValue.length > 0) {
          const firstError = String(firstValue[0] ?? "").trim();
          if (firstError.length > 0) {
            return firstError;
          }
        }
      }
    }
  }

  return buildDefaultMessage(status);
};

const normalizeApiError = (
  input: unknown,
  context: { status: number; data?: unknown; method: string; endpoint: string }
): ApiClientError => {
  if (isApiClientError(input)) {
    return input;
  }

  const status = Number.isFinite(context.status) ? Math.trunc(context.status) : 0;
  const code = mapStatusToCode(status);
  const message = extractApiMessage(status, context.data);
  const commonInput: ApiErrorInput = {
    status,
    code,
    message,
    data: context.data ?? null,
    method: context.method,
    endpoint: context.endpoint,
    retryable: isRetryableStatus(status),
    cause: input,
  };

  if (status === 401) {
    return new UnauthorizedApiError(commonInput);
  }

  return new ApiClientError(commonInput);
};

export const apiFetch = async (endpoint: string, options: ApiFetchOptions = {}) => {
  if (!API_BASE_URL) {
    throw new ApiClientError({
      status: 0,
      code: "CONFIG",
      message: "Configuration API manquante (EXPO_PUBLIC_API_URL ou EXPO_PUBLIC_API_URL_LOCAL/ONLINE).",
      method: String(options.method ?? "GET").toUpperCase(),
      endpoint,
      retryable: false,
    });
  }

  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${API_BASE_URL}${cleanEndpoint}`;

  const authSnapshot = getAuthStateSnapshot();
  const hydratedAuth = authSnapshot.hydrated ? authSnapshot : await hydrateAuthState();
  const token = hydratedAuth.token;
  const rawUser = hydratedAuth.user;
  let activeHouseholdId: number | null = null;

  if (rawUser) {
    const candidate = Number((rawUser as { household_id?: number | string }).household_id ?? 0);
    if (Number.isFinite(candidate) && candidate > 0) {
      activeHouseholdId = Math.trunc(candidate);
    }
  }

  const {
    cacheTtlMs: _cacheTtlMs,
    bypassCache: _bypassCache,
    ...requestOptions
  } = options;
  const method = String(requestOptions.method ?? "GET").toUpperCase();

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(requestOptions.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (activeHouseholdId) {
    headers["X-Household-Id"] = String(activeHouseholdId);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...requestOptions,
      method,
      headers,
    });
  } catch (networkError) {
    throw normalizeApiError(networkError, {
      status: 0,
      method,
      endpoint: cleanEndpoint,
    });
  }

  const data = await parseJsonSafe(response);

  if (!response.ok) {
    const normalizedError = normalizeApiError(data, {
      status: response.status,
      data,
      method,
      endpoint: cleanEndpoint,
    });

    if (isApiUnauthorizedError(normalizedError)) {
      notifyApiUnauthorized(normalizedError);
    }

    throw normalizedError;
  }

  return data;
};
