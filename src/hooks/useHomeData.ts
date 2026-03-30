import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toPositiveInt } from "@/src/notifications/navigation";
import { queryKeys } from "@/src/query/query-keys";
import {
    fetchHomeProfile,
    fetchPendingNotifications,
    normalizeHouseholds,
    type HomePendingNotification,
} from "@/src/services/homeService";
import {
    getStoredUserStateSnapshot,
    persistStoredUser,
    refreshStoredUserFromStorage,
    type StoredUser,
} from "@/src/session/user-cache";

type UseHomeDataArgs = {
    token: string | null;
    user: StoredUser | null;
};

export const useHomeData = ({ token, user }: UseHomeDataArgs) => {
    const profileQuery = useQuery({
        queryKey: queryKeys.home.profile(token, user?.household_id),
        enabled: !!token,
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const apiUser = await fetchHomeProfile();
            if (!apiUser) {
                throw new Error("Profil introuvable.");
            }

            const householdsFromApi = normalizeHouseholds(apiUser.households);
            const storeHouseholdId = toPositiveInt(getStoredUserStateSnapshot().householdId);
            const currentHouseholdId = storeHouseholdId ?? toPositiveInt(user?.household_id);
            const resolvedHouseholdId = currentHouseholdId
                && householdsFromApi.some((household) => household.id === currentHouseholdId)
                ? currentHouseholdId
                : householdsFromApi[0]?.id ?? null;

            const storedState = await persistStoredUser({
                ...(apiUser as Record<string, unknown>),
                household_id: resolvedHouseholdId,
            });

            return storedState.user;
        },
    });

    const notificationsQuery = useQuery({
        queryKey: queryKeys.home.pendingNotifications(token),
        enabled: !!token,
        staleTime: 10_000,
        gcTime: 5 * 60_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: fetchPendingNotifications,
    });

    useEffect(() => {
        if (!token) {
            void refreshStoredUserFromStorage();
        }
    }, [token]);

    const refreshProfile = useCallback(async () => {
        await profileQuery.refetch();
    }, [profileQuery]);

    const refreshAll = useCallback(async () => {
        await Promise.all([
            profileQuery.refetch(),
            notificationsQuery.refetch(),
        ]);
    }, [notificationsQuery, profileQuery]);

    const refreshNotifications = useCallback(async () => {
        await notificationsQuery.refetch();
    }, [notificationsQuery]);

    return {
        pendingNotifications: (notificationsQuery.data ?? []) as HomePendingNotification[],
        isInitialLoading: profileQuery.isPending || notificationsQuery.isPending,
        isRefreshing: profileQuery.isRefetching || notificationsQuery.isRefetching,
        profileError: profileQuery.error as Error | null,
        notificationsError: notificationsQuery.error as Error | null,
        refreshProfile,
        refreshAll,
        refreshNotifications,
    };
};
