import { apiFetch } from "@/src/api/client";
import { toPositiveInt } from "@/src/notifications/navigation";
import type { StoredUser } from "@/src/session/user-cache";

export type HomePendingNotification = {
    id: number;
    type: string;
    householdId: number | null;
    title: string;
    body: string;
    data: Record<string, unknown>;
    createdAt: string | null;
};

export type HomeHousehold = {
    id: number;
    name: string;
    role: "parent" | "enfant";
};

const ACTION_REQUIRED_NOTIFICATION_TYPES = new Set([
    "household_invite",
    "household_link_request",
    "task_reassignment_invite",
    "household_deletion_approval_request",
    "household_deletion_cancel_window",
]);

export const normalizeHouseholds = (rawHouseholds: unknown): HomeHousehold[] => {
    if (!Array.isArray(rawHouseholds)) {
        return [];
    }

    return rawHouseholds
        .map((rawHousehold): HomeHousehold | null => {
            const household = (rawHousehold ?? {}) as Record<string, unknown>;
            const id = toPositiveInt(household.id);
            if (!id) {
                return null;
            }

            const roleValue =
                String((household.pivot as { role?: unknown } | undefined)?.role ?? household.role ?? "").trim() ||
                "enfant";

            return {
                id,
                name: String(household.name ?? "").trim() || `Foyer #${id}`,
                role: roleValue === "parent" ? "parent" : "enfant",
            };
        })
        .filter((household): household is HomeHousehold => household !== null);
};

const normalizePendingNotifications = (
    rawNotifications: unknown[],
): HomePendingNotification[] => {
    return rawNotifications
        .map((rawNotification): HomePendingNotification | null => {
            const notification = (rawNotification ?? {}) as Record<string, unknown>;
            const parsedId = toPositiveInt(notification.id);
            if (!parsedId) {
                return null;
            }

            const type = String(notification.type ?? "").trim();
            const data = (notification.data ?? {}) as Record<string, unknown>;
            const status = String(data.status ?? "pending").trim();
            const householdId =
                toPositiveInt(notification.household_id) ??
                toPositiveInt(data.household_id) ??
                null;

            if (type === "household_deletion_cancel_window" && status !== "scheduled") {
                return null;
            }

            if (
                ACTION_REQUIRED_NOTIFICATION_TYPES.has(type)
                && type !== "household_deletion_cancel_window"
                && status !== "pending"
            ) {
                return null;
            }

            const inviterName = String(data.inviter_name ?? data.initiator_name ?? "").trim() || "Un parent";
            const householdName = String(data.household_name ?? "").trim() || "ce foyer";
            const requesterName = String(data.requester_name ?? data.requester_household_name ?? "").trim() || "Un foyer";
            const taskName = String(data.task_name ?? "").trim() || "cette tâche";

            const fallbackBody = type === "household_invite"
                ? `${inviterName} vous invite à rejoindre le foyer ${householdName}.`
                : type === "household_link_request"
                    ? `${requesterName} souhaite connecter son foyer à ${householdName}.`
                    : type === "task_reassignment_invite"
                        ? `${requesterName} vous demande de reprendre ${taskName} (foyer : ${householdName}).`
                        : type === "household_deletion_approval_request"
                            ? `${inviterName} demande la suppression du foyer ${householdName}.`
                            : type === "household_deletion_cancel_window"
                                ? `Le foyer ${householdName} sera supprimé dans 24h.`
                                : "Nouvelle notification.";

            return {
                id: parsedId,
                type,
                householdId,
                title: String(notification.title ?? "FamilyFlow").trim() || "FamilyFlow",
                body: String(notification.body ?? "").trim() || fallbackBody,
                data,
                createdAt: typeof notification.created_at === "string" ? notification.created_at : null,
            };
        })
        .filter((notification): notification is HomePendingNotification => notification !== null)
        .sort((left, right) => {
            const leftDate = left.createdAt ? new Date(left.createdAt).getTime() : 0;
            const rightDate = right.createdAt ? new Date(right.createdAt).getTime() : 0;
            return rightDate - leftDate;
        });
};

export const fetchPendingNotifications = async (): Promise<HomePendingNotification[]> => {
    const response = await apiFetch("/notifications/pending?all_households=1");
    const rawNotifications: unknown[] = Array.isArray(response?.notifications) ? response.notifications : [];
    return normalizePendingNotifications(rawNotifications);
};

export const fetchHomeProfile = async (): Promise<StoredUser | null> => {
    const response = await apiFetch("/me");
    return (response?.user ?? null) as StoredUser | null;
};

export const respondToNotification = async (
    notificationId: number,
    notificationType: string,
    action: "accept" | "refuse" | "cancel",
): Promise<{ user?: unknown } | null> => {
    if (notificationType === "household_invite") {
        return await apiFetch(`/notifications/${notificationId}/household-invite-response`, {
            method: "POST",
            body: JSON.stringify({ action }),
        });
    }
    if (notificationType === "household_link_request") {
        return await apiFetch(`/notifications/${notificationId}/household-link-response`, {
            method: "POST",
            body: JSON.stringify({ action }),
        });
    }
    if (notificationType === "task_reassignment_invite") {
        return await apiFetch(`/notifications/${notificationId}/task-reassignment-response`, {
            method: "POST",
            body: JSON.stringify({ action }),
        });
    }
    if (
        notificationType === "household_deletion_approval_request"
        || notificationType === "household_deletion_cancel_window"
    ) {
        return await apiFetch(`/notifications/${notificationId}/household-deletion-response`, {
            method: "POST",
            body: JSON.stringify({ action }),
        });
    }

    await apiFetch(`/notifications/${notificationId}/read`, { method: "POST" });
    return null;
};

export const markNotificationRead = async (notificationId: number): Promise<void> => {
    await apiFetch(`/notifications/${notificationId}/read`, { method: "POST" });
};

export const leaveActiveHousehold = async (): Promise<{ user?: unknown } | null> => {
    return await apiFetch("/households/leave", { method: "POST" });
};

