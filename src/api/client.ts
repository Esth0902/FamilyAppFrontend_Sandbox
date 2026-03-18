import * as SecureStore from "expo-secure-store";
import { resolvePublicApiUrl } from "@/src/config/public-env";
import { setStoredUserCache } from "@/src/session/user-cache";

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

type ApiFetchOptions = RequestInit & {
    cacheTtlMs?: number;
    bypassCache?: boolean;
};

type CachedApiResponse = {
    expiresAt: number;
    data: unknown;
};

const apiResponseCache = new Map<string, CachedApiResponse>();
const inFlightGetRequests = new Map<string, Promise<unknown>>();
const MAX_CACHE_ENTRIES = 80;

const buildCacheKey = (method: string, url: string, householdId: number | null) =>
    `${method}:${url}:h${householdId ?? 0}`;

const pruneApiCache = () => {
    while (apiResponseCache.size > MAX_CACHE_ENTRIES) {
        const firstKey = apiResponseCache.keys().next().value;
        if (typeof firstKey !== "string") {
            break;
        }
        apiResponseCache.delete(firstKey);
    }
};

const getCachedResponse = (cacheKey: string): { hit: boolean; data: unknown } => {
    const cached = apiResponseCache.get(cacheKey);
    if (!cached) {
        return { hit: false, data: null };
    }
    if (cached.expiresAt <= Date.now()) {
        apiResponseCache.delete(cacheKey);
        return { hit: false, data: null };
    }
    return { hit: true, data: cached.data };
};

const setCachedResponse = (cacheKey: string, data: unknown, ttlMs: number) => {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
        return;
    }
    apiResponseCache.set(cacheKey, {
        expiresAt: Date.now() + ttlMs,
        data,
    });
    pruneApiCache();
};

const clearApiCache = () => {
    apiResponseCache.clear();
    inFlightGetRequests.clear();
};

export const apiFetch = async (endpoint: string, options: ApiFetchOptions = {}) => {
    if (!API_BASE_URL) {
        throw {
            status: 0,
            message: "Configuration API manquante (EXPO_PUBLIC_API_URL ou EXPO_PUBLIC_API_URL_LOCAL/ONLINE).",
        };
    }

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${API_BASE_URL}${cleanEndpoint}`;

    const token = await SecureStore.getItemAsync("authToken");
    const rawUser = await SecureStore.getItemAsync("user");
    let activeHouseholdId: number | null = null;

    if (rawUser) {
        try {
            const parsedUser = JSON.parse(rawUser) as { household_id?: number | string };
            const candidate = Number(parsedUser?.household_id ?? 0);
            if (Number.isFinite(candidate) && candidate > 0) {
                activeHouseholdId = Math.trunc(candidate);
            }
        } catch {
            activeHouseholdId = null;
        }
    }

    const {
        cacheTtlMs: rawCacheTtlMs,
        bypassCache: rawBypassCache,
        ...requestOptions
    } = options;

    const method = String(requestOptions.method ?? "GET").toUpperCase();
    const isGet = method === "GET";
    const cacheTtlMs = Number.isFinite(rawCacheTtlMs) ? Number(rawCacheTtlMs) : 0;
    const bypassCache = rawBypassCache === true;
    const cacheKey = buildCacheKey(method, url, activeHouseholdId);

    if (isGet && !bypassCache && cacheTtlMs > 0) {
        const cached = getCachedResponse(cacheKey);
        if (cached.hit) {
            return cached.data;
        }
        const inFlight = inFlightGetRequests.get(cacheKey);
        if (inFlight) {
            return inFlight;
        }
    }

    const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(requestOptions.headers as Record<string, string>),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    if (activeHouseholdId) {
        headers['X-Household-Id'] = String(activeHouseholdId);
    }

    const requestPromise = (async () => {
        const response = await fetch(url, {
            ...requestOptions,
            method,
            headers,
        });

        const data = await parseJsonSafe(response);

        if (!response.ok) {
            if (response.status === 401) {
                clearApiCache();
                await Promise.all([
                    SecureStore.deleteItemAsync("authToken"),
                    SecureStore.deleteItemAsync("user"),
                ]);
                setStoredUserCache(null, true);
            }

            throw {
                status: response.status,
                message: data?.message || `Erreur HTTP ${response.status}`,
                data,
            };
        }

        if (!isGet) {
            clearApiCache();
        } else if (!bypassCache && cacheTtlMs > 0) {
            setCachedResponse(cacheKey, data, cacheTtlMs);
        }

        return data;
    })();

    if (isGet && !bypassCache && cacheTtlMs > 0) {
        inFlightGetRequests.set(cacheKey, requestPromise);
        try {
            return await requestPromise;
        } finally {
            inFlightGetRequests.delete(cacheKey);
        }
    }

    return requestPromise;
};
