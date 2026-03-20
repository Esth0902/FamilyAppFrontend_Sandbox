import { apiFetch } from "@/src/api/client";
import type { StoredUser } from "@/src/session/user-cache";

export const fetchAuthenticatedUser = async (): Promise<StoredUser | null> => {
    const response = await apiFetch("/me");
    return (response?.user ?? null) as StoredUser | null;
};

export const logoutAuthenticatedUser = async (): Promise<void> => {
    await apiFetch("/logout", {
        method: "POST",
    });
};

