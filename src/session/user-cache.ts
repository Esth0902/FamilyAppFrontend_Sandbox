import * as SecureStore from "expo-secure-store";
import { useEffect, useSyncExternalStore } from "react";

export type StoredHousehold = {
  id: number;
  name?: string;
  role?: string;
  nickname?: string;
  pivot?: {
    role?: string;
    nickname?: string;
  };
};

export type StoredUser = {
  id?: number;
  name?: string;
  email?: string;
  household_id?: number;
  role?: string;
  households?: StoredHousehold[];
  must_change_password?: boolean;
  [key: string]: unknown;
};

export type StoredUserState = {
  hydrated: boolean;
  user: StoredUser | null;
  householdId: number | null;
  role: string | null;
};

const defaultState: StoredUserState = {
  hydrated: false,
  user: null,
  householdId: null,
  role: null,
};

let currentState: StoredUserState = defaultState;
let hydratePromise: Promise<StoredUserState> | null = null;
const listeners = new Set<() => void>();

const parseStoredUser = (rawUser: string | null): StoredUser | null => {
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as StoredUser;
  } catch {
    return null;
  }
};

const toPositiveInteger = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
};

export const normalizeStoredUser = (
  user: StoredUser | null,
  preferredHouseholdId?: number | null
): StoredUser | null => {
  if (!user) {
    return null;
  }

  const households = Array.isArray(user.households) ? user.households.slice() : [];
  const householdIds = new Set(
    households
      .map((household) => toPositiveInteger(household?.id))
      .filter((householdId): householdId is number => householdId !== null)
  );

  const preferredId = toPositiveInteger(preferredHouseholdId);
  const cachedId = toPositiveInteger(user.household_id);
  const firstHouseholdId = toPositiveInteger(households[0]?.id);

  const candidateIds = [preferredId, cachedId, firstHouseholdId].filter(
    (householdId): householdId is number => householdId !== null
  );

  let resolvedHouseholdId: number | null = null;
  for (const candidateId of candidateIds) {
    if (householdIds.size === 0 || householdIds.has(candidateId)) {
      resolvedHouseholdId = candidateId;
      break;
    }
  }

  if (householdIds.size > 0 && resolvedHouseholdId !== null) {
    const activeHouseholdIndex = households.findIndex(
      (household) => toPositiveInteger(household?.id) === resolvedHouseholdId
    );

    if (activeHouseholdIndex > 0) {
      const [activeHousehold] = households.splice(activeHouseholdIndex, 1);
      households.unshift(activeHousehold);
    }
  }

  return {
    ...user,
    household_id: resolvedHouseholdId,
    households,
  };
};

const toHouseholdId = (user: StoredUser | null): number | null => {
  return toPositiveInteger(user?.household_id) ?? toPositiveInteger(user?.households?.[0]?.id);
};

const toRole = (user: StoredUser | null): string | null => {
  const activeHouseholdId = toHouseholdId(user);
  const activeHousehold = activeHouseholdId
    ? user?.households?.find((household) => toPositiveInteger(household?.id) === activeHouseholdId)
    : user?.households?.[0];
  const role = activeHousehold?.pivot?.role ?? activeHousehold?.role ?? user?.role;
  return typeof role === "string" && role.length > 0 ? role : null;
};

const emit = () => {
  listeners.forEach((listener) => listener());
};

export const setStoredUserCache = (user: StoredUser | null, hydrated = true): StoredUserState => {
  const normalizedUser = normalizeStoredUser(user);

  currentState = {
    hydrated,
    user: normalizedUser,
    householdId: toHouseholdId(normalizedUser),
    role: toRole(normalizedUser),
  };

  emit();
  return currentState;
};

export const getStoredUserStateSnapshot = (): StoredUserState => currentState;

export const subscribeStoredUserState = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const refreshStoredUserFromStorage = async (): Promise<StoredUserState> => {
  const rawUser = await SecureStore.getItemAsync("user");
  const parsed = parseStoredUser(rawUser);
  return setStoredUserCache(parsed, true);
};

export const hydrateStoredUserState = async (): Promise<StoredUserState> => {
  if (currentState.hydrated) {
    return currentState;
  }

  if (!hydratePromise) {
    hydratePromise = refreshStoredUserFromStorage().finally(() => {
      hydratePromise = null;
    });
  }

  return hydratePromise;
};

export const persistStoredUser = async (user: StoredUser): Promise<StoredUserState> => {
  const normalizedUser = normalizeStoredUser(user);
  if (!normalizedUser) {
    return setStoredUserCache(null, true);
  }

  await SecureStore.setItemAsync("user", JSON.stringify(normalizedUser));
  return setStoredUserCache(normalizedUser, true);
};

export const switchStoredHousehold = async (householdId: number): Promise<StoredUserState> => {
  const rawUser = await SecureStore.getItemAsync("user");
  const parsedUser = parseStoredUser(rawUser);
  const normalizedUser = normalizeStoredUser(parsedUser, householdId);

  if (!normalizedUser) {
    return setStoredUserCache(null, true);
  }

  await SecureStore.setItemAsync("user", JSON.stringify(normalizedUser));
  return setStoredUserCache(normalizedUser, true);
};

export const clearStoredUser = async (): Promise<StoredUserState> => {
  await SecureStore.deleteItemAsync("user");
  return setStoredUserCache(null, true);
};

export const useStoredUserState = (): StoredUserState => {
  const state = useSyncExternalStore(
    subscribeStoredUserState,
    getStoredUserStateSnapshot,
    getStoredUserStateSnapshot
  );

  useEffect(() => {
    if (!state.hydrated) {
      void hydrateStoredUserState();
    }
  }, [state.hydrated]);

  return state;
};

export const getStoredUser = async (): Promise<StoredUser | null> => {
  const state = await refreshStoredUserFromStorage();
  return state.user;
};

export const getStoredHouseholdId = async (): Promise<number | null> => {
  const state = await refreshStoredUserFromStorage();
  return state.householdId;
};

export const getStoredRole = async (): Promise<string | null> => {
  const state = await refreshStoredUserFromStorage();
  return state.role;
};
