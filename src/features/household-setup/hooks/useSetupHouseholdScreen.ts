import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, Share, useColorScheme } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Colors } from "@/constants/theme";
import { apiFetch } from "@/src/api/client";
import { subscribeToHouseholdRealtime } from "@/src/realtime/client";
import { persistStoredUser, useStoredUserState, type StoredUser } from "@/src/session/user-cache";

import { useHouseholdSetupFlow } from "./useHouseholdSetupFlow";
import {
  DAYS,
  DIETARY_TYPE_LABELS,
  DURATION_CHOICES,
  INITIAL_HOUSEHOLD_CONNECTION,
  INITIAL_HOUSEHOLD_CONNECTION_PERMISSIONS,
  MODULES,
  MONTH_LABELS,
} from "../utils/householdSetup.constants";
import {
  buildHouseholdConnectionShareText,
  buildMemberShareText,
  clamp,
  compareMembersByRoleThenName,
  isValidIsoDate,
  normalizeCustodyWeekStartDate,
  normalizeDietaryType,
  normalizeMemberIdentity,
  normalizeMemberRole,
  pad2,
  parseDecimalInput,
  parseIsoDate,
  parseTimeToHHMM,
  resolveActiveHouseholdRole,
  sortDietaryTags,
  toIsoDate,
  toggleMemberRole,
  weekDayShortLabel,
  wheelIndexFromOffset,
} from "../utils/householdSetup.helpers";
import type {
  BudgetChildSettingDraft,
  CreatedMemberCredential,
  DietaryTagDetail,
  DietaryTagOption,
  HouseholdConnectionPermissions,
  HouseholdConnectionState,
  HouseholdMember,
  ManagedHouseholdMember,
  MemberRole,
  ModuleKey,
  TaskSettingsInput,
} from "../utils/householdSetup.types";

