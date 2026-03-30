export type GuardRedirect =
  | "/"
  | "/change-credentials"
  | "/householdSetup"
  | "/home"
  | null;

const normalizePathname = (pathname: string | null | undefined): string => {
  const trimmed = String(pathname ?? "").trim();
  if (!trimmed) {
    return "/";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const matchesRoute = (pathname: string, targetRoute: "/change-credentials" | "/householdSetup"): boolean => {
  return pathname === targetRoute || pathname.startsWith(`${targetRoute}/`);
};

export const resolveAppRedirect = (
  currentPathname: string | null,
  isAuthenticated: boolean,
  mustChangePassword: boolean,
  hasHousehold: boolean
): GuardRedirect => {
  const pathname = normalizePathname(currentPathname);
  const isChangeCredentialsRoute = matchesRoute(pathname, "/change-credentials");
  const isHouseholdSetupRoute = matchesRoute(pathname, "/householdSetup");

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

export const resolveAuthRedirect = (
  isAuthenticated: boolean,
  mustChangePassword: boolean,
  hasHousehold: boolean
): GuardRedirect => {
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
