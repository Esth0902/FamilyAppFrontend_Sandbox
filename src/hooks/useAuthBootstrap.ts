import { useEffect, useState } from "react";

import { persistStoredUser } from "@/src/session/user-cache";
import { fetchMe, toAuthServiceError } from "@/src/services/authService";
import { logoutAuth, hydrateAuthState, useAuthStore, type AuthUser } from "@/src/store/useAuthStore";

type UseAuthBootstrapResult = {
  isBootstrapping: boolean;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  hasHousehold: boolean;
  user: AuthUser | null;
};

const resolveHasHousehold = (user: AuthUser | null): boolean => {
  return !!(user?.household_id || (Array.isArray(user?.households) && user.households.length > 0));
};

export const useAuthBootstrap = (): UseAuthBootstrapResult => {
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const isHydrated = useAuthStore((state) => state.hydrated);

  useEffect(() => {
    let isCancelled = false;

    const bootstrapAuth = async () => {
      try {
        const snapshot = await hydrateAuthState();
        let resolvedToken = snapshot.token;
        let resolvedUser = snapshot.user;
        let mustLogoutAfterProfileFetch = false;

        if (resolvedToken && !resolvedUser) {
          try {
            const meUser = await fetchMe();
            if (meUser) {
              resolvedUser = meUser;
              await persistStoredUser(meUser);
            }
          } catch (error) {
            const authError = toAuthServiceError(error, "Impossible de récupérer le profil.");
            mustLogoutAfterProfileFetch = authError.kind === "unauthorized";
          }
        }

        if ((!resolvedToken && resolvedUser) || mustLogoutAfterProfileFetch) {
          await logoutAuth();
        }
      } catch (error) {
        console.error("Erreur bootstrap auth:", error);
      } finally {
        if (!isCancelled) {
          setIsBootstrapped(true);
        }
      }
    };

    void bootstrapAuth();

    return () => {
      isCancelled = true;
    };
  }, []);

  return {
    isBootstrapping: !isHydrated || !isBootstrapped,
    isAuthenticated: !!token,
    mustChangePassword: !!user?.must_change_password,
    hasHousehold: resolveHasHousehold(user),
    user,
  };
};
