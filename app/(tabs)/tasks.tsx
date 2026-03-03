import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";

const STATUS_TODO = "à faire";
const STATUS_DONE = "réalisée";
const STATUS_CANCELLED = "annulée";
const WEEK_DAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 7, label: "Dim" },
] as const;

type TaskMember = {
  id: number;
  name: string;
  role: "parent" | "enfant";
};

type TaskTemplate = {
  id: number;
  name: string;
  description?: string | null;
  recurrence: "daily" | "weekly" | "monthly" | "once";
  recurrence_days?: number[];
  is_rotation: boolean;
  rotation_cycle_weeks?: number;
  fixed_user_id?: number | null;
  fixed_user_name?: string | null;
};

type TaskInstance = {
  id: number;
  task_template_id: number;
  title: string;
  description?: string | null;
  due_date: string;
  status: string;
  completed_at?: string | null;
  validated_by_parent: boolean;
  assignee: {
    id: number;
    name: string;
  };
  template: {
    id: number;
    recurrence: string;
    recurrence_days?: number[];
    is_rotation: boolean;
    rotation_cycle_weeks?: number;
  };
  permissions: {
    can_toggle: boolean;
    can_validate: boolean;
    can_cancel: boolean;
  };
};

type BoardPayload = {
  tasks_enabled: boolean;
  range: {
    from: string;
    to: string;
  };
  can_manage_templates: boolean;
  can_manage_instances: boolean;
  members: TaskMember[];
  templates: TaskTemplate[];
  instances: TaskInstance[];
};

const pad = (value: number) => String(value).padStart(2, "0");

const toIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const addDays = (baseDate: Date, days: number) => {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + days);
  return next;
};

const isValidIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const recurrenceLabel = (value: string) => {
  if (value === "daily") return "Quotidienne";
  if (value === "weekly") return "Hebdomadaire";
  if (value === "monthly") return "Mensuelle";
  if (value === "once") return "Ponctuelle";
  return value;
};

const isoWeekDayFromDate = (date: Date) => {
  const day = date.getDay();
  return day === 0 ? 7 : day;
};

const normalizeRecurrenceDays = (days: number[] | undefined) => {
  if (!Array.isArray(days)) return [];
  return Array.from(new Set(days.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))).sort((a, b) => a - b);
};

const recurrenceDaysLabel = (recurrence: string, recurrenceDays?: number[]) => {
  if (recurrence !== "daily" && recurrence !== "weekly") {
    return null;
  }

  const days = normalizeRecurrenceDays(recurrenceDays);
  if (days.length === 0) {
    return recurrence === "daily" ? "Tous les jours" : "Jour de création";
  }
  if (recurrence === "daily" && days.length === 7) {
    return "Tous les jours";
  }

  const labels = days
    .map((day) => WEEK_DAYS.find((item) => item.value === day)?.label ?? "")
    .filter((label) => label.length > 0)
    .join(", ");
  return `Jours: ${labels}`;
};

