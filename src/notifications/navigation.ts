export type NotificationNavigationTarget =
    | "/(tabs)/home"
    | "/(tabs)/budget"
    | "/meal/poll"
    | "/settings"
    | {
        pathname: "/tasks/manage";
        params: { module: "planned" };
    };

const TASK_NOTIFICATION_TYPES = new Set([
    "task_assigned",
    "task_routine_assigned",
    "task_done_validation_needed",
    "task_validated",
    "task_cancelled",
    "task_reassigned",
    "task_reassignment_invite",
    "task_reassignment_invite_responded",
]);

const BUDGET_NOTIFICATION_TYPES = new Set([
    "budget_payment_validated",
    "budget_payment_due",
    "budget_negative_due",
    "budget_negative_carried_over",
    "budget_advance_requested",
    "budget_advance_reviewed",
    "budget_reimbursement_requested",
    "budget_reimbursement_reviewed",
]);

const POLL_NOTIFICATION_TYPES = new Set([
    "poll_opened",
    "poll_reminder",
    "poll_closing_soon",
    "poll_closed_too_late",
    "poll_needs_validation",
    "poll_validated",
    "poll_open_prompt",
]);

const SETTINGS_NOTIFICATION_TYPES = new Set([
    "household_invite",
    "household_invite_responded",
    "household_link_request",
    "household_link_request_responded",
]);

export const toPositiveInt = (value: unknown): number | null => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return null;
    }

    const normalized = Math.trunc(parsed);
    return normalized > 0 ? normalized : null;
};

export const resolveNotificationNavigationTarget = (
    notificationType: unknown
): NotificationNavigationTarget => {
    const type = String(notificationType ?? "").trim();

    if (TASK_NOTIFICATION_TYPES.has(type)) {
        return { pathname: "/tasks/manage", params: { module: "planned" } };
    }

    if (BUDGET_NOTIFICATION_TYPES.has(type)) {
        return "/(tabs)/budget";
    }

    if (POLL_NOTIFICATION_TYPES.has(type)) {
        return "/meal/poll";
    }

    if (SETTINGS_NOTIFICATION_TYPES.has(type)) {
        return "/settings";
    }

    return "/(tabs)/home";
};
