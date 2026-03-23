import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";
import {
  getAuthStateSnapshot,
  hydrateAuthState,
  setAuthState,
  useAuthStore,
  type AuthUser,
} from "@/src/store/useAuthStore";

export type StoredHousehold = {
  id?: number;
  name?: string;
  role?: string;
  nickname?: string;
  pivot?: {
    role?: string;
    nickname?: string;
  };
};

export type StoredUser = AuthUser & {
  households?: StoredHousehold[];
};

export type StoredUserState = {
  hydrated: boolean;
  user: StoredUser | null;
  householdId: number | null;
  role: string | null;
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

const serializeUserSnapshot = (user: StoredUser | null): string => {
  try {
    return JSON.stringify(user ?? null);
  } catch {
    return "";
  }
};

export const areUserSnapshotsEqual = (
  left: StoredUser | null,
  right: StoredUser | null
): boolean => {
  if (left === right) {
    return true;
  }
  return serializeUserSnapshot(left) === serializeUserSnapshot(right);
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

export const setStoredUserCache = (user: StoredUser | null, hydrated = true): StoredUserState => {
  const normalizedUser = normalizeStoredUser(user);

  setAuthState({
    hydrated,
    user: normalizedUser,
  });

  const snapshot = getAuthStateSnapshot();
  return {
    hydrated: snapshot.hydrated,
    user: normalizeStoredUser(snapshot.user as StoredUser | null),
    householdId: toHouseholdId(snapshot.user as StoredUser | null),
    role: toRole(snapshot.user as StoredUser | null),
  };
};

export const getStoredUserStateSnapshot = (): StoredUserState => {
  const snapshot = getAuthStateSnapshot();
  const normalizedUser = normalizeStoredUser(snapshot.user as StoredUser | null);

  return {
    hydrated: snapshot.hydrated,
    user: normalizedUser,
    householdId: toHouseholdId(normalizedUser),
    role: toRole(normalizedUser),
  };
};

export const subscribeStoredUserState = (listener: () => void): (() => void) => {
  return useAuthStore.subscribe(() => {
    listener();
  });
};

export const refreshStoredUserFromStorage = async (): Promise<StoredUserState> => {
  const snapshot = await hydrateAuthState();
  const normalizedUser = normalizeStoredUser(snapshot.user as StoredUser | null);

  if (!areUserSnapshotsEqual(normalizedUser, snapshot.user as StoredUser | null)) {
    setAuthState({ user: normalizedUser });
  }

  return {
    hydrated: true,
    user: normalizedUser,
    householdId: toHouseholdId(normalizedUser),
    role: toRole(normalizedUser),
  };
};

export const hydrateStoredUserState = async (): Promise<StoredUserState> => {
  return refreshStoredUserFromStorage();
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
  const snapshot = await hydrateAuthState();
  const normalizedUser = normalizeStoredUser(snapshot.user as StoredUser | null, householdId);

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
  const hydrated = useAuthStore((state) => state.hydrated);
  const user = useAuthStore((state) => state.user as StoredUser | null);
  const normalizedUser = normalizeStoredUser(user);
  const state = {
    hydrated,
    user: normalizedUser,
    householdId: toHouseholdId(normalizedUser),
    role: toRole(normalizedUser),
  };

  useEffect(() => {
    if (!state.hydrated) {
      void hydrateStoredUserState();
    }
  }, [state.hydrated]);

  return state;
};

export const getStoredUser = async (): Promise<StoredUser | null> => {
  const snapshot = getAuthStateSnapshot();
  if (!snapshot.hydrated) {
    const hydratedSnapshot = await hydrateAuthState();
    return normalizeStoredUser(hydratedSnapshot.user as StoredUser | null);
  }

  return normalizeStoredUser(snapshot.user as StoredUser | null);
};

export const getStoredHouseholdId = async (): Promise<number | null> => {
  const state = await refreshStoredUserFromStorage();
  return state.householdId;
};

export const getStoredRole = async (): Promise<string | null> => {
  const state = await refreshStoredUserFromStorage();
  return state.role;
};
