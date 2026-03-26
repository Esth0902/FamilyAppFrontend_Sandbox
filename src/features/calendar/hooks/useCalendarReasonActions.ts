import { useCallback, useState } from "react";
import { InteractionManager } from "react-native";

import type {
  CalendarEvent,
  MealPlanEntry,
  MealPresenceStatus,
  ReasonAction,
} from "@/src/features/calendar/calendar-tab.types";

type UseCalendarReasonActionsParams = {
  dayProgramModalVisible: boolean;
  setDayProgramModalVisible: (visible: boolean) => void;
  saving: boolean;
  submitMealPresence: (mealPlanId: number, status: MealPresenceStatus, reason?: string | null) => Promise<boolean>;
  submitEventParticipation: (eventId: number, status: "participate" | "not_participate", reason?: string | null) => Promise<boolean>;
};

export function useCalendarReasonActions({
  dayProgramModalVisible,
  setDayProgramModalVisible,
  saving,
  submitMealPresence,
  submitEventParticipation,
}: UseCalendarReasonActionsParams) {
  const [reasonModalVisible, setReasonModalVisible] = useState(false);
  const [pendingReasonAction, setPendingReasonAction] = useState<ReasonAction | null>(null);
  const [reasonInput, setReasonInput] = useState("");
  const [restoreDayProgramAfterReasonModal, setRestoreDayProgramAfterReasonModal] = useState(false);

  const closeReasonModal = useCallback(() => {
    if (saving) {
      return;
    }

    setReasonModalVisible(false);
    setPendingReasonAction(null);
    setReasonInput("");
    if (restoreDayProgramAfterReasonModal) {
      setDayProgramModalVisible(true);
      setRestoreDayProgramAfterReasonModal(false);
    }
  }, [restoreDayProgramAfterReasonModal, saving, setDayProgramModalVisible]);

  const openMealReasonModal = useCallback(
    (entry: MealPlanEntry, status: Extract<MealPresenceStatus, "not_home" | "later">) => {
      const existingReason = entry.my_presence?.status === status
        ? String(entry.my_presence?.reason ?? "")
        : "";
      setPendingReasonAction({ kind: "meal", mealPlanId: entry.id, status });
      setReasonInput(existingReason);
      if (dayProgramModalVisible) {
        setRestoreDayProgramAfterReasonModal(true);
        setDayProgramModalVisible(false);
        InteractionManager.runAfterInteractions(() => {
          setReasonModalVisible(true);
        });
        return;
      }
      setRestoreDayProgramAfterReasonModal(false);
      setReasonModalVisible(true);
    },
    [dayProgramModalVisible, setDayProgramModalVisible]
  );

  const openEventReasonModal = useCallback(
    (event: CalendarEvent) => {
      const existingReason = event.my_participation?.status === "not_participate"
        ? String(event.my_participation?.reason ?? "")
        : "";
      setPendingReasonAction({ kind: "event", eventId: event.id, status: "not_participate" });
      setReasonInput(existingReason);
      if (dayProgramModalVisible) {
        setRestoreDayProgramAfterReasonModal(true);
        setDayProgramModalVisible(false);
        InteractionManager.runAfterInteractions(() => {
          setReasonModalVisible(true);
        });
        return;
      }
      setRestoreDayProgramAfterReasonModal(false);
      setReasonModalVisible(true);
    },
    [dayProgramModalVisible, setDayProgramModalVisible]
  );

  const confirmReasonAction = useCallback(async () => {
    if (!pendingReasonAction) {
      return;
    }

    const trimmedReason = reasonInput.trim();
    let success = false;

    if (pendingReasonAction.kind === "meal") {
      success = await submitMealPresence(
        pendingReasonAction.mealPlanId,
        pendingReasonAction.status,
        trimmedReason.length > 0 ? trimmedReason : null
      );
    } else {
      success = await submitEventParticipation(
        pendingReasonAction.eventId,
        pendingReasonAction.status,
        trimmedReason.length > 0 ? trimmedReason : null
      );
    }

    if (!success) {
      return;
    }

    setReasonModalVisible(false);
    setPendingReasonAction(null);
    setReasonInput("");
    if (restoreDayProgramAfterReasonModal) {
      setDayProgramModalVisible(true);
      setRestoreDayProgramAfterReasonModal(false);
    }
  }, [
    pendingReasonAction,
    reasonInput,
    restoreDayProgramAfterReasonModal,
    setDayProgramModalVisible,
    submitEventParticipation,
    submitMealPresence,
  ]);

  return {
    reasonModalVisible,
    pendingReasonAction,
    reasonInput,
    setReasonInput,
    openMealReasonModal,
    openEventReasonModal,
    closeReasonModal,
    confirmReasonAction,
  };
}
