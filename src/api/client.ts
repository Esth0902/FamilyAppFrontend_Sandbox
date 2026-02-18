import * as SecureStore from "expo-secure-store";

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

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
            message: "EXPO_PUBLIC_API_URL est manquant.",
        };
    }

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${API_BASE_URL}${cleanEndpoint}`;

    const token = await SecureStore.getItemAsync("authToken");

    const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        ...options,
        headers,
    });

    const data = await parseJsonSafe(response);

    if (!response.ok) {
        throw {
            status: response.status,
            message: data?.message || `Erreur HTTP ${response.status}`,
            data,
        };
    }

    return data;
};
