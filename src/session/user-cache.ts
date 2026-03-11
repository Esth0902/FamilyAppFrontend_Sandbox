import * as SecureStore from "expo-secure-store";

export type StoredHousehold = {
  id: number;
  pivot?: {
    role?: string;
  };
};

export type StoredUser = {
  household_id?: number;
  role?: string;
  households?: StoredHousehold[];
  must_change_password?: boolean;
};

export const getStoredUser = async (): Promise<StoredUser | null> => {
  const rawUser = await SecureStore.getItemAsync("user");
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as StoredUser;
  } catch {
    return null;
  }
};

export const getStoredHouseholdId = async (): Promise<number | null> => {
  const user = await getStoredUser();
  const householdId = Number(user?.household_id ?? user?.households?.[0]?.id ?? 0);

  return Number.isFinite(householdId) && householdId > 0 ? householdId : null;
};
