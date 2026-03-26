export type GuardRedirect =
  | "/"
  | "/change-credentials"
  | "/householdSetup"
  | "/home"
  | null;

export const resolveAppRedirect = (
  currentSegment: string,
  isAuthenticated: boolean,
  mustChangePassword: boolean,
  hasHousehold: boolean
): GuardRedirect => {
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
