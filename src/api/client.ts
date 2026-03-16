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

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
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

    const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    if (activeHouseholdId) {
        headers['X-Household-Id'] = String(activeHouseholdId);
    }

    const response = await fetch(url, {
        ...options,
        headers,
    });

    const data = await parseJsonSafe(response);

    if (!response.ok) {
        if (response.status === 401) {
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

    return data;
};
