/* eslint-env jest */
import {
  resolveAppRedirect,
  resolveAuthRedirect,
} from "@/src/navigation/auth-guards";

describe("auth guard redirects", () => {
  it("redirects unauthenticated users away from app routes", () => {
    expect(resolveAppRedirect("home", false, false, false)).toBe("/");
  });

  it("enforces change credentials before any other app route", () => {
    expect(resolveAppRedirect("home", true, true, true)).toBe("/change-credentials");
    expect(resolveAppRedirect("change-credentials", true, true, true)).toBeNull();
  });

  it("redirects to household setup when authenticated without household", () => {
    expect(resolveAppRedirect("home", true, false, false)).toBe("/householdSetup");
    expect(resolveAppRedirect("householdSetup", true, false, false)).toBeNull();
  });

  it("redirects from auth stack according to session state", () => {
    expect(resolveAuthRedirect(false, false, false)).toBeNull();
    expect(resolveAuthRedirect(true, true, true)).toBe("/change-credentials");
    expect(resolveAuthRedirect(true, false, false)).toBe("/householdSetup");
    expect(resolveAuthRedirect(true, false, true)).toBe("/home");
  });
});
