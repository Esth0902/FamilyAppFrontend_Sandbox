/* eslint-env jest */
const mockUseAuthStore = Object.assign(jest.fn(), {
  subscribe: jest.fn(() => jest.fn()),
});

jest.mock("@/src/store/useAuthStore", () => ({
  getAuthStateSnapshot: jest.fn(() => ({
    hydrated: true,
    token: null,
    user: null,
  })),
  hydrateAuthState: jest.fn(async () => ({
    hydrated: true,
    token: null,
    user: null,
  })),
  persistAuthUser: jest.fn(async () => undefined),
  useAuthStore: mockUseAuthStore,
}));

import { areUserSnapshotsEqual, normalizeStoredUser } from "@/src/session/user-cache";

describe("user-cache utilities", () => {
  it("normalizes preferred household and puts it first", () => {
    const user = {
      id: 1,
      household_id: 1,
      households: [
        { id: 1, role: "parent" },
        { id: 2, role: "enfant" },
      ],
    };

    const normalized = normalizeStoredUser(user, 2);

    expect(normalized?.household_id).toBe(2);
    expect(normalized?.households?.[0]?.id).toBe(2);
  });

  it("falls back to first valid household when ids are invalid", () => {
    const user = {
      id: 9,
      household_id: 999,
      households: [
        { id: 3 },
        { id: 4 },
      ],
    };

    const normalized = normalizeStoredUser(user, 999);

    expect(normalized?.household_id).toBe(3);
    expect(normalized?.households?.[0]?.id).toBe(3);
  });

  it("compares snapshots structurally", () => {
    const left = {
      id: 1,
      household_id: 2,
      households: [{ id: 2 }],
    };
    const right = {
      id: 1,
      household_id: 2,
      households: [{ id: 2 }],
    };

    expect(areUserSnapshotsEqual(left, right)).toBe(true);
    expect(areUserSnapshotsEqual(left, { ...right, household_id: 3 })).toBe(false);
  });
});
