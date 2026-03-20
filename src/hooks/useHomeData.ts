import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toPositiveInt } from "@/src/notifications/navigation";
import {
    fetchHomeProfile,
    fetchPendingNotifications,
    normalizeHouseholds,
    type HomePendingNotification,
} from "@/src/services/homeService";
import {
    persistStoredUser,
    refreshStoredUserFromStorage,
    type StoredUser,
} from "@/src/session/user-cache";

type UseHomeDataArgs = {
    token: string | null;
    user: StoredUser | null;
};

export const useHomeData = ({ token, user }: UseHomeDataArgs) => {
    const queryClient = useQueryClient();

    const profileQuery = useQuery({
        queryKey: ["home", "profile", token ?? "anonymous", user?.household_id ?? 0],
        enabled: !!token,
        staleTime: 30_000,
        queryFn: async () => {
            const apiUser = await fetchHomeProfile();
            if (!apiUser) {
                throw new Error("Profil introuvable.");
            }

            const householdsFromApi = normalizeHouseholds(apiUser.households);
            const currentHouseholdId = toPositiveInt(user?.household_id);
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
        queryKey: ["home", "pending-notifications", token ?? "anonymous"],
        enabled: !!token,
        staleTime: 10_000,
        refetchInterval: 60_000,
        queryFn: fetchPendingNotifications,
    });

    useEffect(() => {
        if (!token) {
            void refreshStoredUserFromStorage();
        }
    }, [token]);

    const refreshAll = useCallback(async () => {
        await Promise.all([
            profileQuery.refetch(),
            notificationsQuery.refetch(),
        ]);
    }, [notificationsQuery, profileQuery]);

    const refreshNotifications = useCallback(async () => {
        await notificationsQuery.refetch();
    }, [notificationsQuery]);

    const invalidateNotifications = useCallback(async () => {
        await queryClient.invalidateQueries({
            queryKey: ["home", "pending-notifications"],
        });
    }, [queryClient]);

    return {
        pendingNotifications: (notificationsQuery.data ?? []) as HomePendingNotification[],
        isInitialLoading: profileQuery.isPending || notificationsQuery.isPending,
        isRefreshing: profileQuery.isRefetching || notificationsQuery.isRefetching,
        profileError: profileQuery.error as Error | null,
        notificationsError: notificationsQuery.error as Error | null,
        refreshAll,
        refreshNotifications,
        invalidateNotifications,
    };
};

