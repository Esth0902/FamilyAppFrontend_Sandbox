import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

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

type AuthSnapshot = {
  hydrated: boolean;
  token: string | null;
  user: AuthUser | null;
};

type AuthStoreState = AuthSnapshot & {
  setAuth: (payload: Partial<AuthSnapshot>) => void;
  hydrate: () => Promise<AuthSnapshot>;
  logout: () => Promise<void>;
};

let hydratePromise: Promise<AuthSnapshot> | null = null;

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
    SecureStore.getItemAsync("authToken"),
    SecureStore.getItemAsync("user"),
  ]);

  return {
    hydrated: true,
    token: typeof token === "string" && token.trim().length > 0 ? token : null,
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
  logout: async () => {
    // Ensure UI redirection is instant before touching secure storage.
    set({
      hydrated: true,
      token: null,
      user: null,
    });

    await Promise.allSettled([
      SecureStore.deleteItemAsync("authToken"),
      SecureStore.deleteItemAsync("user"),
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

export const setAuthState = (payload: Partial<AuthSnapshot>): void => {
  useAuthStore.getState().setAuth(payload);
};

export const setAuthToken = (token: string | null): void => {
  useAuthStore.getState().setAuth({
    token,
    hydrated: true,
  });
};

export const setAuthUser = (user: AuthUser | null): void => {
  useAuthStore.getState().setAuth({
    user,
    hydrated: true,
  });
};

export const logoutAuth = async (): Promise<void> => {
  await useAuthStore.getState().logout();
};