export function useSetupHouseholdScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; scope?: string }>();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { user: authUser } = useStoredUserState();

  const isEditMode = params.mode === "edit";
  const isCreateMode = params.mode === "create";
  const isMealsScope = params.scope === "meals";
  const isTasksScope = params.scope === "tasks";
  const isBudgetScope = params.scope === "budget";
  const isCalendarScope = params.scope === "calendar";
  const isModuleScope = isMealsScope || isTasksScope || isBudgetScope || isCalendarScope;
  const showScopedModuleDetails = isEditMode && isModuleScope;

  const scopedBackRoute = isMealsScope
    ? "/(app)/(tabs)/meal"
    : isTasksScope
      ? "/(app)/(tabs)/tasks"
      : isBudgetScope
        ? "/(app)/(tabs)/budget"
        : isCalendarScope
          ? "/(app)/(tabs)/calendar"
          : null;

  const householdEditHeaderOffset = isEditMode && !isMealsScope && !isTasksScope && !isBudgetScope && !isCalendarScope
    ? 6
    : 0;
  
  const [isSetupCompleted, setIsSetupCompleted] = useState(true);

  const shouldUseSetupWizard = (isCreateMode || !isSetupCompleted) && !isModuleScope;

  const setupFlow = useHouseholdSetupFlow({
    enabled: shouldUseSetupWizard,
    steps: ["name", "modules", "children"],
    initialStep: "name",
  });

  const isNameStepActive = !shouldUseSetupWizard || setupFlow.currentStep === "name";
  const isModulesStepActive = !shouldUseSetupWizard || setupFlow.currentStep === "modules";
  const isChildrenStepActive = !shouldUseSetupWizard || setupFlow.currentStep === "children";

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [alreadyConfigured, setAlreadyConfigured] = useState(false);

  const [houseName, setHouseName] = useState("");

  const [activeModules, setActiveModules] = useState<Record<ModuleKey, boolean>>({
    meals: true,
    tasks: true,
    budget: true,
    calendar: true,
  });

  const [expandedModules, setExpandedModules] = useState<Record<ModuleKey, boolean>>({
    meals: false,
    tasks: false,
    budget: false,
    calendar: false,
  });

  const [mealOptions, setMealOptions] = useState({
    recipes: true,
    polls: true,
    shopping_list: true,
  });
  const [pollDay, setPollDay] = useState(5);
  const [pollTime, setPollTime] = useState("10:00");
  const [pollDuration, setPollDuration] = useState<number>(24);
  const [maxVotesPerUser, setMaxVotesPerUser] = useState("3");
  const [defaultServings, setDefaultServings] = useState("4");
  const [selectedMealDietaryTags, setSelectedMealDietaryTags] = useState<string[]>([]);
  const [selectedMealDietaryTagDetails, setSelectedMealDietaryTagDetails] = useState<Record<string, DietaryTagDetail>>({});
  const [availableDietaryTags, setAvailableDietaryTags] = useState<DietaryTagOption[]>([]);
  const [dietaryTagsLoading, setDietaryTagsLoading] = useState(false);
  const [dietaryTagSearch, setDietaryTagSearch] = useState("");
  const [selectedDietaryTypeFilter, setSelectedDietaryTypeFilter] = useState<DietaryTagOption["type"]>("diet");
  const [creatingDietaryTag, setCreatingDietaryTag] = useState(false);
  const [mealExpandedSections, setMealExpandedSections] = useState({
    recipes: false,
    polls: false,
  });

  const [createdMembersForShare, setCreatedMembersForShare] = useState<CreatedMemberCredential[]>([]);
  const [sendingMemberKey, setSendingMemberKey] = useState<string | null>(null);

  const [tasksSettings, setTasksSettings] = useState<TaskSettingsInput>({
    reminders_enabled: true,
    alternating_custody_enabled: false,
    custody_change_day: 5,
    custody_home_week_start: normalizeCustodyWeekStartDate(toIsoDate(new Date()), 5),
  });

  const [custodyDateWheelVisible, setCustodyDateWheelVisible] = useState(false);
  const [custodyDateWheelYear, setCustodyDateWheelYear] = useState(new Date().getFullYear());
  const [custodyDateWheelMonth, setCustodyDateWheelMonth] = useState(new Date().getMonth() + 1);
  const [custodyDateWheelDay, setCustodyDateWheelDay] = useState(new Date().getDate());

  const custodyDayWheelRef = useRef<ScrollView | null>(null);
  const custodyMonthWheelRef = useRef<ScrollView | null>(null);
  const custodyYearWheelRef = useRef<ScrollView | null>(null);
  const custodyDateDayIndexRef = useRef(Math.max(0, custodyDateWheelDay - 1));
  const custodyDateMonthIndexRef = useRef(Math.max(0, custodyDateWheelMonth - 1));
  const custodyDateYearIndexRef = useRef(0);

  const custodyYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 11 }, (_, index) => currentYear - 5 + index);
  }, []);

  const custodyMonthOptions = useMemo(() => Array.from({ length: 12 }, (_, index) => index + 1), []);
  const custodyDayOptions = useMemo(() => {
    const maxDay = new Date(custodyDateWheelYear, custodyDateWheelMonth, 0).getDate();
    return Array.from({ length: maxDay }, (_, index) => index + 1);
  }, [custodyDateWheelMonth, custodyDateWheelYear]);

  const [calendarSettings, setCalendarSettings] = useState({
    shared_view_enabled: true,
    absence_tracking_enabled: true,
  });

  const [budgetSettings, setBudgetSettings] = useState({
    currency: "EUR",
    notes: "",
  });

  const [budgetChildDrafts, setBudgetChildDrafts] = useState<BudgetChildSettingDraft[]>([]);
  const [budgetSettingsLoading, setBudgetSettingsLoading] = useState(false);
  const [budgetSettingsError, setBudgetSettingsError] = useState<string | null>(null);
  const [savingBudgetChildId, setSavingBudgetChildId] = useState<number | null>(null);

  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<MemberRole>("enfant");
  const [membersExpanded, setMembersExpanded] = useState(!isEditMode);
  const [modulesExpanded, setModulesExpanded] = useState(!isEditMode || isModuleScope);

  const [managedMembers, setManagedMembers] = useState<ManagedHouseholdMember[]>([]);
  const [managedRoleDrafts, setManagedRoleDrafts] = useState<Record<number, MemberRole>>({});
  const [canManageMembers, setCanManageMembers] = useState(false);
  const [managedHouseholdId, setManagedHouseholdId] = useState<number | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [addingManagedMember, setAddingManagedMember] = useState(false);
  const [updatingManagedMemberId, setUpdatingManagedMemberId] = useState<number | null>(null);
  const [deletingManagedMemberId, setDeletingManagedMemberId] = useState<number | null>(null);
  const [generatedCredentialsByMemberId, setGeneratedCredentialsByMemberId] = useState<Record<number, CreatedMemberCredential>>({});
  const [activeUser, setActiveUser] = useState<{ name?: string; email?: string } | null>(null);

  const [connectedHouseholdExpanded, setConnectedHouseholdExpanded] = useState(false);
  const [connectionState, setConnectionState] = useState<HouseholdConnectionState>(INITIAL_HOUSEHOLD_CONNECTION);
  const [connectionPermissions, setConnectionPermissions] = useState<HouseholdConnectionPermissions>(
    INITIAL_HOUSEHOLD_CONNECTION_PERMISSIONS
  );
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [connectionCodeInput, setConnectionCodeInput] = useState("");
  const [connectionActionLoading, setConnectionActionLoading] = useState<"share" | "connect" | "unlink" | null>(null);

  const visibleModules = useMemo(() => {
    if (isMealsScope) return MODULES.filter((module) => module.id === "meals");
    if (isTasksScope) return MODULES.filter((module) => module.id === "tasks");
    if (isBudgetScope) return MODULES.filter((module) => module.id === "budget");
    if (isCalendarScope) return MODULES.filter((module) => module.id === "calendar");
    return MODULES;
  }, [isBudgetScope, isCalendarScope, isMealsScope, isTasksScope]);

  const headerTitle = isMealsScope
    ? "Paramètres repas"
    : isTasksScope
      ? "Paramètres tâches"
      : isBudgetScope
        ? "Paramètres budget"
        : isCalendarScope
          ? "Paramètres calendrier"
          : isEditMode
            ? "Modifier le foyer"
            : "Nouveau Foyer";

  const toggleModule = useCallback((id: ModuleKey) => {
    setActiveModules((prev) => {
      const nextValue = !prev[id];
      setExpandedModules((expandedPrev) => ({
        ...expandedPrev,
        [id]: nextValue ? expandedPrev[id] : false,
      }));
      return { ...prev, [id]: nextValue };
    });
  }, []);

  const toggleModulePanel = useCallback((id: ModuleKey) => {
    if (!activeModules[id]) {
      return;
    }
    setExpandedModules((prev) => ({ ...prev, [id]: !prev[id] }));
  }, [activeModules]);

  const toggleMealSection = useCallback((section: "recipes" | "polls") => {
    setMealExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const updateMealOption = useCallback((option: "recipes" | "polls" | "shopping_list", value: boolean) => {
    setMealOptions((prev) => ({ ...prev, [option]: value }));
    if (!value && (option === "recipes" || option === "polls")) {
      setMealExpandedSections((prev) => ({ ...prev, [option]: false }));
    }
  }, []);

  const updateBudgetChildDraft = useCallback((childId: number, patch: Partial<BudgetChildSettingDraft>) => {
    setBudgetChildDrafts((prev) => prev.map((draft) => (
      draft.childId === childId ? { ...draft, ...patch } : draft
    )));
  }, []);

  const loadBudgetChildDrafts = useCallback(async () => {
    if (!isEditMode || !isBudgetScope) {
      setBudgetChildDrafts([]);
      setBudgetSettingsError(null);
      return;
    }

    setBudgetSettingsLoading(true);
    setBudgetSettingsError(null);

    try {
      const response = await apiFetch("/budget/board");
      const children = Array.isArray(response?.children) ? response.children : [];

      const drafts = children
        .map((item: unknown): BudgetChildSettingDraft | null => {
          const raw = (item ?? {}) as {
            child?: { id?: unknown; name?: unknown };
            setting?: {
              base_amount?: unknown;
              recurrence?: unknown;
              reset_day?: unknown;
              allow_advances?: unknown;
              max_advance_amount?: unknown;
            } | null;
          };

          const childId = Number(raw.child?.id ?? 0);
          if (!Number.isFinite(childId) || childId <= 0) {
            return null;
          }

          const recurrence = raw.setting?.recurrence === "monthly" ? "monthly" : "weekly";
          const resetDayRaw = Number(raw.setting?.reset_day ?? 1);

          return {
            childId: Math.trunc(childId),
            childName: String(raw.child?.name ?? "Enfant").trim() || "Enfant",
            baseAmountInput: String(raw.setting?.base_amount ?? 0),
            recurrence,
            resetDayInput: String(Number.isFinite(resetDayRaw) && resetDayRaw > 0 ? Math.trunc(resetDayRaw) : 1),
            allowAdvances: Boolean(raw.setting?.allow_advances ?? false),
            maxAdvanceInput: String(raw.setting?.max_advance_amount ?? 0),
          };
        })
        .filter((draft: BudgetChildSettingDraft | null): draft is BudgetChildSettingDraft => draft !== null);

      setBudgetChildDrafts(drafts);

      if (typeof response?.currency === "string" && response.currency.trim().length > 0) {
        setBudgetSettings((prev) => ({ ...prev, currency: response.currency }));
      }
    } catch (error: any) {
      const statusCode = Number(error?.status ?? 0);
      if (statusCode === 403) {
        setBudgetSettingsError("Le module budget est désactivé pour ce foyer.");
      } else {
        setBudgetSettingsError(error?.message || "Impossible de charger les paramètres budget.");
      }
      setBudgetChildDrafts([]);
    } finally {
      setBudgetSettingsLoading(false);
    }
  }, [isBudgetScope, isEditMode]);

  const saveBudgetChildDraft = useCallback(async (draft: BudgetChildSettingDraft) => {
    const baseAmount = parseDecimalInput(draft.baseAmountInput);
    const resetDay = Number(draft.resetDayInput);
    const maxAdvanceAmount = parseDecimalInput(draft.maxAdvanceInput);

    if (baseAmount === null || baseAmount < 0) {
      Alert.alert("Budget", "Le montant de base doit être un nombre positif.");
      return;
    }

    if (!Number.isInteger(resetDay)) {
      Alert.alert("Budget", "Le jour de réinitialisation doit être un entier.");
      return;
    }

    if (draft.recurrence === "weekly" && (resetDay < 1 || resetDay > 7)) {
      Alert.alert("Budget", "En hebdomadaire, le jour de réinitialisation doit être entre 1 et 7.");
      return;
    }

    if (draft.recurrence === "monthly" && (resetDay < 1 || resetDay > 31)) {
      Alert.alert("Budget", "En mensuel, le jour de réinitialisation doit être entre 1 et 31.");
      return;
    }

    if (maxAdvanceAmount === null || maxAdvanceAmount < 0) {
      Alert.alert("Budget", "Le plafond d'avance doit être un nombre positif.");
      return;
    }

    if (draft.allowAdvances && maxAdvanceAmount <= 0) {
      Alert.alert("Budget", "Le plafond d'avance doit être supérieur à 0 si les avances sont autorisées.");
      return;
    }

    setSavingBudgetChildId(draft.childId);
    try {
      await apiFetch(`/budget/settings/${draft.childId}`, {
        method: "PATCH",
        body: JSON.stringify({
          base_amount: baseAmount,
          recurrence: draft.recurrence,
          reset_day: resetDay,
          allow_advances: draft.allowAdvances,
          max_advance_amount: draft.allowAdvances ? maxAdvanceAmount : 0,
        }),
      });
      await loadBudgetChildDrafts();
    } catch (error: any) {
      Alert.alert("Budget", error?.message || "Impossible d'enregistrer les paramètres de cet enfant.");
    } finally {
      setSavingBudgetChildId(null);
    }
  }, [loadBudgetChildDrafts]);

  const loadDietaryTags = useCallback(async (type: DietaryTagOption["type"]) => {
    setDietaryTagsLoading(true);
    try {
      const tagsResponse = await apiFetch(`/households/dietary-tags?type=${type}`);
      if (Array.isArray(tagsResponse)) {
        const normalizedTags = tagsResponse
          .map((tag) => ({
            id: Number((tag as { id?: unknown })?.id ?? 0),
            type: normalizeDietaryType((tag as { type?: unknown })?.type),
            key: String((tag as { key?: unknown })?.key ?? "").trim(),
            label: String((tag as { label?: unknown })?.label ?? "").trim(),
            is_system: !!(tag as { is_system?: unknown })?.is_system,
          }))
          .filter((tag) => tag.id > 0 && tag.key.length > 0 && tag.label.length > 0);

        setAvailableDietaryTags(sortDietaryTags(normalizedTags));
        setSelectedMealDietaryTagDetails((prev) => {
          const next = { ...prev };
          normalizedTags.forEach((tag) => {
            next[tag.key] = {
              key: tag.key,
              label: tag.label,
              type: tag.type,
            };
          });
          return next;
        });
      } else {
        setAvailableDietaryTags([]);
      }
    } catch (error) {
      console.error("Erreur chargement dietary tags:", error);
      setAvailableDietaryTags([]);
    } finally {
      setDietaryTagsLoading(false);
    }
  }, []);

  const toggleMealDietaryTag = useCallback((tagKey: string) => {
    setSelectedMealDietaryTags((prev) =>
      prev.includes(tagKey)
        ? prev.filter((existingTag) => existingTag !== tagKey)
        : [...prev, tagKey]
    );
  }, []);

  const createDietaryTag = useCallback(async () => {
    const label = dietaryTagSearch.trim();
    if (label.length < 2) {
      Alert.alert("Dietary tags", "Le tag doit contenir au moins 2 caractères.");
      return;
    }

    setCreatingDietaryTag(true);
    try {
      const response = await apiFetch("/households/dietary-tags", {
        method: "POST",
        body: JSON.stringify({
          label,
          type: selectedDietaryTypeFilter,
        }),
      });

      const createdTag = response?.tag;
      if (createdTag) {
        const normalized = {
          id: Number(createdTag.id ?? 0),
          type: normalizeDietaryType(createdTag.type),
          key: String(createdTag.key ?? "").trim(),
          label: String(createdTag.label ?? "").trim(),
          is_system: !!createdTag.is_system,
        };

        if (normalized.id > 0 && normalized.key) {
          setAvailableDietaryTags((prev) => {
            const withoutDuplicate = prev.filter((tag) => tag.id !== normalized.id);
            return sortDietaryTags([...withoutDuplicate, normalized]);
          });

          setSelectedMealDietaryTagDetails((prev) => ({
            ...prev,
            [normalized.key]: {
              key: normalized.key,
              label: normalized.label,
              type: normalized.type,
            },
          }));

          setSelectedMealDietaryTags((prev) =>
            prev.includes(normalized.key) ? prev : [...prev, normalized.key]
          );
          setDietaryTagSearch("");
        }
      }
    } catch (error: any) {
      const closestTag = error?.data?.closest_tag;
      if (error?.status === 409 && closestTag?.key) {
        Alert.alert(
          "Tag similaire détecté",
          `${closestTag.label} existe déjà et a été sélectionné.`,
        );

        setSelectedMealDietaryTags((prev) =>
          prev.includes(String(closestTag.key)) ? prev : [...prev, String(closestTag.key)]
        );

        setSelectedMealDietaryTagDetails((prev) => ({
          ...prev,
          [String(closestTag.key)]: {
            key: String(closestTag.key),
            label: String(closestTag.label ?? closestTag.key),
            type: normalizeDietaryType(closestTag.type),
          },
        }));

        setDietaryTagSearch("");
        return;
      }

      Alert.alert("Dietary tags", error?.message || "Impossible d'ajouter ce tag.");
    } finally {
      setCreatingDietaryTag(false);
    }
  }, [dietaryTagSearch, selectedDietaryTypeFilter]);

  const loadManagedMembers = useCallback(async () => {
    if (!isEditMode) {
      return;
    }

    setMembersLoading(true);
    try {
      const response = await apiFetch("/household/members");
      const membersRaw: unknown[] = Array.isArray(response?.members) ? response.members : [];

      const normalizedMembers = membersRaw
        .map((rawMember: unknown): ManagedHouseholdMember | null => {
          const member = (rawMember ?? {}) as Record<string, unknown>;
          const parsedId = Number(member.id ?? 0);
          if (!Number.isFinite(parsedId) || parsedId <= 0) {
            return null;
          }

          return {
            id: Math.trunc(parsedId),
            name: String(member.name ?? "").trim() || "Membre",
            email: String(member.email ?? "").trim(),
            role: normalizeMemberRole(member.role),
            must_change_password: Boolean(member.must_change_password),
          };
        })
        .filter((member): member is ManagedHouseholdMember => member !== null);

      const nextRoleDrafts: Record<number, MemberRole> = {};
      normalizedMembers.forEach((member) => {
        nextRoleDrafts[member.id] = member.role;
      });

      setManagedMembers(normalizedMembers);
      setManagedRoleDrafts(nextRoleDrafts);
      setCanManageMembers(Boolean(response?.permissions?.can_manage_members));

      const parsedHouseholdId = Number(response?.household?.id ?? 0);
      setManagedHouseholdId(Number.isFinite(parsedHouseholdId) && parsedHouseholdId > 0 ? Math.trunc(parsedHouseholdId) : null);
    } catch (error: any) {
      Alert.alert("Membres", error?.message || "Impossible de charger les membres du foyer.");
    } finally {
      setMembersLoading(false);
    }
  }, [isEditMode]);

  const loadHouseholdConnection = useCallback(async () => {
    if (!isEditMode) {
      return;
    }

    setConnectionLoading(true);
    try {
      const response = await apiFetch("/households/connected-household");
      const rawConnection = (response?.connection ?? {}) as Record<string, unknown>;
      const rawPermissions = (response?.permissions ?? {}) as Record<string, unknown>;
      const rawPending = (rawConnection.pending_request ?? null) as Record<string, unknown> | null;
      const rawOtherHousehold = (rawPending?.other_household ?? null) as Record<string, unknown> | null;

      const pendingDirection = String(rawPending?.direction ?? "") === "incoming" ? "incoming" : "outgoing";
      const pendingStatusRaw = String(rawPending?.status ?? "");
      const pendingStatus: "pending" | "accepted" | "refused" =
        pendingStatusRaw === "accepted"
          ? "accepted"
          : pendingStatusRaw === "refused"
            ? "refused"
            : "pending";

      setConnectionState({
        is_connected: Boolean(rawConnection.is_connected),
        linked_household: rawConnection.linked_household && typeof rawConnection.linked_household === "object"
          ? {
              id: Number((rawConnection.linked_household as Record<string, unknown>).id ?? 0),
              name: String((rawConnection.linked_household as Record<string, unknown>).name ?? "").trim() || "Foyer connecté",
            }
          : null,
        pending_request: rawPending && Number(rawPending.id ?? 0) > 0
          ? {
              id: Number(rawPending.id),
              direction: pendingDirection,
              status: pendingStatus,
              created_at: typeof rawPending.created_at === "string" ? rawPending.created_at : null,
              other_household: rawOtherHousehold && Number(rawOtherHousehold.id ?? 0) > 0
                ? {
                    id: Number(rawOtherHousehold.id),
                    name: String(rawOtherHousehold.name ?? "").trim() || "Autre foyer",
                  }
                : null,
            }
          : null,
        active_code: rawConnection.active_code && typeof rawConnection.active_code === "object"
          ? {
              code: String((rawConnection.active_code as Record<string, unknown>).code ?? "").trim(),
              expires_at: typeof (rawConnection.active_code as Record<string, unknown>).expires_at === "string"
                ? String((rawConnection.active_code as Record<string, unknown>).expires_at)
                : null,
              share_text: String((rawConnection.active_code as Record<string, unknown>).share_text ?? "").trim(),
            }
          : null,
      });

      setConnectionPermissions({
        can_manage_connection: Boolean(rawPermissions.can_manage_connection),
        can_generate_code: Boolean(rawPermissions.can_generate_code),
        can_connect_with_code: Boolean(rawPermissions.can_connect_with_code),
        can_unlink: Boolean(rawPermissions.can_unlink),
      });
    } catch (error: any) {
      Alert.alert("Foyer connecté", error?.message || "Impossible de charger la liaison entre foyers.");
    } finally {
      setConnectionLoading(false);
    }
  }, [isEditMode]);

  const shareManagedCredential = useCallback(async (credential: CreatedMemberCredential, key: string) => {
    setSendingMemberKey(key);
    try {
      await Share.share({ message: buildMemberShareText(credential) });
    } catch (shareError) {
      console.error("Erreur de partage des accès membre:", shareError);
      Alert.alert("Partage", "Impossible d'ouvrir le partage pour ce membre.");
    } finally {
      setSendingMemberKey(null);
    }
  }, []);

  const onAddManagedMember = useCallback(async () => {
    const cleanName = memberName.trim();
    const cleanEmail = memberEmail.trim();

    if (!cleanName) {
      Alert.alert("Membres", "Le nom du membre est obligatoire.");
      return;
    }

    setAddingManagedMember(true);
    try {
      const response = await apiFetch("/household/members", {
        method: "POST",
        body: JSON.stringify({
          name: cleanName,
          role: memberRole,
          ...(cleanEmail ? { email: cleanEmail } : {}),
        }),
      });

      const invitationStatus = String(response?.invitation?.status ?? "");
      const invitedEmail = String(response?.invitation?.invited_email ?? cleanEmail);
      const isInvitationPending = invitationStatus === "pending";

      if (isInvitationPending) {
        setMemberName("");
        setMemberEmail("");
        setMemberRole("enfant");

        Alert.alert(
          "Invitation envoyée",
          invitedEmail
            ? `${invitedEmail} recevra une demande pour rejoindre le foyer.`
            : `${cleanName} recevra une demande pour rejoindre le foyer.`
        );
        return;
      }

      const memberId = Number(response?.member?.id ?? 0);
      const normalizedMemberId = Number.isFinite(memberId) && memberId > 0 ? Math.trunc(memberId) : null;

      const credential: CreatedMemberCredential = {
        id: normalizedMemberId ?? undefined,
        name: String(response?.member?.name ?? cleanName),
        generated_email: String(response?.generated_email ?? ""),
        generated_password: String(response?.generated_password ?? ""),
        share_text: String(response?.share_text ?? ""),
      };

      if (normalizedMemberId) {
        setGeneratedCredentialsByMemberId((prev) => ({
          ...prev,
          [normalizedMemberId]: credential,
        }));
      }

      setMemberName("");
      setMemberEmail("");
      setMemberRole("enfant");
      await loadManagedMembers();

      if (normalizedMemberId) {
        await shareManagedCredential(credential, `managed-${normalizedMemberId}`);
      }
    } catch (error: any) {
      Alert.alert("Erreur", error?.message || "Impossible d'ajouter ce membre.");
    } finally {
      setAddingManagedMember(false);
    }
  }, [loadManagedMembers, memberEmail, memberName, memberRole, shareManagedCredential]);

  const onUpdateManagedMemberRole = useCallback(async (member: ManagedHouseholdMember, forcedRole?: MemberRole) => {
    const nextRole = forcedRole ?? managedRoleDrafts[member.id] ?? member.role;

    setUpdatingManagedMemberId(member.id);
    try {
      await apiFetch(`/household/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      });

      await loadManagedMembers();
      Alert.alert("Membres", "Rôle mis à jour.");
    } catch (error: any) {
      Alert.alert("Erreur", error?.message || "Impossible de mettre à jour ce membre.");
    } finally {
      setUpdatingManagedMemberId(null);
    }
  }, [loadManagedMembers, managedRoleDrafts]);

  const updateManagedRoleDraft = useCallback((memberId: number, role: MemberRole) => {
    setManagedRoleDrafts((prev) => ({
      ...prev,
      [memberId]: role,
    }));
  }, []);

  const confirmManagedMemberRoleToggle = useCallback((member: ManagedHouseholdMember) => {
    const currentRole = managedRoleDrafts[member.id] ?? member.role;
    const nextRole = toggleMemberRole(currentRole);

    Alert.alert(
      `${member.name}`,
      "Modifier le rôle ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Enregistrer",
          onPress: () => {
            updateManagedRoleDraft(member.id, nextRole);
            void onUpdateManagedMemberRole(member, nextRole);
          },
        },
      ]
    );
  }, [managedRoleDrafts, onUpdateManagedMemberRole, updateManagedRoleDraft]);

  const onDeleteManagedMember = useCallback((member: ManagedHouseholdMember) => {
    Alert.alert(
      "Supprimer le membre",
      `Confirmer la suppression de ${member.name} ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeletingManagedMemberId(member.id);
              try {
                await apiFetch(`/household/members/${member.id}`, {
                  method: "DELETE",
                });

                setGeneratedCredentialsByMemberId((prev) => {
                  const next = { ...prev };
                  delete next[member.id];
                  return next;
                });

                await loadManagedMembers();
                Alert.alert("Membres", "Membre supprimé du foyer.");
              } catch (error: any) {
                Alert.alert("Erreur", error?.message || "Impossible de supprimer ce membre.");
              } finally {
                setDeletingManagedMemberId(null);
              }
            })();
          },
        },
      ]
    );
  }, [loadManagedMembers]);

  const onShareManagedMemberAccess = useCallback(async (member: ManagedHouseholdMember) => {
    if (!member.must_change_password) {
      return;
    }

    const key = `managed-${member.id}`;
    const cachedCredential = generatedCredentialsByMemberId[member.id];
    if (cachedCredential?.generated_password && cachedCredential.generated_password.trim().length > 0) {
      await shareManagedCredential(cachedCredential, key);
      return;
    }

    setSendingMemberKey(key);
    try {
      const response = await apiFetch(`/household/members/${member.id}/temporary-access`, {
        method: "POST",
      });

      const credential: CreatedMemberCredential = {
        id: member.id,
        name: String(response?.member?.name ?? member.name),
        generated_email: String(response?.generated_email ?? member.email),
        generated_password: String(response?.generated_password ?? ""),
        share_text: String(response?.share_text ?? ""),
      };

      setGeneratedCredentialsByMemberId((prev) => ({
        ...prev,
        [member.id]: credential,
      }));

      await Share.share({
        message: buildMemberShareText(credential),
      });
    } catch (error: any) {
      Alert.alert("Erreur", error?.message || "Impossible de partager les accès de ce membre.");
    } finally {
      setSendingMemberKey(null);
    }
  }, [generatedCredentialsByMemberId, shareManagedCredential]);

  const addMember = useCallback(() => {
    const cleanName = memberName.trim();
    const cleanEmail = memberEmail.trim();

    if (!cleanName) {
      Alert.alert("Oups", "Le nom du membre est obligatoire.");
      return;
    }

    const member: HouseholdMember = {
      name: cleanName,
      role: memberRole,
      ...(cleanEmail ? { email: cleanEmail } : {}),
    };

    setMembers((prev) => [...prev, member]);
    setMemberName("");
    setMemberEmail("");
    setMemberRole("enfant");
  }, [memberEmail, memberName, memberRole]);

  const removeMember = useCallback((index: number) => {
    setMembers((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const toggleDraftMemberRoleAtIndex = useCallback((memberIndex: number) => {
    setMembers((prev) => prev.map((member, index) => (
      index === memberIndex ? { ...member, role: toggleMemberRole(member.role) } : member
    )));
  }, []);

  const shareMemberCredentials = useCallback(async (member: CreatedMemberCredential, key: string) => {
    setSendingMemberKey(key);
    try {
      await Share.share({ message: buildMemberShareText(member) });
    } catch (shareError) {
      console.error("Erreur de partage d'accès membre:", shareError);
      Alert.alert("Partage", "Impossible d'ouvrir le partage pour ce membre.");
    } finally {
      setSendingMemberKey(null);
    }
  }, []);

  const onShareHouseholdConnectionCode = useCallback(async () => {
    setConnectionActionLoading("share");
    try {
      const response = await apiFetch("/households/connected-household/link-code", {
        method: "POST",
      });

      const codeValue = String(response?.code?.value ?? "").trim();
      if (!codeValue) {
        throw new Error("Code de liaison indisponible.");
      }

      const shareText = buildHouseholdConnectionShareText(
        houseName.trim() || "Mon foyer",
        codeValue,
        String(response?.code?.share_text ?? "")
      );

      await Share.share({ message: shareText });
      await loadHouseholdConnection();
    } catch (error: any) {
      Alert.alert("Foyer connecté", error?.message || "Impossible de partager un code de liaison.");
    } finally {
      setConnectionActionLoading(null);
    }
  }, [houseName, loadHouseholdConnection]);

  const onConnectHouseholdWithCode = useCallback(async () => {
    const normalizedCode = connectionCodeInput.trim();
    if (!normalizedCode) {
      Alert.alert("Foyer connecté", "Encode un code de liaison.");
      return;
    }

    setConnectionActionLoading("connect");
    try {
      const response = await apiFetch("/households/connected-household/connect", {
        method: "POST",
        body: JSON.stringify({
          code: normalizedCode,
        }),
      });

      setConnectionCodeInput("");
      await loadHouseholdConnection();
      Alert.alert("Foyer connecté", String(response?.message ?? "Demande de liaison envoyée."));
    } catch (error: any) {
      Alert.alert("Foyer connecté", error?.message || "Impossible d'envoyer la demande de liaison.");
    } finally {
      setConnectionActionLoading(null);
    }
  }, [connectionCodeInput, loadHouseholdConnection]);

  const onUnlinkConnectedHousehold = useCallback(() => {
    Alert.alert(
      "Rompre la liaison",
      "Cette action supprime le lien entre les deux foyers.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Rompre",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setConnectionActionLoading("unlink");
              try {
                const response = await apiFetch("/households/connected-household/unlink", {
                  method: "POST",
                });
                await loadHouseholdConnection();
                Alert.alert("Foyer connecté", String(response?.message ?? "Liaison supprimée."));
              } catch (error: any) {
                Alert.alert("Foyer connecté", error?.message || "Impossible de rompre la liaison.");
              } finally {
                setConnectionActionLoading(null);
              }
            })();
          },
        },
      ]
    );
  }, [loadHouseholdConnection]);

  const goToNextSetupStep = useCallback(() => {
    if (!shouldUseSetupWizard) {
      return;
    }

    if (setupFlow.currentStep === "name" && !houseName.trim()) {
      Alert.alert("Oups", "Le nom du foyer est obligatoire.");
      return;
    }

    setupFlow.nextStep();
  }, [houseName, setupFlow, shouldUseSetupWizard]);

  const goToPreviousSetupStep = useCallback(() => {
    if (!shouldUseSetupWizard) {
      return;
    }
    setupFlow.previousStep();
  }, [setupFlow, shouldUseSetupWizard]);

  const goBack = useCallback(() => {
    if (scopedBackRoute) {
      router.replace(scopedBackRoute);
      return;
    }
    if (isEditMode || alreadyConfigured) {
      router.replace("/(app)/(tabs)/home");
      return;
    }
    router.back();
  }, [alreadyConfigured, isEditMode, router, scopedBackRoute]);

  const handleSave = useCallback(async () => {
    // 1. Si on est sur l'écran final de partage des accès et qu'on clique sur Terminer
    if (createdMembersForShare.length > 0) {
      setIsSetupCompleted(true);
      router.replace("/(app)/(tabs)/home");
      return;
    }

    // 2. Vérification du nom
    if (!houseName.trim()) {
      Alert.alert("Oups", "Le nom du foyer est obligatoire.");
      return;
    }

    // 3. Vérification du budget : on compte les enfants non sauvegardés ET les enfants en base de données
    if (shouldUseSetupWizard && activeModules.budget) {
      const draftChildCount = members.filter((m) => m.role === "enfant").length;
      const managedChildCount = managedMembers.filter(
        (m) => (managedRoleDrafts[m.id] ?? m.role) === "enfant"
      ).length;

      if (draftChildCount + managedChildCount === 0) {
        Alert.alert("Budget", "Le module budget nécessite au moins un membre enfant dans le foyer.");
        return;
      }
    }

    
    const parsedDefaultServings = Number(defaultServings);
    if (!Number.isInteger(parsedDefaultServings) || parsedDefaultServings < 1 || parsedDefaultServings > 30) {
      Alert.alert("Repas", "Le nombre de portions par défaut doit être entre 1 et 30.");
      return;
    }

    const parsedMaxVotes = Number(maxVotesPerUser);
    if (!Number.isInteger(parsedMaxVotes) || parsedMaxVotes < 1 || parsedMaxVotes > 20) {
      Alert.alert("Sondages", "Le nombre maximum de votes doit être entre 1 et 20.");
      return;
    }

    const parsedPollTime = parseTimeToHHMM(pollTime);
    if (!parsedPollTime) {
      Alert.alert("Sondages", "L'heure du sondage doit être au format HH:MM.");
      return;
    }

    const parsedDietaryTags = Array.from(
      new Set(
        selectedMealDietaryTags
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      )
    );

    if (tasksSettings.alternating_custody_enabled) {
      if (!isValidIsoDate(tasksSettings.custody_home_week_start)) {
        Alert.alert("Tâches", "La date de début de semaine à la maison doit être au format YYYY-MM-DD.");
        return;
      }

      if (!Number.isInteger(tasksSettings.custody_change_day) || tasksSettings.custody_change_day < 1 || tasksSettings.custody_change_day > 7) {
        Alert.alert("Tâches", "Le jour de bascule doit être compris entre 1 et 7.");
        return;
      }
    }

    const modulesPayload = {
      meals: {
        enabled: activeModules.meals,
        options: {
          recipes: !!mealOptions.recipes,
          polls: !!mealOptions.polls,
          shopping_list: !!mealOptions.shopping_list,
        },
        settings: {
          poll_day: pollDay,
          poll_time: parsedPollTime,
          poll_duration: pollDuration,
          max_votes_per_user: parsedMaxVotes,
          default_servings: parsedDefaultServings,
          dietary_tags: parsedDietaryTags,
        },
      },
      tasks: {
        enabled: activeModules.tasks,
        settings: {
          reminders_enabled: tasksSettings.reminders_enabled,
          alternating_custody_enabled: tasksSettings.alternating_custody_enabled,
          custody_change_day:
            Number.isInteger(tasksSettings.custody_change_day) && tasksSettings.custody_change_day >= 1 && tasksSettings.custody_change_day <= 7
              ? tasksSettings.custody_change_day
              : 5,
          custody_home_week_start: normalizeCustodyWeekStartDate(
            tasksSettings.custody_home_week_start,
            Number.isInteger(tasksSettings.custody_change_day) && tasksSettings.custody_change_day >= 1 && tasksSettings.custody_change_day <= 7
              ? tasksSettings.custody_change_day
              : 5
          ),
        },
      },
      calendar: {
        enabled: activeModules.calendar,
        settings: calendarSettings,
      },
      budget: {
        enabled: activeModules.budget,
        settings: budgetSettings,
      },
    };

    setLoading(true);
    try {
      if (isEditMode) {
        await apiFetch("/households/config", {
          method: "PATCH",
          body: JSON.stringify({
            household_name: houseName.trim(),
            modules: modulesPayload,
          }),
        });

        Alert.alert("Succès", "Configuration du foyer mise à jour.");
      } else {
        const payload = {
          household_name: houseName.trim(),
          members: members.map((member) => {
            if (member.role !== "enfant") {
              return member;
            }

            return {
              ...member,
              budget: {
                base_amount: 0,
                recurrence: "weekly" as const,
                reset_day: 1,
                allow_advances: false,
                max_advance_amount: 0,
              },
            };
          }),
          modules: modulesPayload,
        };

        const response = await apiFetch("/households", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        const createdHouseholdId = Number(response?.household?.id ?? 0);
        if (createdHouseholdId > 0) {
          try {
            const meResponse = await apiFetch("/me");
            if (meResponse?.user) {
              await persistStoredUser({
                ...meResponse.user,
                household_id: createdHouseholdId,
              });
            }
          } catch (refreshError) {
            console.error("Erreur rafraîchissement profil après création foyer:", refreshError);
            if (authUser) {
              await persistStoredUser({
                ...(authUser as StoredUser),
                household_id: createdHouseholdId,
              });
            }
          }
        }

        const createdMembers: CreatedMemberCredential[] = Array.isArray(response?.created_members)
          ? response.created_members
          : [];

        const membersWithCredentials = createdMembers.filter((member) =>
          typeof member?.generated_email === "string" && member.generated_email.trim().length > 0
          && typeof member?.generated_password === "string" && member.generated_password.trim().length > 0
        );

        if (membersWithCredentials.length > 0) {
          setCreatedMembersForShare(membersWithCredentials);
          setAlreadyConfigured(true);
          Alert.alert(
            "Foyer créé",
            "Les comptes membres sont prêts. Tu peux maintenant envoyer les accès membre par membre.",
          );
          return;
        }

        Alert.alert("Félicitations", "Foyer créé et configuré avec succès !");
        router.replace("/(app)/(tabs)/home");
      }
    } catch (error: any) {
      Alert.alert("Erreur", error.message || "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }, [
    activeModules,
    authUser,
    budgetSettings,
    calendarSettings,
    createdMembersForShare.length,
    defaultServings,
    houseName,
    isEditMode,
    managedMembers,
    managedRoleDrafts,
    maxVotesPerUser,
    mealOptions,
    members,
    pollDay,
    pollDuration,
    pollTime,
    router,
    selectedMealDietaryTags,
    shouldUseSetupWizard,
    tasksSettings,
  ]);

  useEffect(() => {
    setMembersExpanded(!isEditMode);
  }, [isEditMode]);

  useEffect(() => {
    setModulesExpanded(!isEditMode || isModuleScope);
  }, [isEditMode, isModuleScope]);

  useEffect(() => {
    if (!tasksSettings.alternating_custody_enabled) {
      setCustodyDateWheelVisible(false);
      return;
    }

    setTasksSettings((prev) => {
      const normalized = normalizeCustodyWeekStartDate(prev.custody_home_week_start, prev.custody_change_day);
      if (normalized === prev.custody_home_week_start) {
        return prev;
      }
      return { ...prev, custody_home_week_start: normalized };
    });
  }, [tasksSettings.alternating_custody_enabled, tasksSettings.custody_change_day]);

  const openCustodyDateWheel = useCallback(() => {
    if (custodyDateWheelVisible) {
      setCustodyDateWheelVisible(false);
      return;
    }

    const normalizedDate = normalizeCustodyWeekStartDate(
      tasksSettings.custody_home_week_start,
      tasksSettings.custody_change_day
    );

    const sourceDate = parseIsoDate(normalizedDate);
    const year = sourceDate.getFullYear();
    const month = sourceDate.getMonth() + 1;
    const day = sourceDate.getDate();

    const yearIndex = Math.max(0, custodyYearOptions.indexOf(year));
    const monthIndex = Math.max(0, custodyMonthOptions.indexOf(month));
    const dayIndex = Math.max(0, day - 1);

    setCustodyDateWheelYear(year);
    setCustodyDateWheelMonth(month);
    setCustodyDateWheelDay(day);

    custodyDateYearIndexRef.current = yearIndex;
    custodyDateMonthIndexRef.current = monthIndex;
    custodyDateDayIndexRef.current = dayIndex;

    setCustodyDateWheelVisible(true);

    requestAnimationFrame(() => {
      custodyYearWheelRef.current?.scrollTo({ y: yearIndex * 40, animated: false });
      custodyMonthWheelRef.current?.scrollTo({ y: monthIndex * 40, animated: false });
      custodyDayWheelRef.current?.scrollTo({ y: dayIndex * 40, animated: false });
    });
  }, [
    custodyDateWheelVisible,
    custodyMonthOptions,
    custodyYearOptions,
    tasksSettings.custody_change_day,
    tasksSettings.custody_home_week_start,
  ]);

  useEffect(() => {
    const maxDay = custodyDayOptions.length;
    setCustodyDateWheelDay((prev) => clamp(prev, 1, maxDay));
  }, [custodyDayOptions.length]);

  useEffect(() => {
    if (!custodyDateWheelVisible) {
      return;
    }

    const maxDay = new Date(custodyDateWheelYear, custodyDateWheelMonth, 0).getDate();
    const normalizedDay = clamp(custodyDateWheelDay, 1, maxDay);
    if (normalizedDay !== custodyDateWheelDay) {
      setCustodyDateWheelDay(normalizedDay);
      return;
    }

    const rawSelectedDate = `${custodyDateWheelYear}-${pad2(custodyDateWheelMonth)}-${pad2(normalizedDay)}`;
    const selectedDate = new Date(custodyDateWheelYear, custodyDateWheelMonth - 1, normalizedDay);
    const selectedIsoWeekDay = selectedDate.getDay() === 0 ? 7 : selectedDate.getDay();
    const alignedWeekDate = normalizeCustodyWeekStartDate(rawSelectedDate, selectedIsoWeekDay);

    setTasksSettings((prev) => {
      if (
        prev.custody_change_day === selectedIsoWeekDay
        && prev.custody_home_week_start === alignedWeekDate
      ) {
        return prev;
      }

      return {
        ...prev,
        custody_change_day: selectedIsoWeekDay,
        custody_home_week_start: alignedWeekDate,
      };
    });
  }, [
    custodyDateWheelVisible,
    custodyDateWheelYear,
    custodyDateWheelMonth,
    custodyDateWheelDay,
  ]);

  useEffect(() => {
    if (!isEditMode || !canManageMembers || managedHouseholdId === null || managedHouseholdId <= 0) {
      return () => {};
    }

    let unsubscribeRealtime: (() => void) | null = null;

    const setupRealtime = async () => {
      unsubscribeRealtime = await subscribeToHouseholdRealtime(managedHouseholdId, (message) => {
        const module = String(message?.module ?? "");
        const type = String(message?.type ?? "");
        if (module !== "household") {
          return;
        }

        if (type === "member_invite_responded") {
          const status = String((message?.payload ?? {}).status ?? "");
          if (status !== "accepted") {
            return;
          }
          void loadManagedMembers();
          return;
        }

        if (
          !isMealsScope
          && !isTasksScope
          && !isBudgetScope
          && !isCalendarScope
          && (type === "connection_updated" || type === "connection_request_created")
        ) {
          void loadHouseholdConnection();
        }
      });
    };

    void setupRealtime();

    return () => {
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
      }
    };
  }, [
    canManageMembers,
    isBudgetScope,
    isCalendarScope,
    isEditMode,
    isMealsScope,
    isTasksScope,
    loadHouseholdConnection,
    loadManagedMembers,
    managedHouseholdId,
  ]);

  useEffect(() => {
    const loadSetupState = async () => {
      try {
        let hasHousehold = false;
        let activeRole: MemberRole = "enfant";

        if (authUser) {
          const user = authUser as StoredUser;
          hasHousehold = !!user.household_id || (Array.isArray(user.households) && user.households.length > 0);
          activeRole = resolveActiveHouseholdRole(user);
          setAlreadyConfigured(hasHousehold);
          setActiveUser({
            name: typeof user.name === "string" ? user.name : undefined,
            email: typeof user.email === "string" ? user.email : undefined,
          });
        }

        if (isEditMode) {
          if (!hasHousehold) {
            Alert.alert("Configuration", "Aucun foyer n'est configuré pour ce compte.");
            router.replace("/(app)/(tabs)/home");
            return;
          }

          if (activeRole !== "parent") {
            Alert.alert(
              "Accès restreint",
              "Seul un parent peut modifier la configuration du foyer. Utilise les paramètres utilisateur pour ton compte."
            );
            router.replace("/settings");
            return;
          }

          const response = await apiFetch("/households/config");
          const config = response?.config;
          const modules = config?.modules ?? {};
          const meals = modules.meals ?? {};
          const mealsOptions = meals.options ?? {};
          const mealsSettings = meals.settings ?? {};
          const tasks = modules.tasks ?? {};
          const tasksSettingsApi = tasks.settings ?? {};
          const calendar = modules.calendar ?? {};
          const budget = modules.budget ?? {};

          setHouseName(typeof config?.household_name === "string" ? config.household_name : "");
          setActiveModules({
            meals: !!meals.enabled,
            tasks: !!tasks.enabled,
            budget: !!budget.enabled,
            calendar: !!calendar.enabled,
          });

          setMealOptions({
            recipes: mealsOptions.recipes !== false,
            polls: mealsOptions.polls !== false,
            shopping_list: mealsOptions.shopping_list !== false,
          });

          setPollDay(Number.isInteger(mealsSettings.poll_day) ? mealsSettings.poll_day : 5);
          setPollTime(parseTimeToHHMM(mealsSettings.poll_time) ?? "10:00");
          setPollDuration(Number.isInteger(mealsSettings.poll_duration) ? mealsSettings.poll_duration : 24);
          setMaxVotesPerUser(String(Number.isInteger(mealsSettings.max_votes_per_user) ? mealsSettings.max_votes_per_user : 3));
          setDefaultServings(String(Number.isInteger(mealsSettings.default_servings) ? mealsSettings.default_servings : 4));

          setSelectedMealDietaryTags(
            Array.isArray(mealsSettings.dietary_tags)
              ? mealsSettings.dietary_tags
                  .map((tag: unknown) => String(tag ?? "").trim())
                  .filter((tag: string) => tag.length > 0)
              : []
          );

          if (Array.isArray(mealsSettings.dietary_tag_details)) {
            const detailsMap: Record<string, DietaryTagDetail> = {};
            mealsSettings.dietary_tag_details.forEach((tag: unknown) => {
              const key = String((tag as { key?: unknown })?.key ?? "").trim();
              if (!key) return;

              detailsMap[key] = {
                key,
                label: String((tag as { label?: unknown })?.label ?? key),
                type: normalizeDietaryType((tag as { type?: unknown })?.type),
              };
            });
            setSelectedMealDietaryTagDetails(detailsMap);
          }

          if (isMealsScope) {
            await loadDietaryTags("diet");
          }

          const parsedCustodyChangeDay =
            Number.isInteger(tasksSettingsApi.custody_change_day) && tasksSettingsApi.custody_change_day >= 1 && tasksSettingsApi.custody_change_day <= 7
              ? tasksSettingsApi.custody_change_day
              : 5;

          const parsedCustodyWeekStartRaw =
            typeof tasksSettingsApi.custody_home_week_start === "string"
              ? tasksSettingsApi.custody_home_week_start
              : toIsoDate(new Date());

          setTasksSettings({
            reminders_enabled: tasksSettingsApi.reminders_enabled !== false,
            alternating_custody_enabled: tasksSettingsApi.alternating_custody_enabled === true,
            custody_change_day: parsedCustodyChangeDay,
            custody_home_week_start: normalizeCustodyWeekStartDate(
              parsedCustodyWeekStartRaw,
              parsedCustodyChangeDay
            ),
          });

          setCalendarSettings({
            shared_view_enabled: calendar?.settings?.shared_view_enabled !== false,
            absence_tracking_enabled: calendar?.settings?.absence_tracking_enabled !== false,
          });

          setBudgetSettings({
            currency: typeof budget?.settings?.currency === "string" ? budget.settings.currency : "EUR",
            notes: typeof budget?.settings?.notes === "string" ? budget.settings.notes : "",
          });

          if (!isModuleScope) {
            await loadManagedMembers();
          }

          if (!isMealsScope && !isTasksScope && !isBudgetScope && !isCalendarScope) {
            await loadHouseholdConnection();
          }
        } else {
          setConnectionState(INITIAL_HOUSEHOLD_CONNECTION);
          setConnectionPermissions(INITIAL_HOUSEHOLD_CONNECTION_PERMISSIONS);
        }
      } catch (error: any) {
        if (isEditMode && Number(error?.status) === 403) {
          Alert.alert(
            "Accès restreint",
            "Seul un parent peut modifier la configuration du foyer. Utilise les paramètres utilisateur pour ton compte."
          );
          router.replace("/settings");
          return;
        }

        console.error("Erreur lecture user:", error);
      } finally {
        setInitialLoading(false);
      }
    };

    void loadSetupState();
  }, [
    authUser,
    isBudgetScope,
    isCalendarScope,
    isEditMode,
    isMealsScope,
    isModuleScope,
    isTasksScope,
    loadDietaryTags,
    loadHouseholdConnection,
    loadManagedMembers,
    router,
  ]);

  useEffect(() => {
    void loadBudgetChildDrafts();
  }, [loadBudgetChildDrafts]);

  const normalizedSearch = dietaryTagSearch.trim().toLowerCase();

  const filteredDietaryTags = useMemo(() => {
    return availableDietaryTags.filter((tag) => {
      if (!normalizedSearch) {
        return true;
      }
      return (
        tag.label.toLowerCase().includes(normalizedSearch) ||
        tag.key.toLowerCase().includes(normalizedSearch) ||
        DIETARY_TYPE_LABELS[tag.type].toLowerCase().includes(normalizedSearch)
      );
    });
  }, [availableDietaryTags, normalizedSearch]);

  const selectedTagsForCurrentType = useMemo(() => {
    return selectedMealDietaryTags
      .map((key) => selectedMealDietaryTagDetails[key])
      .filter((tag): tag is DietaryTagDetail => !!tag && tag.type === selectedDietaryTypeFilter);
  }, [selectedMealDietaryTagDetails, selectedMealDietaryTags, selectedDietaryTypeFilter]);

  const canSuggestCreateDietaryTag = useMemo(() => {
    return normalizedSearch.length >= 2
      && !availableDietaryTags.some((tag) =>
        tag.label.toLowerCase() === normalizedSearch || tag.key.toLowerCase() === normalizedSearch
      );
  }, [availableDietaryTags, normalizedSearch]);

  const sortedDraftMembers = useMemo(
    () =>
      members
        .map((member, index) => ({ member, index }))
        .sort((a, b) => compareMembersByRoleThenName(a.member, b.member)),
    [members]
  );

  const orderedManagedMembers = useMemo(() => {
    const activeEmail = normalizeMemberIdentity(activeUser?.email);
    const activeName = normalizeMemberIdentity(activeUser?.name);

    let detectedActiveMember: ManagedHouseholdMember | null = null;
    const remainingMembers: ManagedHouseholdMember[] = [];

    managedMembers.forEach((member) => {
      const memberEmail = normalizeMemberIdentity(member.email);
      const memberName = normalizeMemberIdentity(member.name);
      const matchesActiveMember =
        (activeEmail.length > 0 && memberEmail.length > 0 && memberEmail === activeEmail)
        || (activeName.length > 0 && memberName === activeName);

      if (!detectedActiveMember && matchesActiveMember) {
        detectedActiveMember = member;
        return;
      }

      remainingMembers.push(member);
    });

    remainingMembers.sort(compareMembersByRoleThenName);

    return detectedActiveMember ? [detectedActiveMember, ...remainingMembers] : remainingMembers;
  }, [activeUser?.email, activeUser?.name, managedMembers]);

  const connectionCodeExpiryLabel = useMemo(() => {
    const isoDate = connectionState.active_code?.expires_at;
    if (!isoDate) {
      return "";
    }

    const parsedDate = new Date(isoDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return "";
    }

    return parsedDate.toLocaleString("fr-BE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [connectionState.active_code?.expires_at]);

  const nameStepIndex = Math.max(1, setupFlow.steps.indexOf("name") + 1);
  const modulesStepIndex = Math.max(1, setupFlow.steps.indexOf("modules") + 1);
  const childrenStepIndex = Math.max(1, setupFlow.steps.indexOf("children") + 1);

  return {
    theme,
    constants: {
      DAYS,
      DURATION_CHOICES,
      MONTH_LABELS,
      DIETARY_TYPE_LABELS,
    },
    ui: {
      isEditMode,
      isCreateMode,
      isMealsScope,
      isTasksScope,
      isBudgetScope,
      isCalendarScope,
      isModuleScope,
      showScopedModuleDetails,
      scopedBackRoute,
      headerTitle,
      householdEditHeaderOffset,
      initialLoading,
      loading,
      alreadyConfigured,
      canManageMembers,
    },
    wizard: {
      setupFlow,
      shouldUseSetupWizard,
      isNameStepActive,
      isModulesStepActive,
      isChildrenStepActive,
      nameStepIndex,
      modulesStepIndex,
      childrenStepIndex,
      goToNextSetupStep,
      goToPreviousSetupStep,
    },
    form: {
      houseName,
      setHouseName,
      activeModules,
      expandedModules,
      mealOptions,
      pollDay,
      setPollDay,
      pollTime,
      setPollTime,
      pollDuration,
      setPollDuration,
      maxVotesPerUser,
      setMaxVotesPerUser,
      defaultServings,
      setDefaultServings,
      tasksSettings,
      setTasksSettings,
      calendarSettings,
      setCalendarSettings,
      budgetSettings,
      memberName,
      setMemberName,
      memberEmail,
      setMemberEmail,
      memberRole,
      setMemberRole,
      membersExpanded,
      setMembersExpanded,
      modulesExpanded,
      setModulesExpanded,
      connectedHouseholdExpanded,
      setConnectedHouseholdExpanded,
      connectionCodeInput,
      setConnectionCodeInput,
      dietaryTagSearch,
      setDietaryTagSearch,
      selectedDietaryTypeFilter,
      setSelectedDietaryTypeFilter,
    },
    data: {
      visibleModules,
      members,
      managedMembers,
      managedRoleDrafts,
      createdMembersForShare,
      selectedMealDietaryTags,
      selectedMealDietaryTagDetails,
      availableDietaryTags,
      mealExpandedSections,
      budgetChildDrafts,
      connectionState,
      connectionPermissions,
      activeUser,
      orderedManagedMembers,
      sortedDraftMembers,
      filteredDietaryTags,
      selectedTagsForCurrentType,
      canSuggestCreateDietaryTag,
      connectionCodeExpiryLabel,
      custodyDateWheelVisible,
      custodyDateWheelYear,
      custodyDateWheelMonth,
      custodyDateWheelDay,
      custodyYearOptions,
      custodyMonthOptions,
      custodyDayOptions,
    },
    asyncState: {
      dietaryTagsLoading,
      creatingDietaryTag,
      membersLoading,
      addingManagedMember,
      updatingManagedMemberId,
      deletingManagedMemberId,
      sendingMemberKey,
      budgetSettingsLoading,
      budgetSettingsError,
      savingBudgetChildId,
      connectionLoading,
      connectionActionLoading,
    },
    refs: {
      custodyDayWheelRef,
      custodyMonthWheelRef,
      custodyYearWheelRef,
      custodyDateDayIndexRef,
      custodyDateMonthIndexRef,
      custodyDateYearIndexRef,
    },
    helpers: {
      wheelIndexFromOffset,
      weekDayShortLabel,
      pad2,
    },
    actions: {
      goBack,
      handleSave,
      toggleModule,
      toggleModulePanel,
      toggleMealSection,
      updateMealOption,
      toggleMealDietaryTag,
      createDietaryTag,
      loadDietaryTags,
      openCustodyDateWheel,
      updateBudgetChildDraft,
      saveBudgetChildDraft,
      addMember,
      removeMember,
      toggleDraftMemberRoleAtIndex,
      onAddManagedMember,
      confirmManagedMemberRoleToggle,
      onDeleteManagedMember,
      onShareManagedMemberAccess,
      onShareHouseholdConnectionCode,
      onConnectHouseholdWithCode,
      onUnlinkConnectedHousehold,
      shareMemberCredentials,
    },
  };
}