const formatDateLabel = (isoDate: string) => {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return parsed.toLocaleDateString("fr-BE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export default function TasksScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const initialFromDate = useMemo(() => toIsoDate(new Date()), []);
  const initialToDate = useMemo(() => toIsoDate(addDays(new Date(), 13)), []);
  const initialTemplateDay = useMemo(() => isoWeekDayFromDate(new Date()), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tasksEnabled, setTasksEnabled] = useState(false);
  const [rangeFrom] = useState(initialFromDate);
  const [rangeTo] = useState(initialToDate);
  const [canManageTemplates, setCanManageTemplates] = useState(false);
  const [canManageInstances, setCanManageInstances] = useState(false);
  const [members, setMembers] = useState<TaskMember[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [instances, setInstances] = useState<TaskInstance[]>([]);

  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateRecurrence, setTemplateRecurrence] = useState<"daily" | "weekly" | "monthly" | "once">("weekly");
  const [templateRecurrenceDays, setTemplateRecurrenceDays] = useState<number[]>([initialTemplateDay]);
  const [templateRotation, setTemplateRotation] = useState(false);
  const [templateRotationCycleWeeks, setTemplateRotationCycleWeeks] = useState<1 | 2>(1);
  const [templateFixedUserId, setTemplateFixedUserId] = useState<number | null>(null);
  const [templateRotationStartUserId, setTemplateRotationStartUserId] = useState<number | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);

  const [planningDate, setPlanningDate] = useState(initialFromDate);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<number | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualDate, setManualDate] = useState(initialFromDate);

  const loadBoard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }

    try {
      const payload = await apiFetch(`/tasks/board?from=${rangeFrom}&to=${rangeTo}`) as BoardPayload;
      setTasksEnabled(Boolean(payload?.tasks_enabled));
      setCanManageTemplates(Boolean(payload?.can_manage_templates));
      setCanManageInstances(Boolean(payload?.can_manage_instances));
      setMembers(Array.isArray(payload?.members) ? payload.members : []);
      setTemplates(Array.isArray(payload?.templates) ? payload.templates : []);
      setInstances(Array.isArray(payload?.instances) ? payload.instances : []);
    } catch (error: any) {
      Alert.alert("Taches", error?.message || "Impossible de charger les taches.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [rangeFrom, rangeTo]);

  useFocusEffect(
    useCallback(() => {
      void loadBoard();
    }, [loadBoard])
  );

  const stats = useMemo(() => {
    const todo = instances.filter((instance) => instance.status === STATUS_TODO).length;
    const done = instances.filter((instance) => instance.status === STATUS_DONE).length;
    const validated = instances.filter((instance) => instance.validated_by_parent).length;
    return { todo, done, validated };
  }, [instances]);

  const groupedInstances = useMemo(() => {
    const buckets: Record<string, TaskInstance[]> = {};
    const sorted = [...instances].sort((left, right) => {
      if (left.due_date !== right.due_date) {
        return left.due_date.localeCompare(right.due_date);
      }
      if (left.status !== right.status) {
        const order = [STATUS_TODO, STATUS_DONE, STATUS_CANCELLED];
        return order.indexOf(left.status) - order.indexOf(right.status);
      }
      return left.title.localeCompare(right.title);
    });

    sorted.forEach((instance) => {
      if (!buckets[instance.due_date]) {
        buckets[instance.due_date] = [];
      }
      buckets[instance.due_date].push(instance);
    });

    return Object.entries(buckets);
  }, [instances]);

  const applyTemplateRecurrence = (recurrence: "daily" | "weekly" | "monthly" | "once") => {
    setTemplateRecurrence(recurrence);
    if (recurrence === "daily" && templateRecurrenceDays.length === 0) {
      setTemplateRecurrenceDays([1, 2, 3, 4, 5, 6, 7]);
      return;
    }
    if (recurrence === "weekly" && templateRecurrenceDays.length === 0) {
      setTemplateRecurrenceDays([initialTemplateDay]);
      return;
    }
    if (recurrence === "monthly" || recurrence === "once") {
      setTemplateRecurrenceDays([]);
    }
  };

  const toggleTemplateRecurrenceDay = (dayValue: number) => {
    setTemplateRecurrenceDays((prev) => {
      if (prev.includes(dayValue)) {
        return prev.filter((day) => day !== dayValue);
      }
      return [...prev, dayValue].sort((a, b) => a - b);
    });
  };

  const resetTemplateForm = () => {
    setEditingTemplateId(null);
    setTemplateName("");
    setTemplateDescription("");
    setTemplateRecurrence("weekly");
    setTemplateRecurrenceDays([initialTemplateDay]);
    setTemplateRotation(false);
    setTemplateRotationCycleWeeks(1);
    setTemplateFixedUserId(null);
    setTemplateRotationStartUserId(null);
  };

  const startEditTemplate = (template: TaskTemplate) => {
    const normalizedDays = normalizeRecurrenceDays(template.recurrence_days);
    let nextDays = normalizedDays;
    if ((template.recurrence === "daily" || template.recurrence === "weekly") && normalizedDays.length === 0) {
      nextDays = template.recurrence === "daily" ? [1, 2, 3, 4, 5, 6, 7] : [initialTemplateDay];
    }

    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateDescription(template.description ?? "");
    setTemplateRecurrence(template.recurrence);
    setTemplateRecurrenceDays(nextDays);
    setTemplateRotation(Boolean(template.is_rotation));
    setTemplateRotationCycleWeeks(template.rotation_cycle_weeks === 2 ? 2 : 1);
    setTemplateFixedUserId(template.is_rotation ? null : (template.fixed_user_id ?? null));
    setTemplateRotationStartUserId(template.is_rotation ? (template.fixed_user_id ?? null) : null);
  };

  const saveTemplate = async () => {
    const cleanName = templateName.trim();
    if (cleanName.length < 2) {
      Alert.alert("Taches", "Le nom du template est obligatoire.");
      return;
    }

    const normalizedDays = normalizeRecurrenceDays(templateRecurrenceDays);
    if ((templateRecurrence === "daily" || templateRecurrence === "weekly") && normalizedDays.length === 0) {
      Alert.alert("Taches", "Choisis au moins un jour pour cette recurrence.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: cleanName,
        description: templateDescription.trim() || null,
        recurrence: templateRecurrence,
        recurrence_days: templateRecurrence === "daily" || templateRecurrence === "weekly" ? normalizedDays : [],
        is_rotation: templateRotation,
        rotation_cycle_weeks: templateRotation ? templateRotationCycleWeeks : 1,
        fixed_user_id: templateRotation ? templateRotationStartUserId : templateFixedUserId,
      };

      if (editingTemplateId) {
        await apiFetch(`/tasks/templates/${editingTemplateId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/tasks/templates", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      resetTemplateForm();
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Taches", error?.message || "Impossible de sauvegarder ce template.");
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (template: TaskTemplate) => {
    Alert.alert(
      "Supprimer le template",
      `Supprimer "${template.name}" ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            try {
              await apiFetch(`/tasks/templates/${template.id}`, { method: "DELETE" });
              if (editingTemplateId === template.id) {
                resetTemplateForm();
              }
              await loadBoard({ silent: true });
            } catch (error: any) {
              Alert.alert("Taches", error?.message || "Impossible de supprimer ce template.");
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const scheduleTemplate = async (templateId: number) => {
    if (!isValidIsoDate(planningDate)) {
      Alert.alert("Taches", "La date de planification est invalide (YYYY-MM-DD).");
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/tasks/instances", {
        method: "POST",
        body: JSON.stringify({
          task_template_id: templateId,
          due_date: planningDate,
          user_id: selectedAssigneeId ?? undefined,
        }),
      });
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Taches", error?.message || "Impossible de planifier cette tache.");
    } finally {
      setSaving(false);
    }
  };

  const createManualTask = async () => {
    const cleanTitle = manualTitle.trim();
    if (cleanTitle.length < 2) {
      Alert.alert("Taches", "Le nom de la tache est obligatoire.");
      return;
    }
    if (!isValidIsoDate(manualDate)) {
      Alert.alert("Taches", "La date de la tache est invalide (YYYY-MM-DD).");
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/tasks/instances", {
        method: "POST",
        body: JSON.stringify({
          name: cleanTitle,
          description: manualDescription.trim() || null,
          due_date: manualDate,
          user_id: selectedAssigneeId ?? undefined,
        }),
      });
      setManualTitle("");
      setManualDescription("");
      setManualDate(rangeFrom);
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Taches", error?.message || "Impossible de creer cette tache.");
    } finally {
      setSaving(false);
    }
  };

  const toggleInstance = async (instance: TaskInstance) => {
    if (!instance.permissions.can_toggle) {
      return;
    }

    const nextStatus = instance.status === STATUS_DONE ? STATUS_TODO : STATUS_DONE;

    setSaving(true);
    try {
      await apiFetch(`/tasks/instances/${instance.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Taches", error?.message || "Impossible de mettre a jour le statut.");
    } finally {
      setSaving(false);
    }
  };

  const toggleCancelled = async (instance: TaskInstance) => {
    if (!instance.permissions.can_cancel) {
      return;
    }

    const nextStatus = instance.status === STATUS_CANCELLED ? STATUS_TODO : STATUS_CANCELLED;

    setSaving(true);
    try {
      await apiFetch(`/tasks/instances/${instance.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Taches", error?.message || "Impossible de modifier cette tache.");
    } finally {
      setSaving(false);
    }
  };

  const validateInstance = async (instance: TaskInstance) => {
    if (!instance.permissions.can_validate || instance.validated_by_parent) {
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/tasks/instances/${instance.id}/validate`, {
        method: "POST",
      });
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Taches", error?.message || "Impossible de valider cette tache.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Taches du foyer</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              Planifie, attribue et valide les taches de la semaine.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/householdSetup?mode=edit&scope=tasks")}
            style={[styles.settingsBtn, { borderColor: theme.icon }]}
          >
            <MaterialCommunityIcons name="cog-outline" size={20} color={theme.tint} />
          </TouchableOpacity>
        </View>
      </View>

      {!tasksEnabled ? (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Module desactive</Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 20 }}>
            Active le module taches dans la configuration du foyer pour commencer.
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/householdSetup?mode=edit&scope=tasks")}
            style={[styles.primaryBtn, { backgroundColor: theme.tint }]}
          >
            <Text style={styles.primaryBtnText}>Configurer le foyer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.todo}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>A faire</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.done}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Realisees</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.validated}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Validees</Text>
            </View>
          </View>

          {canManageTemplates ? (
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Templates</Text>

              <Text style={[styles.label, { color: theme.text }]}>Date de planification</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                value={planningDate}
                onChangeText={setPlanningDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.textSecondary}
              />

              <Text style={[styles.label, { color: theme.text }]}>Assigner a</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberRow}>
                <TouchableOpacity
                  onPress={() => setSelectedAssigneeId(null)}
                  style={[
                    styles.memberChip,
                    { borderColor: theme.icon, backgroundColor: theme.background },
                    selectedAssigneeId === null && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                  ]}
                >
                  <Text style={{ color: theme.text }}>Auto</Text>
                </TouchableOpacity>
                {members.map((member) => (
                  <TouchableOpacity
                    key={`assign-${member.id}`}
                    onPress={() => setSelectedAssigneeId(member.id)}
                    style={[
                      styles.memberChip,
                      { borderColor: theme.icon, backgroundColor: theme.background },
                      selectedAssigneeId === member.id && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                    ]}
                  >
                    <Text style={{ color: theme.text }}>{member.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {templates.length > 0 ? (
                <View style={{ marginTop: 10, gap: 8 }}>
                  {templates.map((template) => (
                    <View key={`template-${template.id}`} style={[styles.templateRow, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: "700" }}>{template.name}</Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                          {recurrenceLabel(template.recurrence)}
                          {template.is_rotation
                            ? ` - Rotation ${template.rotation_cycle_weeks === 2 ? "bihebdo" : "hebdo"}`
                            : ""}
                          {template.fixed_user_name ? ` - ${template.fixed_user_name}` : ""}
                        </Text>
                        {recurrenceDaysLabel(template.recurrence, template.recurrence_days) ? (
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                            {recurrenceDaysLabel(template.recurrence, template.recurrence_days)}
                          </Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        onPress={() => startEditTemplate(template)}
                        style={[styles.iconBtn, { borderColor: theme.icon }]}
                        disabled={saving}
                      >
                        <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.tint} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => void scheduleTemplate(template.id)}
                        style={[styles.iconBtn, { borderColor: theme.icon }]}
                        disabled={saving}
                      >
                        <MaterialCommunityIcons name="calendar-plus-outline" size={20} color={theme.tint} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => void deleteTemplate(template)}
                        style={[styles.iconBtn, { borderColor: theme.icon }]}
                        disabled={saving}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={20} color="#CC4B4B" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ color: theme.textSecondary, marginTop: 8 }}>Aucun template pour le moment.</Text>
              )}

              <Text style={[styles.cardSubtitle, { color: theme.text, marginTop: 14 }]}>
                {editingTemplateId ? "Modifier le template" : "Nouveau template"}
              </Text>

              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                value={templateName}
                onChangeText={setTemplateName}
                placeholder="Nom du template"
                placeholderTextColor={theme.textSecondary}
              />
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                value={templateDescription}
                onChangeText={setTemplateDescription}
                placeholder="Description (optionnel)"
                placeholderTextColor={theme.textSecondary}
              />

              <View style={styles.recurrenceRow}>
                {(["once", "daily", "weekly", "monthly"] as const).map((recurrence) => (
                  <TouchableOpacity
                    key={recurrence}
                    onPress={() => applyTemplateRecurrence(recurrence)}
                    style={[
                      styles.recurrenceChip,
                      { borderColor: theme.icon, backgroundColor: theme.background },
                      templateRecurrence === recurrence && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                    ]}
                  >
                    <Text style={{ color: theme.text, fontSize: 12 }}>{recurrenceLabel(recurrence)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {(templateRecurrence === "daily" || templateRecurrence === "weekly") ? (
                <>
                  <Text style={[styles.label, { color: theme.text }]}>Jours d&apos;execution</Text>
                  <View style={styles.recurrenceRow}>
                    {WEEK_DAYS.map((day) => {
                      const selected = templateRecurrenceDays.includes(day.value);
                      return (
                        <TouchableOpacity
                          key={`day-${day.value}`}
                          onPress={() => toggleTemplateRecurrenceDay(day.value)}
                          style={[
                            styles.recurrenceChip,
                            { borderColor: theme.icon, backgroundColor: theme.background },
                            selected && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                          ]}
                        >
                          <Text style={{ color: theme.text, fontSize: 12 }}>{day.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {templateRecurrence === "daily" ? (
                      <TouchableOpacity
                        onPress={() => setTemplateRecurrenceDays([1, 2, 3, 4, 5, 6, 7])}
                        style={[styles.recurrenceChip, { borderColor: theme.icon, backgroundColor: theme.background }]}
                      >
                        <Text style={{ color: theme.text, fontSize: 12 }}>Tous</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </>
              ) : null}

              <View style={styles.toggleRow}>
                <Text style={{ color: theme.text, fontWeight: "600" }}>Rotation</Text>
                <TouchableOpacity
                  onPress={() => setTemplateRotation((prev) => !prev)}
                  style={[
                    styles.switchPill,
                    { borderColor: theme.icon, backgroundColor: templateRotation ? `${theme.tint}30` : theme.background },
                  ]}
                >
                  <Text style={{ color: templateRotation ? theme.tint : theme.textSecondary }}>
                    {templateRotation ? "Active" : "Inactive"}
                  </Text>
                </TouchableOpacity>
              </View>

              {templateRotation ? (
                <>
                  <Text style={[styles.label, { color: theme.text }]}>Cadence de rotation</Text>
                  <View style={styles.recurrenceRow}>
                    {[1, 2].map((cycleWeeks) => (
                      <TouchableOpacity
                        key={`cycle-${cycleWeeks}`}
                        onPress={() => setTemplateRotationCycleWeeks(cycleWeeks as 1 | 2)}
                        style={[
                          styles.recurrenceChip,
                          { borderColor: theme.icon, backgroundColor: theme.background },
                          templateRotationCycleWeeks === cycleWeeks && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                        ]}
                      >
                        <Text style={{ color: theme.text, fontSize: 12 }}>
                          {cycleWeeks === 1 ? "Chaque semaine" : "Toutes les 2 semaines"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[styles.label, { color: theme.text }]}>Commencer par (optionnel)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberRow}>
                    <TouchableOpacity
                      onPress={() => setTemplateRotationStartUserId(null)}
                      style={[
                        styles.memberChip,
                        { borderColor: theme.icon, backgroundColor: theme.background },
                        templateRotationStartUserId === null && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                      ]}
                    >
                      <Text style={{ color: theme.text }}>Auto</Text>
                    </TouchableOpacity>
                    {members.map((member) => (
                      <TouchableOpacity
                        key={`rotation-start-${member.id}`}
                        onPress={() => setTemplateRotationStartUserId(member.id)}
                        style={[
                          styles.memberChip,
                          { borderColor: theme.icon, backgroundColor: theme.background },
                          templateRotationStartUserId === member.id && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                        ]}
                      >
                        <Text style={{ color: theme.text }}>{member.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              ) : (
                <>
                  <Text style={[styles.label, { color: theme.text }]}>Membre fixe (optionnel)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberRow}>
                    <TouchableOpacity
                      onPress={() => setTemplateFixedUserId(null)}
                      style={[
                        styles.memberChip,
                        { borderColor: theme.icon, backgroundColor: theme.background },
                        templateFixedUserId === null && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                      ]}
                    >
                      <Text style={{ color: theme.text }}>Auto</Text>
                    </TouchableOpacity>
                    {members.map((member) => (
                      <TouchableOpacity
                        key={`fixed-${member.id}`}
                        onPress={() => setTemplateFixedUserId(member.id)}
                        style={[
                          styles.memberChip,
                          { borderColor: theme.icon, backgroundColor: theme.background },
                          templateFixedUserId === member.id && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                        ]}
                      >
                        <Text style={{ color: theme.text }}>{member.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              {editingTemplateId ? (
                <TouchableOpacity
                  onPress={resetTemplateForm}
                  style={[styles.iconBtn, { borderColor: theme.icon, alignSelf: "flex-end", marginBottom: 6 }]}
                  disabled={saving}
                >
                  <MaterialCommunityIcons name="close" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                onPress={() => void saveTemplate()}
                style={[styles.primaryBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {editingTemplateId ? "Enregistrer le template" : "Ajouter le template"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {canManageInstances ? (
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Tache ponctuelle</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                value={manualTitle}
                onChangeText={setManualTitle}
                placeholder="Nom de la tache"
                placeholderTextColor={theme.textSecondary}
              />
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                value={manualDescription}
                onChangeText={setManualDescription}
                placeholder="Description (optionnel)"
                placeholderTextColor={theme.textSecondary}
              />
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                value={manualDate}
                onChangeText={setManualDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.textSecondary}
              />

              <TouchableOpacity
                onPress={() => void createManualTask()}
                style={[styles.primaryBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
                disabled={saving}
              >
                {saving ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.primaryBtnText}>Ajouter la tache</Text>}
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Taches planifiees</Text>
            {groupedInstances.length > 0 ? (
              groupedInstances.map(([date, dayInstances]) => (
                <View key={`date-${date}`} style={{ marginBottom: 12 }}>
                  <Text style={[styles.dateTitle, { color: theme.textSecondary }]}>{formatDateLabel(date)}</Text>
                  {dayInstances.map((instance) => (
                    <View
                      key={`instance-${instance.id}`}
                      style={[styles.instanceCard, { borderColor: theme.icon, backgroundColor: theme.background }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: "700" }}>{instance.title}</Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                          {instance.assignee.name}
                          {instance.template.recurrence !== "once" ? ` - ${recurrenceLabel(instance.template.recurrence)}` : ""}
                        </Text>
                        {instance.description ? (
                          <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>{instance.description}</Text>
                        ) : null}
                      </View>

                      <View style={styles.instanceActions}>
                        <View style={[
                          styles.statusBadge,
                          instance.status === STATUS_TODO && { backgroundColor: "#F5A62322" },
                          instance.status === STATUS_DONE && { backgroundColor: "#2ECC7126" },
                          instance.status === STATUS_CANCELLED && { backgroundColor: "#CC4B4B22" },
                        ]}>
                          <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{instance.status}</Text>
                        </View>

                        <TouchableOpacity
                          onPress={() => void toggleInstance(instance)}
                          disabled={!instance.permissions.can_toggle || saving}
                          style={[styles.iconBtn, { borderColor: theme.icon, opacity: instance.permissions.can_toggle ? 1 : 0.4 }]}
                        >
                          <MaterialCommunityIcons
                            name={instance.status === STATUS_DONE ? "checkbox-marked-outline" : "checkbox-blank-outline"}
                            size={20}
                            color={theme.tint}
                          />
                        </TouchableOpacity>

                        {instance.permissions.can_validate ? (
                          <TouchableOpacity
                            onPress={() => void validateInstance(instance)}
                            disabled={instance.validated_by_parent || saving}
                            style={[styles.iconBtn, { borderColor: theme.icon, opacity: instance.validated_by_parent ? 0.4 : 1 }]}
                          >
                            <MaterialCommunityIcons
                              name={instance.validated_by_parent ? "check-decagram" : "check-decagram-outline"}
                              size={20}
                              color={instance.validated_by_parent ? "#2ECC71" : theme.tint}
                            />
                          </TouchableOpacity>
                        ) : null}

                        {instance.permissions.can_cancel ? (
                          <TouchableOpacity
                            onPress={() => void toggleCancelled(instance)}
                            disabled={saving}
                            style={[styles.iconBtn, { borderColor: theme.icon }]}
                          >
                            <MaterialCommunityIcons
                              name={instance.status === STATUS_CANCELLED ? "restore" : "cancel"}
                              size={20}
                              color={instance.status === STATUS_CANCELLED ? theme.tint : "#CC4B4B"}
                            />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              ))
            ) : (
              <Text style={{ color: theme.textSecondary }}>Aucune tache sur cette periode.</Text>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 36,
    paddingHorizontal: 16,
    paddingTop: 56,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "700",
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  card: {
    borderRadius: 14,
    padding: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  memberRow: {
    gap: 8,
    paddingBottom: 4,
  },
  memberChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  templateRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  recurrenceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  recurrenceChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  toggleRow: {
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  primaryBtn: {
    marginTop: 6,
    borderRadius: 10,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 14,
  },
  dateTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
    textTransform: "capitalize",
  },
  instanceCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  instanceActions: {
    alignItems: "flex-end",
    gap: 6,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-end",
  },
});

