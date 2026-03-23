export const queryKeys = {
  home: {
    profile: (token: string | null, householdId: number | null | undefined) =>
      ["home", "profile", token ?? "anonymous", householdId ?? 0] as const,
    pendingNotifications: (token: string | null) =>
      ["home", "pending-notifications", token ?? "anonymous"] as const,
    pendingNotificationsRoot: () => ["home", "pending-notifications"] as const,
  },
  recipes: {
    all: (householdId: number | null) => ["recipes", "all", householdId ?? 0] as const,
    dietaryTags: (householdId: number | null) => ["recipes", "dietary-tags", householdId ?? 0] as const,
  },
  dashboard: {
    root: (householdId: number | null) => ["dashboard", householdId ?? 0] as const,
    summary: (householdId: number | null) => ["dashboard", householdId ?? 0, "summary"] as const,
    budgetBoard: (householdId: number | null) => ["dashboard", householdId ?? 0, "budget-board"] as const,
    calendarBoard: (householdId: number | null, from: string, to: string) =>
      ["dashboard", householdId ?? 0, "calendar-board", from, to] as const,
  },
  budget: {
    board: (householdId: number | null) => ["budget", "board", householdId ?? 0] as const,
  },
  tasks: {
    overview: (householdId: number | null, weekStartIsoDay: number) =>
      ["tasks", "overview", householdId ?? 0, weekStartIsoDay] as const,
  },
};
