import { Redirect, Slot, type Href } from "expo-router";

import { useAuthStore } from "@/src/store/useAuthStore";

const resolveAuthRedirect = (
  isAuthenticated: boolean,
  mustChangePassword: boolean,
  hasHousehold: boolean
): Href | null => {
  if (!isAuthenticated) {
    return null;
  }

  if (mustChangePassword) {
    return "/change-credentials";
  }

  if (!hasHousehold) {
    return "/householdSetup";
  }

  return "/home";
};

export default function AuthGroupLayout() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = !!token;
  const mustChangePassword = !!user?.must_change_password;
  const hasHousehold = !!(user?.household_id || (Array.isArray(user?.households) && user.households.length > 0));

  const redirectHref = resolveAuthRedirect(
    isAuthenticated,
    mustChangePassword,
    hasHousehold
  );

  if (redirectHref) {
    return <Redirect href={redirectHref} />;
  }

  return <Slot />;
}
