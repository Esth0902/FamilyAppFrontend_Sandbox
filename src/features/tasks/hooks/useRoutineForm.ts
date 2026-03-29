import { useCallback, useEffect, useMemo, useState } from "react";

import {
  normalizeRecurrenceDays,
  weekLabelFromStart,
  weekStartIsoFromIsoDate,
} from "@/src/features/tasks/tasks-manage.utils";
import { isValidIsoDate, parseIsoDate, toIsoDate } from "@/src/utils/date";

import type { TaskTemplate } from "@/src/features/tasks/hooks/useTasksBoard";

type UseRoutineFormArgs = {
  plannedWeekStartDay: number;
};

type RoutineRecurrence = "daily" | "weekly" | "monthly" | "once";

export const useRoutineForm = ({ plannedWeekStartDay }: UseRoutineFormArgs) => {
  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const initialTemplateDay = useMemo(() => {
    const day = new Date().getDay();
    return day === 0 ? 7 : day;
  }, []);

  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateRecurrence, setTemplateRecurrence] = useState<RoutineRecurrence>("weekly");
  const [templateStartDate, setTemplateStartDate] = useState(todayIso);
  const [templateHasEndDate, setTemplateHasEndDate] = useState(false);
  const [templateEndDate, setTemplateEndDate] = useState(todayIso);
  const [templateRecurrenceDays, setTemplateRecurrenceDays] = useState<number[]>([initialTemplateDay]);
  const [templateRotation, setTemplateRotation] = useState(false);
  const [templateRotationCycleWeeks, setTemplateRotationCycleWeeks] = useState<1 | 2>(1);
  const [templateAssigneeUserIds, setTemplateAssigneeUserIds] = useState<number[]>([]);
  const [templateRotationUserIds, setTemplateRotationUserIds] = useState<number[]>([]);
  const [templateInterHouseholdAlternating, setTemplateInterHouseholdAlternating] = useState(false);
  const [templateInterHouseholdWeekStart, setTemplateInterHouseholdWeekStart] = useState<string>(() => toIsoDate(new Date()));
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [templateStartDateWheelVisible, setTemplateStartDateWheelVisible] = useState(false);
  const [templateEndDateWheelVisible, setTemplateEndDateWheelVisible] = useState(false);
  const [templateInterHouseholdWeekStartWheelVisible, setTemplateInterHouseholdWeekStartWheelVisible] = useState(false);

  const interHouseholdWeekStartIso = useMemo(
    () => weekStartIsoFromIsoDate(templateInterHouseholdWeekStart, plannedWeekStartDay),
    [plannedWeekStartDay, templateInterHouseholdWeekStart]
  );
  const interHouseholdWeekLabel = useMemo(() => {
    const parsed = parseIsoDate(interHouseholdWeekStartIso);
    return weekLabelFromStart(parsed ?? new Date());
  }, [interHouseholdWeekStartIso]);

  useEffect(() => {
    if (templateHasEndDate && isValidIsoDate(templateStartDate) && isValidIsoDate(templateEndDate) && templateEndDate < templateStartDate) {
      setTemplateEndDate(templateStartDate);
    }
  }, [templateEndDate, templateHasEndDate, templateStartDate]);

  const resetTemplateForm = useCallback(() => {
    setEditingTemplateId(null);
    setTemplateName("");
    setTemplateDescription("");
    setTemplateRecurrence("weekly");
    setTemplateStartDate(todayIso);
    setTemplateHasEndDate(false);
    setTemplateEndDate(todayIso);
    setTemplateRecurrenceDays([initialTemplateDay]);
    setTemplateRotation(false);
    setTemplateRotationCycleWeeks(1);
    setTemplateAssigneeUserIds([]);
    setTemplateRotationUserIds([]);
    setTemplateInterHouseholdAlternating(false);
    setTemplateInterHouseholdWeekStart(toIsoDate(new Date()));
    setTemplateStartDateWheelVisible(false);
    setTemplateEndDateWheelVisible(false);
    setTemplateInterHouseholdWeekStartWheelVisible(false);
  }, [initialTemplateDay, todayIso]);

  const startEditTemplate = useCallback((template: TaskTemplate) => {
    const normalizedDays = normalizeRecurrenceDays(template.recurrence_days);
    const nextDays = (template.recurrence === "daily" || template.recurrence === "weekly") && normalizedDays.length === 0
      ? (template.recurrence === "daily" ? [1, 2, 3, 4, 5, 6, 7] : [initialTemplateDay])
      : normalizedDays;
    const normalizedAssigneeIds = Array.isArray(template.assignee_user_ids) ? Array.from(new Set(template.assignee_user_ids.filter((id) => id > 0))) : [];
    const normalizedRotationIds = Array.isArray(template.rotation_user_ids) ? Array.from(new Set(template.rotation_user_ids.filter((id) => id > 0))) : [];
    const fallbackMemberIds = Number(template.fixed_user_id) > 0 ? [Number(template.fixed_user_id)] : [];
    const resolvedHasEndDate = isValidIsoDate(template.end_date ?? "");

    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateDescription(template.description ?? "");
    setTemplateRecurrence(template.recurrence);
    setTemplateStartDate(isValidIsoDate(template.start_date ?? "") ? String(template.start_date) : todayIso);
    setTemplateHasEndDate(resolvedHasEndDate);
    setTemplateEndDate(resolvedHasEndDate ? String(template.end_date) : todayIso);
    setTemplateRecurrenceDays(nextDays);
    setTemplateRotation(Boolean(template.is_rotation));
    setTemplateRotationCycleWeeks(template.rotation_cycle_weeks === 2 ? 2 : 1);
    setTemplateAssigneeUserIds(template.is_rotation ? [] : (normalizedAssigneeIds.length > 0 ? normalizedAssigneeIds : fallbackMemberIds));
    setTemplateRotationUserIds(template.is_rotation ? (normalizedRotationIds.length > 0 ? normalizedRotationIds : fallbackMemberIds) : []);
    setTemplateInterHouseholdAlternating(Boolean(template.is_inter_household_alternating));
    setTemplateInterHouseholdWeekStart(weekStartIsoFromIsoDate(template.inter_household_week_start ?? "", plannedWeekStartDay));
    setTemplateStartDateWheelVisible(false);
    setTemplateEndDateWheelVisible(false);
    setTemplateInterHouseholdWeekStartWheelVisible(false);
  }, [initialTemplateDay, plannedWeekStartDay, todayIso]);

  const buildTemplatePayload = useCallback(() => {
    const cleanName = templateName.trim();
    if (cleanName.length < 2) {
      return { payload: null, error: "Le nom de la routine est obligatoire." };
    }

    let recurrenceForPayload: RoutineRecurrence = templateRecurrence;
    let normalizedDays = normalizeRecurrenceDays(templateRecurrenceDays);
    if (recurrenceForPayload === "daily") {
      normalizedDays = [1, 2, 3, 4, 5, 6, 7];
    }
    if (recurrenceForPayload === "weekly") {
      if (normalizedDays.length === 0) {
        return { payload: null, error: "Choisis au moins un jour pour cette récurrence." };
      }
      if (normalizedDays.length === 7) {
        recurrenceForPayload = "daily";
        normalizedDays = [1, 2, 3, 4, 5, 6, 7];
      }
    }

    if (recurrenceForPayload !== "once" && !isValidIsoDate(templateStartDate)) {
      return { payload: null, error: "La date de début est invalide (YYYY-MM-DD)." };
    }

    let endDatePayload: string | null = null;
    if (recurrenceForPayload !== "once" && templateHasEndDate) {
      if (!isValidIsoDate(templateEndDate)) {
        return { payload: null, error: "La date de fin est invalide (YYYY-MM-DD)." };
      }
      if (templateEndDate < templateStartDate) {
        return { payload: null, error: "La date de fin doit être postérieure ou égale à la date de début." };
      }
      endDatePayload = templateEndDate;
    }

    const normalizedAssigneeIds = Array.from(new Set(templateAssigneeUserIds.filter((id) => id > 0)));
    const normalizedRotationIds = Array.from(new Set(templateRotationUserIds.filter((id) => id > 0)));
    if (templateRotation && normalizedRotationIds.length === 0) {
      return { payload: null, error: "Choisis les membres concernés par la rotation." };
    }
    if (!templateRotation && normalizedAssigneeIds.length === 0) {
      return { payload: null, error: "Choisis au moins un membre pour l'attribution." };
    }

    return {
      payload: {
        name: cleanName,
        description: templateDescription.trim() || null,
        recurrence: recurrenceForPayload,
        start_date: recurrenceForPayload === "once" ? null : templateStartDate,
        end_date: recurrenceForPayload === "once" ? null : endDatePayload,
        recurrence_days: recurrenceForPayload === "daily" || recurrenceForPayload === "weekly" ? normalizedDays : [],
        assignee_user_ids: templateRotation ? [] : normalizedAssigneeIds,
        rotation_user_ids: templateRotation ? normalizedRotationIds : [],
        is_rotation: templateRotation,
        rotation_cycle_weeks: templateRotation ? templateRotationCycleWeeks : 1,
        is_inter_household_alternating: templateInterHouseholdAlternating,
        inter_household_week_start: templateInterHouseholdAlternating ? interHouseholdWeekStartIso : null,
        fixed_user_id: null,
      } as Record<string, unknown>,
      error: null as string | null,
    };
  }, [
    interHouseholdWeekStartIso,
    templateAssigneeUserIds,
    templateDescription,
    templateEndDate,
    templateHasEndDate,
    templateInterHouseholdAlternating,
    templateName,
    templateRecurrence,
    templateRecurrenceDays,
    templateRotation,
    templateRotationCycleWeeks,
    templateRotationUserIds,
    templateStartDate,
  ]);

  return {
    editingTemplateId,
    interHouseholdWeekLabel,
    interHouseholdWeekStartIso,
    resetTemplateForm,
    startEditTemplate,
    buildTemplatePayload,
    templateDescription,
    templateHasEndDate,
    templateEndDate,
    templateEndDateWheelVisible,
    templateInterHouseholdAlternating,
    templateInterHouseholdWeekStart,
    templateInterHouseholdWeekStartWheelVisible,
    templateName,
    templateRecurrence,
    templateRecurrenceDays,
    templateRotation,
    templateRotationCycleWeeks,
    templateRotationUserIds,
    templateAssigneeUserIds,
    templateStartDate,
    templateStartDateWheelVisible,
    setTemplateDescription,
    setTemplateHasEndDate,
    setTemplateEndDate,
    setTemplateEndDateWheelVisible,
    setTemplateInterHouseholdAlternating,
    setTemplateInterHouseholdWeekStart,
    setTemplateInterHouseholdWeekStartWheelVisible,
    setTemplateName,
    setTemplateRecurrence,
    setTemplateRecurrenceDays,
    setTemplateRotation,
    setTemplateRotationCycleWeeks,
    setTemplateRotationUserIds,
    setTemplateAssigneeUserIds,
    setTemplateStartDate,
    setTemplateStartDateWheelVisible,
  };
};
