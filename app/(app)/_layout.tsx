import { Redirect, Slot, useSegments, type Href } from "expo-router";

import { resolveAppRedirect } from "@/src/navigation/auth-guards";
import { useAuthStore } from "@/src/store/useAuthStore";

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
  ) as Href | null;

  if (redirectHref) {
    return <Redirect href={redirectHref} />;
  }

  return <Slot />;
}
