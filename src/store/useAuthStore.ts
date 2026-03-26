import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { clearGlobalQueryClient } from "@/src/query/query-client";

export type AuthUser = {
  id?: number;
  name?: string;
  email?: string;
  household_id?: number | null;
  role?: string;
  households?: {
    id?: number;
    name?: string;
    role?: string;
    nickname?: string;
    pivot?: {
      role?: string;
      nickname?: string;
    };
  }[];
  must_change_password?: boolean;
  [key: string]: unknown;
};

// Source de vérité de la session courante + persistance SecureStore.
const AUTH_TOKEN_STORAGE_KEY = "authToken";
const AUTH_USER_STORAGE_KEY = "user";

type AuthSnapshot = {
  hydrated: boolean;
  token: string | null;
  user: AuthUser | null;
};

type AuthStoreState = AuthSnapshot & {
  setAuth: (payload: Partial<AuthSnapshot>) => void;
  hydrate: () => Promise<AuthSnapshot>;
  persistToken: (token: string | null) => Promise<void>;
  persistUser: (user: AuthUser | null) => Promise<void>;
  logout: () => Promise<void>;
};

let hydratePromise: Promise<AuthSnapshot> | null = null;

const normalizeToken = (value: string | null): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseStoredUser = (rawUser: string | null): AuthUser | null => {
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as AuthUser;
  } catch {
    return null;
  }
};

const readPersistedAuth = async (): Promise<AuthSnapshot> => {
  const [token, rawUser] = await Promise.all([
    SecureStore.getItemAsync(AUTH_TOKEN_STORAGE_KEY),
    SecureStore.getItemAsync(AUTH_USER_STORAGE_KEY),
  ]);

  return {
    hydrated: true,
    token: normalizeToken(token),
    user: parseStoredUser(rawUser),
  };
};

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  hydrated: false,
  token: null,
  user: null,
  setAuth: (payload) => {
    set((state) => ({
      hydrated: payload.hydrated ?? true,
      token: payload.token !== undefined ? payload.token : state.token,
      user: payload.user !== undefined ? payload.user : state.user,
    }));
  },
  hydrate: async () => {
    if (get().hydrated) {
      const snapshot = get();
      return {
        hydrated: snapshot.hydrated,
        token: snapshot.token,
        user: snapshot.user,
      };
    }

    if (!hydratePromise) {
      hydratePromise = readPersistedAuth().then((snapshot) => {
        set(snapshot);
        return snapshot;
      }).finally(() => {
        hydratePromise = null;
      });
    }

    return hydratePromise;
  },
  persistToken: async (token) => {
    const normalizedToken = normalizeToken(token);

    set((state) => ({
      ...state,
      hydrated: true,
      token: normalizedToken,
    }));

    if (normalizedToken) {
      await SecureStore.setItemAsync(AUTH_TOKEN_STORAGE_KEY, normalizedToken);
      return;
    }

    await SecureStore.deleteItemAsync(AUTH_TOKEN_STORAGE_KEY);
  },
  persistUser: async (user) => {
    set((state) => ({
      ...state,
      hydrated: true,
      user,
    }));

    if (user) {
      await SecureStore.setItemAsync(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
      return;
    }

    await SecureStore.deleteItemAsync(AUTH_USER_STORAGE_KEY);
  },
  logout: async () => {
    set({
      hydrated: true,
      token: null,
      user: null,
    });

    await clearGlobalQueryClient();

    await Promise.allSettled([
      SecureStore.deleteItemAsync(AUTH_TOKEN_STORAGE_KEY),
      SecureStore.deleteItemAsync(AUTH_USER_STORAGE_KEY),
    ]);
  },
}));

export const getAuthStateSnapshot = (): AuthSnapshot => {
  const { hydrated, token, user } = useAuthStore.getState();
  return { hydrated, token, user };
};

export const hydrateAuthState = async (): Promise<AuthSnapshot> => {
  return useAuthStore.getState().hydrate();
};

export const logoutAuth = async (): Promise<void> => {
  await useAuthStore.getState().logout();
};

export const persistAuthToken = async (token: string | null): Promise<void> => {
  await useAuthStore.getState().persistToken(token);
};

export const persistAuthUser = async (user: AuthUser | null): Promise<void> => {
  await useAuthStore.getState().persistUser(user);
};
