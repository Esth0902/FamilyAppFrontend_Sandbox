import { Redirect, Slot, useSegments, type Href } from "expo-router";

import { useAuthStore } from "@/src/store/useAuthStore";

const resolveAppRedirect = (
  currentSegment: string,
  isAuthenticated: boolean,
  mustChangePassword: boolean,
  hasHousehold: boolean
): Href | null => {
  const isChangeCredentialsRoute = currentSegment === "change-credentials";
  const isHouseholdSetupRoute = currentSegment === "householdSetup";

  if (!isAuthenticated) {
    return "/";
  }

  if (mustChangePassword) {
    return isChangeCredentialsRoute ? null : "/change-credentials";
  }

  if (isChangeCredentialsRoute) {
    return hasHousehold ? "/home" : "/householdSetup";
  }

  if (!hasHousehold && !isHouseholdSetupRoute) {
    return "/householdSetup";
  }

  return null;
};

export default function AppGroupLayout() {
  const segments = useSegments() as string[];
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = !!token;
  const mustChangePassword = !!user?.must_change_password;
  const hasHousehold = !!(user?.household_id || (Array.isArray(user?.households) && user.households.length > 0));

  const rootSegment = segments[0] ?? "";
  const nestedSegment = segments[1] ?? "";
  const currentSegment = rootSegment === "(app)"
    ? nestedSegment
    : rootSegment;

  const redirectHref = resolveAppRedirect(
    currentSegment,
    isAuthenticated,
    mustChangePassword,
    hasHousehold
  );

  if (redirectHref) {
    return <Redirect href={redirectHref} />;
  }

  return <Slot />;
}
