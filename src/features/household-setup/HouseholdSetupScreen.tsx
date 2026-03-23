import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    Switch,
    ScrollView,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Share,
    useColorScheme,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/theme";
import { AppButton } from "@/src/components/ui/AppButton";
import { AppTextInput } from "@/src/components/ui/AppTextInput";
import { apiFetch } from "@/src/api/client";
import { StepChildren } from "@/src/features/household-setup/components/StepChildren";
import { StepModules } from "@/src/features/household-setup/components/StepModules";
import { StepName } from "@/src/features/household-setup/components/StepName";
import { useHouseholdSetupFlow } from "@/src/features/household-setup/hooks/useHouseholdSetupFlow";
import { subscribeToHouseholdRealtime } from "@/src/realtime/client";
import { persistStoredUser, useStoredUserState, type StoredUser } from "@/src/session/user-cache";

type ModuleKey = "meals" | "tasks" | "budget" | "calendar";
type MemberRole = "parent" | "enfant";

type HouseholdMember = {
    name: string;
    role: MemberRole;
    email?: string;
};

type ManagedHouseholdMember = {
    id: number;
    name: string;
    email: string;
    role: MemberRole;
    must_change_password: boolean;
};

type CreatedMemberCredential = {
    id?: number;
    name?: string;
    generated_email?: string;
    generated_password?: string;
    share_text?: string;
};

type TaskSettingsInput = {
    reminders_enabled: boolean;
    alternating_custody_enabled: boolean;
    custody_change_day: number;
    custody_home_week_start: string;
};

type BudgetRecurrence = "weekly" | "monthly";
type BudgetChildSettingDraft = {
    childId: number;
    childName: string;
    baseAmountInput: string;
    recurrence: BudgetRecurrence;
    resetDayInput: string;
    allowAdvances: boolean;
    maxAdvanceInput: string;
};

type DietaryTagOption = {
    id: number;
    type: "diet" | "allergen" | "dislike" | "restriction" | "cuisine_rule";
    key: string;
    label: string;
    is_system: boolean;
};
type DietaryTagDetail = {
    key: string;
    label: string;
    type: DietaryTagOption["type"];
};

type HouseholdConnectionPendingRequest = {
    id: number;
    direction: "incoming" | "outgoing";
    status: "pending" | "accepted" | "refused";
    created_at: string | null;
    other_household: {
        id: number;
        name: string;
    } | null;
};

type HouseholdConnectionState = {
    is_connected: boolean;
    linked_household: {
        id: number;
        name: string;
    } | null;
    pending_request: HouseholdConnectionPendingRequest | null;
    active_code: {
        code: string;
        expires_at: string | null;
        share_text: string;
    } | null;
};

type HouseholdConnectionPermissions = {
    can_manage_connection: boolean;
    can_generate_code: boolean;
    can_connect_with_code: boolean;
    can_unlink: boolean;
};

const INITIAL_HOUSEHOLD_CONNECTION: HouseholdConnectionState = {
    is_connected: false,
    linked_household: null,
    pending_request: null,
    active_code: null,
};

const INITIAL_HOUSEHOLD_CONNECTION_PERMISSIONS: HouseholdConnectionPermissions = {
    can_manage_connection: false,
    can_generate_code: false,
    can_connect_with_code: false,
    can_unlink: false,
};

const normalizeMemberRole = (value: unknown): MemberRole => {
    return String(value ?? "").trim() === "parent" ? "parent" : "enfant";
};
const compareMembersByRoleThenName = <T extends { role: MemberRole; name: string }>(a: T, b: T): number => {
    if (a.role !== b.role) {
        return a.role === "parent" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
};
const normalizeMemberIdentity = (value?: string): string => {
    return String(value ?? "").trim().toLocaleLowerCase("fr");
};
const toggleMemberRole = (role: MemberRole): MemberRole => (role === "parent" ? "enfant" : "parent");

const MODULES: { id: ModuleKey; label: string; desc: string; icon: string }[] = [
    { id: "meals", label: "Repas & Courses", desc: "Menus et liste partagée.", icon: "food-apple-outline" },
    { id: "tasks", label: "Tâches Ménagères", desc: "Suivi des corvées.", icon: "broom" },
    { id: "budget", label: "Budget & Argent", desc: "Argent de poche par enfant.", icon: "piggy-bank-outline" },
    { id: "calendar", label: "Agenda Familial", desc: "Planning partagé.", icon: "calendar-clock" },
];

const DAYS = [
    { label: "Lun", value: 1 },
    { label: "Mar", value: 2 },
    { label: "Mer", value: 3 },
    { label: "Jeu", value: 4 },
    { label: "Ven", value: 5 },
    { label: "Sam", value: 6 },
    { label: "Dim", value: 7 },
];

const DURATION_CHOICES = [12, 24, 48];
const MONTH_LABELS = ["jan", "fév", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "dec"];
const WEEK_DAY_SHORT = ["di", "lu", "ma", "me", "je", "ve", "sa"] as const;
const WHEEL_ITEM_HEIGHT = 40;
const WHEEL_VISIBLE_ROWS = 5;
const WHEEL_CONTAINER_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS;
const WHEEL_VERTICAL_PADDING = (WHEEL_CONTAINER_HEIGHT - WHEEL_ITEM_HEIGHT) / 2;
const DIETARY_TYPE_LABELS: Record<DietaryTagOption["type"], string> = {
    diet: "Régimes",
    allergen: "Allergènes",
    dislike: "À éviter",
    restriction: "Restrictions",
    cuisine_rule: "Cuisine",
};
const ALLOWED_DIETARY_TYPES: DietaryTagOption["type"][] = ["diet", "allergen", "dislike", "restriction", "cuisine_rule"];
const DIETARY_TYPE_ORDER: DietaryTagOption["type"][] = ["diet", "allergen", "restriction", "dislike", "cuisine_rule"];

const normalizeDietaryType = (value: unknown): DietaryTagOption["type"] => {
    const rawType = String(value ?? "");
    return ALLOWED_DIETARY_TYPES.includes(rawType as DietaryTagOption["type"])
        ? (rawType as DietaryTagOption["type"])
        : "restriction";
};

const sortDietaryTags = (tags: DietaryTagOption[]): DietaryTagOption[] => {
    return [...tags].sort((a, b) => {
        const typeIndexDiff = DIETARY_TYPE_ORDER.indexOf(a.type) - DIETARY_TYPE_ORDER.indexOf(b.type);
        if (typeIndexDiff !== 0) {
            return typeIndexDiff;
        }
        return a.label.localeCompare(b.label, "fr", { sensitivity: "base" });
    });
};

const parseTimeToHHMM = (value: unknown): string | null => {
    if (typeof value !== "string") {
        return null;
    }

    const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) {
        return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return null;
    }

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};
const parseDecimalInput = (value: string): number | null => {
    const normalized = value.replace(",", ".").trim();
    if (normalized === "") {
        return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};
const pad2 = (value: number): string => String(value).padStart(2, "0");
const toIsoDate = (date: Date): string => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const parseIsoDate = (value: string): Date => new Date(`${value}T00:00:00`);
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const wheelIndexFromOffset = (offsetY: number, size: number): number =>
    clamp(Math.round(offsetY / WHEEL_ITEM_HEIGHT), 0, Math.max(0, size - 1));
const weekDayShortLabel = (year: number, month: number, day: number): string => {
    const date = new Date(year, month - 1, day);
    return WEEK_DAY_SHORT[date.getDay()] ?? "";
};
const startOfCustomWeek = (date: Date, startDayIso: number): Date => {
    const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const jsStartDay = startDayIso % 7;
    const delta = (normalized.getDay() - jsStartDay + 7) % 7;
    normalized.setDate(normalized.getDate() - delta);
    return normalized;
};
const normalizeCustodyWeekStartDate = (isoDate: string, changeDay: number): string => {
    const safeDay = Number.isInteger(changeDay) && changeDay >= 1 && changeDay <= 7 ? changeDay : 5;
    const source = isValidIsoDate(isoDate) ? parseIsoDate(isoDate) : new Date();
    return toIsoDate(startOfCustomWeek(source, safeDay));
};
const isValidIsoDate = (value: string): boolean => {
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

const buildMemberShareText = (member: CreatedMemberCredential): string => {
    const name = String(member.name ?? "Membre").trim() || "Membre";
    const email = String(member.generated_email ?? "").trim();
    const password = String(member.generated_password ?? "").trim();

    if (member.share_text && String(member.share_text).trim().length > 0) {
        return String(member.share_text).trim();
    }

    return `Bonjour ${name} !\n\n`
        + "Ton compte FamilyFlow est prêt.\n"
        + `Email : ${email}\n`
        + `Mot de passe temporaire : ${password}\n\n`
        + "Connecte-toi puis modifie ton mot de passe dès la première connexion.";
};
const buildHouseholdConnectionShareText = (
    householdName: string,
    code: string,
    customText?: string
): string => {
    const normalizedCustomText = String(customText ?? "").trim();
    if (normalizedCustomText.length > 0) {
        return normalizedCustomText;
    }

    return `Invitation de liaison FamilyFlow\n\n`
        + `Foyer : ${householdName}\n`
        + `Code de liaison : ${code}\n\n`
        + "Ouvre FamilyFlow > Modifier le foyer > Foyer connecté, puis encode ce code.";
};

const resolveActiveHouseholdRole = (rawUser: unknown): MemberRole => {
    const user = (rawUser ?? {}) as {
        household_id?: unknown;
        role?: unknown;
        households?: {
            id?: unknown;
            role?: unknown;
            pivot?: { role?: unknown } | null;
        }[];
    };
    const households = Array.isArray(user.households) ? user.households : [];
    const parsedHouseholdId = Number(user.household_id ?? 0);
    const activeHouseholdId = Number.isFinite(parsedHouseholdId) && parsedHouseholdId > 0
        ? Math.trunc(parsedHouseholdId)
        : null;
    const activeHousehold = activeHouseholdId
        ? households.find((household) => Number(household?.id ?? 0) === activeHouseholdId)
        : households[0];

    return normalizeMemberRole(activeHousehold?.pivot?.role ?? activeHousehold?.role ?? user.role);
};

export default function SetupHousehold() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams<{ mode?: string; scope?: string }>();
    const isEditMode = params.mode === "edit";
    const isCreateMode = params.mode === "create";
    const isMealsScope = params.scope === "meals";
    const isTasksScope = params.scope === "tasks";
    const isBudgetScope = params.scope === "budget";
    const isCalendarScope = params.scope === "calendar";
    const isModuleScope = isMealsScope || isTasksScope || isBudgetScope || isCalendarScope;
    const showScopedModuleDetails = isEditMode && isModuleScope;
    const scopedBackRoute = isMealsScope
        ? "/(tabs)/meal"
        : isTasksScope
            ? "/(tabs)/tasks"
            : isBudgetScope
                ? "/(tabs)/budget"
                : isCalendarScope
                    ? "/(tabs)/calendar"
                    : null;
    const householdEditHeaderOffset = isEditMode && !isMealsScope && !isTasksScope && !isBudgetScope && !isCalendarScope
        ? 6
        : 0;
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];
    const memberItemBackground = `${theme.tint}${colorScheme === "dark" ? "20" : "12"}`;
    const { user: authUser } = useStoredUserState();
    const shouldUseSetupWizard = isCreateMode && !isModuleScope;
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
    const [pollDuration, setPollDuration] = useState(24);
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
    const visibleModules = isMealsScope
        ? MODULES.filter((module) => module.id === "meals")
        : isTasksScope
            ? MODULES.filter((module) => module.id === "tasks")
            : isBudgetScope
                ? MODULES.filter((module) => module.id === "budget")
            : isCalendarScope
                ? MODULES.filter((module) => module.id === "calendar")
            : MODULES;

    const toggleModule = (id: ModuleKey) => {
        setActiveModules((prev) => {
            const nextValue = !prev[id];
            setExpandedModules((expandedPrev) => ({ ...expandedPrev, [id]: nextValue ? expandedPrev[id] : false }));
            return { ...prev, [id]: nextValue };
        });
    };

    const toggleModulePanel = (id: ModuleKey) => {
        if (!activeModules[id]) {
            return;
        }
        setExpandedModules((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const toggleMealSection = (section: "recipes" | "polls") => {
        setMealExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
    };

    useEffect(() => {
        setMembersExpanded(!isEditMode);
    }, [isEditMode]);

    useEffect(() => {
        setModulesExpanded(!isEditMode || isModuleScope);
    }, [isEditMode, isModuleScope]);

    const updateMealOption = (option: "recipes" | "polls" | "shopping_list", value: boolean) => {
        setMealOptions((prev) => ({ ...prev, [option]: value }));
        if (!value && (option === "recipes" || option === "polls")) {
            setMealExpandedSections((prev) => ({ ...prev, [option]: false }));
        }
    };
    const updateBudgetChildDraft = useCallback((childId: number, patch: Partial<BudgetChildSettingDraft>) => {
        setBudgetChildDrafts((prev) => prev.map((draft) => (
            draft.childId === childId
                ? { ...draft, ...patch }
                : draft
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
                    const resetDayDefault = recurrence === "monthly" ? 1 : 1;
                    const resetDayRaw = Number(raw.setting?.reset_day ?? resetDayDefault);

                    return {
                        childId: Math.trunc(childId),
                        childName: String(raw.child?.name ?? "Enfant").trim() || "Enfant",
                        baseAmountInput: String(raw.setting?.base_amount ?? 0),
                        recurrence,
                        resetDayInput: String(Number.isFinite(resetDayRaw) && resetDayRaw > 0 ? Math.trunc(resetDayRaw) : resetDayDefault),
                        allowAdvances: Boolean(raw.setting?.allow_advances ?? false),
                        maxAdvanceInput: String(raw.setting?.max_advance_amount ?? 0),
                    };
                })
                .filter((draft: BudgetChildSettingDraft | null) => draft !== null) as BudgetChildSettingDraft[];

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

    const openCustodyDateWheel = () => {
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
            custodyYearWheelRef.current?.scrollTo({ y: yearIndex * WHEEL_ITEM_HEIGHT, animated: false });
            custodyMonthWheelRef.current?.scrollTo({ y: monthIndex * WHEEL_ITEM_HEIGHT, animated: false });
            custodyDayWheelRef.current?.scrollTo({ y: dayIndex * WHEEL_ITEM_HEIGHT, animated: false });
        });
    };

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

    const toggleMealDietaryTag = (tagKey: string) => {
        setSelectedMealDietaryTags((prev) =>
            prev.includes(tagKey)
                ? prev.filter((existingTag) => existingTag !== tagKey)
                : [...prev, tagKey]
        );
    };

    const createDietaryTag = async () => {
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
    };

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

    useEffect(() => {
        if (!isEditMode || !canManageMembers || managedHouseholdId === null || managedHouseholdId <= 0) {
            return () => { };
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

    const updateManagedRoleDraft = (memberId: number, role: MemberRole) => {
        setManagedRoleDrafts((prev) => ({
            ...prev,
            [memberId]: role,
        }));
    };
    const toggleDraftMemberRoleAtIndex = (memberIndex: number) => {
        setMembers((prev) => prev.map((member, index) => (
            index === memberIndex
                ? { ...member, role: toggleMemberRole(member.role) }
                : member
        )));
    };

    const shareManagedCredential = async (credential: CreatedMemberCredential, key: string) => {
        setSendingMemberKey(key);
        try {
            await Share.share({
                message: buildMemberShareText(credential),
            });
        } catch (shareError) {
            console.error("Erreur de partage des accès membre:", shareError);
            Alert.alert("Partage", "Impossible d'ouvrir le partage pour ce membre.");
        } finally {
            setSendingMemberKey(null);
        }
    };

    const onAddManagedMember = async () => {
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
    };

    const onUpdateManagedMemberRole = async (member: ManagedHouseholdMember, forcedRole?: MemberRole) => {
        const nextRole = forcedRole ?? managedRoleDrafts[member.id] ?? member.role;

        setUpdatingManagedMemberId(member.id);
        try {
            await apiFetch(`/household/members/${member.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    role: nextRole,
                }),
            });

            await loadManagedMembers();
            Alert.alert("Membres", "Rôle mis à jour.");
        } catch (error: any) {
            Alert.alert("Erreur", error?.message || "Impossible de mettre à jour ce membre.");
        } finally {
            setUpdatingManagedMemberId(null);
        }
    };
    const confirmManagedMemberRoleToggle = (member: ManagedHouseholdMember) => {
        const currentRole = managedRoleDrafts[member.id] ?? member.role;
        const nextRole = toggleMemberRole(currentRole);

        Alert.alert(
            `${member.name}`,
            `Modifier le rôle ?`,
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
    };

    const onDeleteManagedMember = (member: ManagedHouseholdMember) => {
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
    };

    const onShareManagedMemberAccess = async (member: ManagedHouseholdMember) => {
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
    };

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
                        router.replace("/(tabs)/home");
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
                    const tasksSettings = tasks.settings ?? {};
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
                    setMaxVotesPerUser(String(
                        Number.isInteger(mealsSettings.max_votes_per_user)
                            ? mealsSettings.max_votes_per_user
                            : 3
                    ));
                    setDefaultServings(String(
                        Number.isInteger(mealsSettings.default_servings)
                            ? mealsSettings.default_servings
                            : 4
                    ));
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
                            if (!key) {
                                return;
                            }
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
                        Number.isInteger(tasksSettings.custody_change_day) && tasksSettings.custody_change_day >= 1 && tasksSettings.custody_change_day <= 7
                            ? tasksSettings.custody_change_day
                            : 5;
                    const parsedCustodyWeekStartRaw =
                        typeof tasksSettings.custody_home_week_start === "string"
                            ? tasksSettings.custody_home_week_start
                            : toIsoDate(new Date());
                    setTasksSettings({
                        reminders_enabled: tasksSettings.reminders_enabled !== false,
                        alternating_custody_enabled: tasksSettings.alternating_custody_enabled === true,
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
                    await loadManagedMembers();
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

        loadSetupState();
    }, [
        isBudgetScope,
        isCalendarScope,
        isEditMode,
        isMealsScope,
        isTasksScope,
        loadDietaryTags,
        loadHouseholdConnection,
        loadManagedMembers,
        router,
        authUser,
    ]);

    useEffect(() => {
        void loadBudgetChildDrafts();
    }, [loadBudgetChildDrafts]);

    const addMember = () => {
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
    };

    const shareMemberCredentials = async (member: CreatedMemberCredential, key: string) => {
        setSendingMemberKey(key);
        try {
            await Share.share({
                message: buildMemberShareText(member),
            });
        } catch (shareError) {
            console.error("Erreur de partage d'accès membre:", shareError);
            Alert.alert("Partage", "Impossible d'ouvrir le partage pour ce membre.");
        } finally {
            setSendingMemberKey(null);
        }
    };

    const removeMember = (index: number) => {
        setMembers((prev) => prev.filter((_, i) => i !== index));
    };

    const onShareHouseholdConnectionCode = async () => {
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

            await Share.share({
                message: shareText,
            });

            await loadHouseholdConnection();
        } catch (error: any) {
            Alert.alert("Foyer connecté", error?.message || "Impossible de partager un code de liaison.");
        } finally {
            setConnectionActionLoading(null);
        }
    };

    const onConnectHouseholdWithCode = async () => {
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
    };

    const onUnlinkConnectedHousehold = () => {
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
    };

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

    const handleSave = async () => {
        if (!isEditMode && createdMembersForShare.length > 0) {
            router.replace("/(tabs)/home");
            return;
        }

        if (!houseName.trim()) {
            Alert.alert("Oups", "Le nom du foyer est obligatoire.");
            return;
        }

        if (!isEditMode && activeModules.budget) {
            const childCount = members.filter((m) => m.role === "enfant").length;
            if (childCount === 0) {
                Alert.alert("Budget", "Active: ajoute au moins un membre enfant.");
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

                        const budget = {
                            base_amount: 0,
                            recurrence: "weekly" as const,
                            reset_day: 1,
                            allow_advances: false,
                            max_advance_amount: 0,
                        };

                        return {
                            ...member,
                            budget,
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
                        console.error("Erreur rafraichissement profil apres creation foyer:", refreshError);
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
                router.replace("/(tabs)/home");
            }
        } catch (error: any) {
            Alert.alert("Erreur", error.message || "Une erreur est survenue");
        } finally {
            setLoading(false);
        }
    };

    const normalizedSearch = dietaryTagSearch.trim().toLowerCase();
    const filteredDietaryTags = availableDietaryTags.filter((tag) => {
        if (!normalizedSearch) {
            return true;
        }
        return (
            tag.label.toLowerCase().includes(normalizedSearch) ||
            tag.key.toLowerCase().includes(normalizedSearch) ||
            DIETARY_TYPE_LABELS[tag.type].toLowerCase().includes(normalizedSearch)
        );
    });
    const selectedTagsForCurrentType = selectedMealDietaryTags
        .map((key) => selectedMealDietaryTagDetails[key])
        .filter((tag): tag is DietaryTagDetail => !!tag && tag.type === selectedDietaryTypeFilter);
    const canSuggestCreateDietaryTag =
        normalizedSearch.length >= 2 &&
        !availableDietaryTags.some((tag) => tag.label.toLowerCase() === normalizedSearch || tag.key.toLowerCase() === normalizedSearch);
    const sortedDraftMembers = useMemo(
        () => members
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

    if (initialLoading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={theme.tint} />
            </View>
        );
    }

    if (alreadyConfigured && !isEditMode && !isCreateMode && createdMembersForShare.length === 0) {
        return (
            <View style={[styles.centerContainer, { backgroundColor: theme.background, padding: 24 }]}> 
                <View style={[styles.lockCard, { backgroundColor: theme.card }]}> 
                    <MaterialCommunityIcons name="home" size={42} color={theme.tint} />
                    <Text style={[styles.lockTitle, { color: theme.text }]}>Foyer déjà configuré</Text>
                    <Text style={[styles.lockText, { color: theme.textSecondary }]}>La configuration initiale est terminée.</Text>
                    <AppButton
                        onPress={() => router.replace("/(tabs)/home")}
                        style={[styles.submitButton, { backgroundColor: theme.tint, marginTop: 16 }]}
                    >
                        <Text style={styles.submitButtonText}>Retour à l&apos;accueil</Text>
                    </AppButton>
                </View>
            </View>
        );
    }

    if (!isEditMode && createdMembersForShare.length > 0) {
        return (
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={{ flex: 1, backgroundColor: theme.background }}
            >
                <View
                    style={[
                        styles.headerBar,
                        {
                            borderBottomColor: theme.icon,
                            paddingTop: Math.max(insets.top, 12),
                        },
                    ]}
                >
                    <AppButton
                        onPress={() => router.replace("/(tabs)/home")}
                        style={[styles.headerActionBtn, { borderColor: theme.icon }]}
                    >
                        <MaterialCommunityIcons name="close" size={20} color={theme.tint} />
                    </AppButton>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>Comptes créés</Text>
                </View>

                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Envoyer les accès</Text>
                        <Text style={[styles.memberMeta, { color: theme.textSecondary, marginBottom: 10 }]}>
                            Envoie les identifiants temporaires à chaque membre.
                        </Text>

                        <View style={{ gap: 8 }}>
                            {createdMembersForShare.map((member, index) => {
                                const memberKey = typeof member.id === "number"
                                    ? `member-${member.id}`
                                    : `member-${index}-${member.generated_email ?? member.name ?? "unknown"}`;
                                const isSending = sendingMemberKey === memberKey;

                                return (
                                    <View key={memberKey} style={[styles.memberCard, { backgroundColor: theme.card }]}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.memberName, { color: theme.text }]}>
                                                {member.name || "Membre"}
                                            </Text>
                                            <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                                                {member.generated_email || "Email généré"}
                                            </Text>
                                        </View>

                                        <AppButton
                                            onPress={() => shareMemberCredentials(member, memberKey)}
                                            style={[styles.sendCredentialBtn, { backgroundColor: theme.tint }]}
                                            disabled={isSending}
                                        >
                                            {isSending ? (
                                                <ActivityIndicator color="white" size="small" />
                                            ) : (
                                                <>
                                                    <MaterialCommunityIcons name="send" size={16} color="white" />
                                                    <Text style={styles.sendCredentialBtnText}>Envoyer</Text>
                                                </>
                                            )}
                                        </AppButton>
                                    </View>
                                );
                            })}
                        </View>
                    </View>

                    <AppButton
                        style={[styles.submitButton, { backgroundColor: theme.tint, opacity: loading ? 0.7 : 1 }]}
                        onPress={handleSave}
                        disabled={loading}
                    >
                        <Text style={styles.submitButtonText}>Terminer</Text>
                    </AppButton>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </KeyboardAvoidingView>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1, backgroundColor: theme.background }}
        >
            <View
                style={[
                    styles.headerBar,
                    {
                        borderBottomColor: theme.icon,
                        paddingTop: Math.max(insets.top, 12) + householdEditHeaderOffset,
                    },
                ]}
            >
                <AppButton
                    onPress={() => {
                        if (scopedBackRoute) {
                            router.replace(scopedBackRoute);
                            return;
                        }
                        router.back();
                    }}
                    style={[styles.headerActionBtn, { borderColor: theme.icon }]}
                >
                    <MaterialCommunityIcons name="arrow-left" size={20} color={theme.tint} />
                </AppButton>
                <Text style={[styles.headerTitle, { color: theme.text }]}>
                    {isMealsScope
                        ? "Paramètres repas"
                        : isTasksScope
                            ? "Paramètres tâches"
                            : isBudgetScope
                                ? "Paramètres budget"
                            : isCalendarScope
                                ? "Paramètres calendrier"
                        : (isEditMode ? "Modifier le foyer" : "Nouveau Foyer")}
                </Text>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
                {!isModuleScope && isNameStepActive && (
                    shouldUseSetupWizard ? (
                        <StepName
                            stepIndex={nameStepIndex}
                            totalSteps={setupFlow.totalSteps}
                            footer={(
                                <View style={styles.wizardActionsRow}>
                                    <AppButton
                                        style={[styles.wizardPrimaryBtn, { backgroundColor: theme.tint }]}
                                        onPress={goToNextSetupStep}
                                    >
                                        <Text style={styles.wizardPrimaryBtnText}>Continuer</Text>
                                    </AppButton>
                                </View>
                            )}
                        >
                            <View style={styles.section}>
                                <View style={[styles.collapsibleSectionCard, { backgroundColor: theme.card, borderColor: theme.icon }]}>
                                    <View style={styles.collapsibleSectionHeader}>
                                        <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Nom du foyer</Text>
                                    </View>
                                    <View style={styles.collapsibleSectionBody}>
                                        <AppTextInput
                                            style={[styles.input, styles.inputNoMargin]}
                                            value={houseName}
                                            onChangeText={setHouseName}
                                            placeholder="Ex: La Tribu"
                                            placeholderTextColor={theme.textSecondary}
                                        />
                                    </View>
                                </View>
                            </View>
                        </StepName>
                    ) : (
                        <View style={styles.section}>
                            <View style={[styles.collapsibleSectionCard, { backgroundColor: theme.card, borderColor: theme.icon }]}>
                                <View style={styles.collapsibleSectionHeader}>
                                    <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Nom du foyer</Text>
                                </View>
                                <View style={styles.collapsibleSectionBody}>
                                    <AppTextInput
                                        style={[styles.input, styles.inputNoMargin]}
                                        value={houseName}
                                        onChangeText={setHouseName}
                                        placeholder="Ex: La Tribu"
                                        placeholderTextColor={theme.textSecondary}
                                    />
                                </View>
                            </View>
                        </View>
                    )
                )}

                {!isModuleScope && isChildrenStepActive && (
                    <>
                    {shouldUseSetupWizard ? (
                        <StepChildren
                            stepIndex={childrenStepIndex}
                            totalSteps={setupFlow.totalSteps}
                            footer={(
                                <View style={styles.wizardActionsRow}>
                                    <AppButton
                                        style={[styles.wizardSecondaryBtn, { borderColor: theme.icon, backgroundColor: theme.card }]}
                                        onPress={goToPreviousSetupStep}
                                    >
                                        <Text style={[styles.wizardSecondaryBtnText, { color: theme.text }]}>Retour</Text>
                                    </AppButton>
                                </View>
                            )}
                        >
                            <></>
                        </StepChildren>
                    ) : null}
                    <View style={styles.section}>
                        <View style={[styles.collapsibleSectionCard, { backgroundColor: theme.card, borderColor: theme.icon }]}>
                            <AppButton style={styles.collapsibleSectionHeader} onPress={() => setMembersExpanded((prev) => !prev)}>
                                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Membres du foyer</Text>
                                <MaterialCommunityIcons
                                    name={membersExpanded ? "chevron-down" : "chevron-right"}
                                    size={24}
                                    color={theme.textSecondary}
                                />
                            </AppButton>

                            {membersExpanded ? (
                                <View style={styles.collapsibleSectionBody}>
                                {!isEditMode && (
                                    <>
                                        <View style={[styles.activeUserCard, { backgroundColor: memberItemBackground }]}>
                                            <Text style={[styles.activeUserLabel, { color: theme.textSecondary }]}>
                                                Utilisateur actif (Parent)
                                            </Text>
                                            <Text style={[styles.activeUserName, { color: theme.text }]}>
                                                {activeUser?.name || "Parent"}
                                            </Text>
                                            {activeUser?.email ? (
                                                <Text style={[styles.activeUserEmail, { color: theme.textSecondary }]}>
                                                    {activeUser.email}
                                                </Text>
                                            ) : null}
                                        </View>

                                        {sortedDraftMembers.length > 0 && (
                                            <View style={{ marginTop: 10, marginBottom: 10, gap: 8 }}>
                                                {sortedDraftMembers.map(({ member, index }) => (
                                                    <View key={`${member.name}-${index}`} style={[styles.memberCard, { backgroundColor: memberItemBackground }]}>
                                                        <View style={{ flex: 1 }}>
                                                            <View style={styles.memberTitleRow}>
                                                                <Text style={[styles.memberName, { color: theme.text }]}>{member.name}</Text>
                                                                <AppButton
                                                                    style={[
                                                                        styles.memberRoleBadge,
                                                                        member.role === "parent"
                                                                            ? { borderColor: theme.tint, backgroundColor: `${theme.tint}22` }
                                                                            : { borderColor: theme.icon, backgroundColor: `${theme.icon}22` },
                                                                    ]}
                                                                    onPress={() => toggleDraftMemberRoleAtIndex(index)}
                                                                    activeOpacity={0.75}
                                                                >
                                                                    <Text
                                                                        style={[
                                                                            styles.memberRoleBadgeText,
                                                                            { color: member.role === "parent" ? theme.tint : theme.textSecondary },
                                                                        ]}
                                                                    >
                                                                        {member.role === "parent" ? "Parent" : "Enfant"}
                                                                    </Text>
                                                                </AppButton>
                                                            </View>
                                                            {member.email ? (
                                                                <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>{member.email}</Text>
                                                            ) : null}
                                                        </View>
                                                        <AppButton onPress={() => removeMember(index)}>
                                                            <MaterialCommunityIcons name="trash-can-outline" size={22} color={theme.textSecondary} />
                                                        </AppButton>
                                                    </View>
                                                ))}
                                            </View>
                                        )}
                                    </>
                                )}

                                {isEditMode ? (
                                    <>
                                        {membersLoading ? (
                                            <ActivityIndicator size="small" color={theme.tint} />
                                        ) : (
                                            <View style={{ gap: 8, marginBottom: 12 }}>
                                                {orderedManagedMembers.map((member) => {
                                                    const nextRole = managedRoleDrafts[member.id] ?? member.role;
                                                    const isUpdating = updatingManagedMemberId === member.id;
                                                    const isDeleting = deletingManagedMemberId === member.id;
                                                    const shareKey = `managed-${member.id}`;
                                                    const isSharing = sendingMemberKey === shareKey;

                                                    return (
                                                        <View key={member.id} style={[styles.memberCard, { backgroundColor: memberItemBackground }]}>
                                                            <View style={{ flex: 1 }}>
                                                                <View style={styles.memberTitleRow}>
                                                                    <Text style={[styles.memberName, { color: theme.text }]}>{member.name}</Text>
                                                                    <AppButton
                                                                        style={[
                                                                            styles.memberRoleBadge,
                                                                            nextRole === "parent"
                                                                                ? { borderColor: theme.tint, backgroundColor: `${theme.tint}22` }
                                                                                : { borderColor: theme.icon, backgroundColor: `${theme.icon}22` },
                                                                        ]}
                                                                        onPress={() => confirmManagedMemberRoleToggle(member)}
                                                                        activeOpacity={0.75}
                                                                        disabled={!canManageMembers || isUpdating || isDeleting}
                                                                    >
                                                                        <Text
                                                                            style={[
                                                                                styles.memberRoleBadgeText,
                                                                                { color: nextRole === "parent" ? theme.tint : theme.textSecondary },
                                                                            ]}
                                                                        >
                                                                            {nextRole === "parent" ? "Parent" : "Enfant"}
                                                                        </Text>
                                                                    </AppButton>
                                                                </View>
                                                                <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                                                                    {member.email || "E-mail non défini"}
                                                                </Text>
                                                                <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                                                                    {member.must_change_password
                                                                        ? "Mot de passe temporaire à modifier"
                                                                        : "Accès actif"}
                                                                </Text>

                                                                {canManageMembers ? (
                                                                    <View style={styles.memberActionRow}>
                                                                        <AppButton
                                                                            onPress={() => onDeleteManagedMember(member)}
                                                                            style={[styles.memberActionBtn, { backgroundColor: theme.background, borderColor: theme.icon, borderWidth: 1, opacity: isDeleting ? 0.7 : 1 }]}
                                                                            disabled={isUpdating || isDeleting}
                                                                        >
                                                                            <Text style={[styles.memberActionBtnText, { color: theme.text }]}>
                                                                                {isDeleting ? "Supp..." : "Supprimer"}
                                                                            </Text>
                                                                        </AppButton>

                                                                        {member.must_change_password && (
                                                                            <AppButton
                                                                                onPress={() => {
                                                                                    void onShareManagedMemberAccess(member);
                                                                                }}
                                                                                style={[styles.memberActionBtn, { backgroundColor: theme.background, borderColor: theme.tint, borderWidth: 1, opacity: isSharing ? 0.7 : 1 }]}
                                                                                disabled={isSharing || isUpdating || isDeleting}
                                                                            >
                                                                                <Text style={[styles.memberActionBtnText, { color: theme.tint }]}>
                                                                                    {isSharing ? "Partage..." : "Partager"}
                                                                                </Text>
                                                                            </AppButton>
                                                                        )}
                                                                    </View>
                                                                ) : null}
                                                            </View>
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        )}
                                    </>
                                ) : null}

                                {!isEditMode || canManageMembers ? (
                                    <View style={[styles.memberEditor, { backgroundColor: memberItemBackground }]}>
                                        <AppTextInput
                                            style={[styles.input, styles.inputWithBottomSpacing]}
                                            placeholder="Nom du membre"
                                            placeholderTextColor={theme.textSecondary}
                                            value={memberName}
                                            onChangeText={setMemberName}
                                        />

                                        <AppTextInput
                                            style={[styles.input, styles.inputWithBottomSpacing]}
                                            placeholder="Email (optionnel)"
                                            placeholderTextColor={theme.textSecondary}
                                            keyboardType="email-address"
                                            autoCapitalize="none"
                                            value={memberEmail}
                                            onChangeText={setMemberEmail}
                                        />

                                        <View style={styles.roleRow}>
                                            <AppButton
                                                onPress={() => setMemberRole("parent")}
                                                style={[
                                                    styles.roleChip,
                                                    { borderColor: theme.icon, backgroundColor: theme.background },
                                                    memberRole === "parent" && { borderColor: theme.tint, backgroundColor: theme.tint + "20" },
                                                ]}
                                            >
                                                <Text style={[styles.roleChipText, { color: theme.text }]}>Parent</Text>
                                            </AppButton>

                                            <AppButton
                                                onPress={() => setMemberRole("enfant")}
                                                style={[
                                                    styles.roleChip,
                                                    { borderColor: theme.icon, backgroundColor: theme.background },
                                                    memberRole === "enfant" && { borderColor: theme.tint, backgroundColor: theme.tint + "20" },
                                                ]}
                                            >
                                                <Text style={[styles.roleChipText, { color: theme.text }]}>Enfant</Text>
                                            </AppButton>
                                        </View>

                                        <AppButton
                                            onPress={() => {
                                                if (isEditMode) {
                                                    void onAddManagedMember();
                                                } else {
                                                    addMember();
                                                }
                                            }}
                                            style={[styles.addButton, { backgroundColor: theme.background, opacity: addingManagedMember ? 0.7 : 1 }]}
                                            disabled={isEditMode && addingManagedMember}
                                        >
                                            <MaterialCommunityIcons name="plus" size={20} color={theme.tint} />
                                            <Text style={[styles.addButtonText, { color: theme.tint }]}>
                                                {isEditMode && addingManagedMember ? "Ajout..." : "Ajouter ce membre"}
                                            </Text>
                                        </AppButton>
                                    </View>
                                ) : (
                                    <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                                        Seul un parent peut gérer les membres du foyer.
                                    </Text>
                                )}
                            </View>
                        ) : null}
                    </View>
                </View>
                </>
                )}

                {!isModuleScope && isEditMode && (
                    <View style={styles.section}>
                        <View style={[styles.collapsibleSectionCard, { backgroundColor: theme.card, borderColor: theme.icon }]}>
                            <AppButton
                                style={styles.collapsibleSectionHeader}
                                onPress={() => setConnectedHouseholdExpanded((prev) => !prev)}
                            >
                                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Foyer connecté</Text>
                                <MaterialCommunityIcons
                                    name={connectedHouseholdExpanded ? "chevron-down" : "chevron-right"}
                                    size={24}
                                    color={theme.textSecondary}
                                />
                            </AppButton>

                            {connectedHouseholdExpanded ? (
                                <View style={styles.collapsibleSectionBody}>
                                    {connectionLoading ? (
                                        <ActivityIndicator size="small" color={theme.tint} />
                                    ) : !connectionPermissions.can_manage_connection ? (
                                        <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                                            Seul un parent peut gérer la liaison entre foyers.
                                        </Text>
                                    ) : connectionState.is_connected && connectionState.linked_household ? (
                                        <View style={[styles.connectedHouseholdCard, { backgroundColor: memberItemBackground }]}>
                                            <Text style={[styles.connectedHouseholdLabel, { color: theme.textSecondary }]}>
                                                Liaison active
                                            </Text>
                                            <Text style={[styles.connectedHouseholdName, { color: theme.text }]}>
                                                {connectionState.linked_household.name}
                                            </Text>
                                            <AppButton
                                                style={[
                                                    styles.connectedHouseholdDangerBtn,
                                                    { borderColor: theme.accentWarm, opacity: connectionActionLoading === "unlink" ? 0.75 : 1 },
                                                ]}
                                                onPress={onUnlinkConnectedHousehold}
                                                disabled={connectionActionLoading === "unlink" || !connectionPermissions.can_unlink}
                                            >
                                                {connectionActionLoading === "unlink" ? (
                                                    <ActivityIndicator size="small" color={theme.accentWarm} />
                                                ) : (
                                                    <Text style={[styles.connectedHouseholdDangerText, { color: theme.accentWarm }]}>
                                                        Rompre la liaison
                                                    </Text>
                                                )}
                                            </AppButton>
                                        </View>
                                    ) : connectionState.pending_request ? (
                                        <View style={[styles.connectedHouseholdCard, { backgroundColor: memberItemBackground }]}>
                                            <Text style={[styles.connectedHouseholdLabel, { color: theme.textSecondary }]}>
                                                Demande en attente
                                            </Text>
                                            <Text style={[styles.connectedHouseholdName, { color: theme.text }]}>
                                                {connectionState.pending_request.other_household?.name ?? "Autre foyer"}
                                            </Text>
                                            <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                                                {connectionState.pending_request.direction === "incoming"
                                                    ? "Ce foyer a demandé à se connecter au vôtre. Vérifie les notifications pour accepter ou refuser."
                                                    : "Votre demande a été envoyée. Vous serez notifié dès qu'une réponse sera donnée."}
                                            </Text>
                                        </View>
                                    ) : (
                                        <View style={[styles.connectedHouseholdCard, { backgroundColor: memberItemBackground }]}>
                                            <Text style={[styles.memberMeta, { color: theme.textSecondary, marginBottom: 8 }]}>
                                                Aucun foyer n’est connecté pour le moment.
                                            </Text>

                                            <AppButton
                                                style={[
                                                    styles.connectedHouseholdPrimaryBtn,
                                                    { backgroundColor: theme.tint, opacity: connectionActionLoading === "share" ? 0.75 : 1 },
                                                ]}
                                                onPress={() => {
                                                    void onShareHouseholdConnectionCode();
                                                }}
                                                disabled={connectionActionLoading === "share" || !connectionPermissions.can_generate_code}
                                            >
                                                {connectionActionLoading === "share" ? (
                                                    <ActivityIndicator size="small" color="white" />
                                                ) : (
                                                    <Text style={styles.connectedHouseholdPrimaryText}>Partager un code de liaison</Text>
                                                )}
                                            </AppButton>

                                            {connectionState.active_code?.code ? (
                                                <View style={[styles.connectedCodeInfo, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                                                    <Text style={[styles.connectedCodeLabel, { color: theme.textSecondary }]}>Code actuel</Text>
                                                    <Text style={[styles.connectedCodeValue, { color: theme.text }]}>
                                                        {connectionState.active_code.code}
                                                    </Text>
                                                    {connectionCodeExpiryLabel ? (
                                                        <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                                                            Expire le {connectionCodeExpiryLabel}
                                                        </Text>
                                                    ) : null}
                                                </View>
                                            ) : null}

                                            <Text style={[styles.label, { color: theme.text, marginBottom: 6, marginTop: 12 }]}>
                                                Connecter un foyer avec un code
                                            </Text>
                                            <AppTextInput
                                                style={[styles.input, styles.inputWithSmallBottomSpacing]}
                                                value={connectionCodeInput}
                                                onChangeText={(value) => setConnectionCodeInput(value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                                                autoCapitalize="characters"
                                                placeholder="Ex: AB12CD34"
                                                placeholderTextColor={theme.textSecondary}
                                            />
                                            <AppButton
                                                style={[
                                                    styles.connectedHouseholdSecondaryBtn,
                                                    { borderColor: theme.tint, backgroundColor: `${theme.tint}14`, opacity: connectionActionLoading === "connect" ? 0.75 : 1 },
                                                ]}
                                                onPress={() => {
                                                    void onConnectHouseholdWithCode();
                                                }}
                                                disabled={connectionActionLoading === "connect" || !connectionPermissions.can_connect_with_code}
                                            >
                                                {connectionActionLoading === "connect" ? (
                                                    <ActivityIndicator size="small" color={theme.tint} />
                                                ) : (
                                                    <Text style={[styles.connectedHouseholdSecondaryText, { color: theme.tint }]}>
                                                        Envoyer la demande de liaison
                                                    </Text>
                                                )}
                                            </AppButton>
                                        </View>
                                    )}
                                </View>
                            ) : null}
                        </View>
                    </View>
                )}

                {(!shouldUseSetupWizard || isModulesStepActive) && (
                    <>
                    {shouldUseSetupWizard ? (
                        <StepModules
                            stepIndex={modulesStepIndex}
                            totalSteps={setupFlow.totalSteps}
                            footer={(
                                <View style={styles.wizardActionsRow}>
                                    <AppButton
                                        style={[styles.wizardSecondaryBtn, { borderColor: theme.icon, backgroundColor: theme.card }]}
                                        onPress={goToPreviousSetupStep}
                                    >
                                        <Text style={[styles.wizardSecondaryBtnText, { color: theme.text }]}>Retour</Text>
                                    </AppButton>
                                    <AppButton
                                        style={[styles.wizardPrimaryBtn, { backgroundColor: theme.tint }]}
                                        onPress={goToNextSetupStep}
                                    >
                                        <Text style={styles.wizardPrimaryBtnText}>Continuer</Text>
                                    </AppButton>
                                </View>
                            )}
                        >
                            <></>
                        </StepModules>
                    ) : null}
                <View style={styles.section}>
                    <View style={[styles.collapsibleSectionCard, { backgroundColor: theme.card, borderColor: theme.icon }]}>
                        <AppButton style={styles.collapsibleSectionHeader} onPress={() => setModulesExpanded((prev) => !prev)}>
                            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                        {isMealsScope
                            ? "Repas & courses"
                            : isTasksScope
                                ? "Tâches ménagères"
                                : isBudgetScope
                                    ? "Budget"
                                : isCalendarScope
                                    ? "Calendrier"
                                : "Configuration des modules"}
                            </Text>
                            <MaterialCommunityIcons
                                name={modulesExpanded ? "chevron-down" : "chevron-right"}
                                size={24}
                                color={theme.textSecondary}
                            />
                        </AppButton>

                        {modulesExpanded ? (
                            <View style={styles.collapsibleSectionBody}>
                                {visibleModules.map((module) => {
                                    const canExpandModulePanel = showScopedModuleDetails || module.id === "meals";

                                    return (
                                    <View key={module.id} style={[styles.moduleContainer, { backgroundColor: theme.background }]}> 
                            <View style={styles.moduleCard}> 
                                <View style={[styles.moduleIcon, { backgroundColor: theme.background }]}> 
                                    <MaterialCommunityIcons name={module.icon as any} size={24} color={theme.tint} />
                                </View>
                                <AppButton
                                    style={{ flex: 1 }}
                                    onPress={() => {
                                        if (!canExpandModulePanel) {
                                            return;
                                        }
                                        toggleModulePanel(module.id);
                                    }}
                                    disabled={!canExpandModulePanel}
                                >
                                    <Text style={[styles.moduleLabel, { color: theme.text }]}>{module.label}</Text>
                                    <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{module.desc}</Text>
                                </AppButton>
                                <Switch
                                    value={!!activeModules[module.id]}
                                    onValueChange={() => toggleModule(module.id)}
                                    trackColor={{ false: theme.icon, true: theme.tint }}
                                />
                                {canExpandModulePanel ? (
                                    <AppButton
                                        onPress={() => toggleModulePanel(module.id)}
                                        style={{ marginLeft: 8, padding: 4 }}
                                        disabled={!activeModules[module.id]}
                                    >
                                        <MaterialCommunityIcons
                                            name={expandedModules[module.id] ? "chevron-up" : "chevron-down"}
                                            size={22}
                                            color={activeModules[module.id] ? theme.text : theme.icon}
                                        />
                                    </AppButton>
                                ) : (
                                    <View style={styles.mealChevronSpacer} />
                                )}
                            </View>

                            {activeModules[module.id] && expandedModules[module.id] && module.id === "meals" && (
                                <View style={styles.subConfigBox}>
                                    <View style={styles.mealFeatureRow}>
                                        <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Recettes</Text>
                                        <View style={styles.mealFeatureControls}>
                                            <Switch
                                                value={mealOptions.recipes}
                                                onValueChange={(value) => updateMealOption("recipes", value)}
                                                trackColor={{ false: theme.icon, true: theme.tint }}
                                            />
                                            {showScopedModuleDetails ? (
                                                <AppButton
                                                    onPress={() => toggleMealSection("recipes")}
                                                    style={{ marginLeft: 8, padding: 4 }}
                                                    disabled={!mealOptions.recipes}
                                                >
                                                    <MaterialCommunityIcons
                                                        name={mealExpandedSections.recipes ? "chevron-up" : "chevron-down"}
                                                        size={20}
                                                        color={mealOptions.recipes ? theme.text : theme.icon}
                                                    />
                                                </AppButton>
                                            ) : (
                                                <View style={styles.mealChevronSpacer} />
                                            )}
                                        </View>
                                    </View>

                                    {showScopedModuleDetails && mealOptions.recipes && mealExpandedSections.recipes && (
                                        <View style={[styles.mealSectionBox, { backgroundColor: theme.background }]}>
                                            <Text style={[styles.label, { color: theme.text, marginTop: 4 }]}>
                                                Portions par défaut du foyer
                                            </Text>
                                            <AppTextInput
                                                style={[styles.input, styles.inputNoMargin]}
                                                value={defaultServings}
                                                onChangeText={setDefaultServings}
                                                keyboardType="numeric"
                                                placeholder="4"
                                                placeholderTextColor={theme.textSecondary}
                                            />

                                            <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>
                                                Tags alimentaires
                                            </Text>
                                            <View style={styles.categoryFilterWrap}>
                                                {DIETARY_TYPE_ORDER.map((type) => (
                                                    <AppButton
                                                        key={type}
                                                        onPress={() => {
                                                            if (selectedDietaryTypeFilter === type) {
                                                                return;
                                                            }
                                                            setSelectedDietaryTypeFilter(type);
                                                            setDietaryTagSearch("");
                                                            void loadDietaryTags(type);
                                                        }}
                                                        style={[
                                                            styles.categoryFilterChip,
                                                            { borderColor: theme.icon, backgroundColor: theme.background },
                                                            selectedDietaryTypeFilter === type && { borderColor: theme.tint, backgroundColor: theme.tint + "20" },
                                                        ]}
                                                    >
                                                        <Text
                                                            style={{
                                                                color: selectedDietaryTypeFilter === type ? theme.tint : theme.text,
                                                                fontSize: 12,
                                                                fontWeight: "600",
                                                            }}
                                                        >
                                                            {DIETARY_TYPE_LABELS[type]}
                                                        </Text>
                                                    </AppButton>
                                                ))}
                                            </View>

                                            {selectedTagsForCurrentType.length > 0 && (
                                                <View style={{ marginBottom: 10 }}>
                                                    <Text style={[styles.selectedHint, { color: theme.textSecondary }]}>
                                                        Sélection dans {DIETARY_TYPE_LABELS[selectedDietaryTypeFilter]}:
                                                    </Text>
                                                    <Text style={[styles.selectedValues, { color: theme.text }]}>
                                                        {selectedTagsForCurrentType.map((tag) => tag.label).join(", ")}
                                                    </Text>
                                                </View>
                                            )}
                                            <AppTextInput
                                                style={[styles.input, styles.inputWithSmallBottomSpacing]}
                                                value={dietaryTagSearch}
                                                onChangeText={setDietaryTagSearch}
                                                placeholder={`Rechercher un tag (${DIETARY_TYPE_LABELS[selectedDietaryTypeFilter]})...`}
                                                placeholderTextColor={theme.textSecondary}
                                                autoCapitalize="none"
                                            />
                                            {dietaryTagsLoading ? (
                                                <View style={styles.tagsLoadingRow}>
                                                    <ActivityIndicator size="small" color={theme.tint} />
                                                    <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                                                        Chargement des tags...
                                                    </Text>
                                                </View>
                                            ) : filteredDietaryTags.length === 0 ? (
                                                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                                                    Aucun tag ne correspond à la recherche.
                                                </Text>
                                            ) : (
                                                <View style={styles.tagsWrap}>
                                                    {filteredDietaryTags.map((tag) => {
                                                        const isSelected = selectedMealDietaryTags.includes(tag.key);
                                                        return (
                                                            <AppButton
                                                                key={tag.id}
                                                                onPress={() => toggleMealDietaryTag(tag.key)}
                                                                style={[
                                                                    styles.tagChip,
                                                                    { borderColor: theme.icon, backgroundColor: theme.card },
                                                                    isSelected && { borderColor: theme.tint, backgroundColor: theme.tint + "25" },
                                                                ]}
                                                            >
                                                                <Text
                                                                    style={[
                                                                        styles.tagChipText,
                                                                        { color: theme.text },
                                                                        isSelected && { color: theme.tint },
                                                                    ]}
                                                                >
                                                                    {tag.label}
                                                                </Text>
                                                                <Text style={[styles.tagChipType, { color: theme.textSecondary }]}>
                                                                    {DIETARY_TYPE_LABELS[tag.type]}
                                                                </Text>
                                                            </AppButton>
                                                        );
                                                    })}
                                                </View>
                                            )}

                                            {canSuggestCreateDietaryTag && (
                                                <View style={[styles.createTagBox, { borderColor: theme.icon, backgroundColor: theme.card }]}>
                                                    <Text style={[styles.createTagTitle, { color: theme.text }]}>
                                                        Ajouter &quot;{dietaryTagSearch.trim()}&quot; ?
                                                    </Text>
                                                    <Text style={[styles.createTagTypeText, { color: theme.textSecondary }]}>
                                                        Catégorie: {DIETARY_TYPE_LABELS[selectedDietaryTypeFilter]}
                                                    </Text>
                                                    <AppButton
                                                        onPress={createDietaryTag}
                                                        disabled={creatingDietaryTag}
                                                        style={[styles.createTagBtn, { backgroundColor: theme.tint, opacity: creatingDietaryTag ? 0.7 : 1 }]}
                                                    >
                                                        {creatingDietaryTag ? (
                                                            <ActivityIndicator size="small" color="white" />
                                                        ) : (
                                                            <Text style={styles.createTagBtnText}>Ajouter ce tag</Text>
                                                        )}
                                                    </AppButton>
                                                </View>
                                            )}
                                        </View>
                                    )}

                                    <View style={styles.mealFeatureRow}>
                                        <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Sondages</Text>
                                        <View style={styles.mealFeatureControls}>
                                            <Switch
                                                value={mealOptions.polls}
                                                onValueChange={(value) => updateMealOption("polls", value)}
                                                trackColor={{ false: theme.icon, true: theme.tint }}
                                            />
                                            {showScopedModuleDetails ? (
                                                <AppButton
                                                    onPress={() => toggleMealSection("polls")}
                                                    style={{ marginLeft: 8, padding: 4 }}
                                                    disabled={!mealOptions.polls}
                                                >
                                                    <MaterialCommunityIcons
                                                        name={mealExpandedSections.polls ? "chevron-up" : "chevron-down"}
                                                        size={20}
                                                        color={mealOptions.polls ? theme.text : theme.icon}
                                                    />
                                                </AppButton>
                                            ) : (
                                                <View style={styles.mealChevronSpacer} />
                                            )}
                                        </View>
                                    </View>

                                    {showScopedModuleDetails && mealOptions.polls && mealExpandedSections.polls && (
                                        <View style={[styles.mealSectionBox, { backgroundColor: theme.background }]}>
                                            <Text style={[styles.label, { color: theme.text, marginTop: 6 }]}>Jour du sondage</Text>
                                            <View style={styles.daysContainer}>
                                                {DAYS.map((day) => (
                                                    <AppButton
                                                        key={day.value}
                                                        onPress={() => setPollDay(day.value)}
                                                        style={[
                                                            styles.dayChip,
                                                            { backgroundColor: theme.background, borderColor: theme.icon },
                                                            pollDay === day.value && { backgroundColor: theme.tint, borderColor: theme.tint },
                                                        ]}
                                                    >
                                                        <Text style={{ color: pollDay === day.value ? "white" : theme.text, fontSize: 12 }}>{day.label}</Text>
                                                    </AppButton>
                                                ))}
                                            </View>

                                            <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.label, { color: theme.text }]}>Heure</Text>
                                                    <AppTextInput
                                                        style={[styles.input, styles.inputCentered, styles.inputNoMargin]}
                                                        value={pollTime}
                                                        onChangeText={setPollTime}
                                                        placeholder="10:00"
                                                        placeholderTextColor={theme.textSecondary}
                                                    />
                                                </View>

                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.label, { color: theme.text }]}>Duree</Text>
                                                    <View style={{ flexDirection: "row", gap: 6 }}>
                                                        {DURATION_CHOICES.map((value) => (
                                                            <AppButton
                                                                key={value}
                                                                onPress={() => setPollDuration(value)}
                                                                style={[
                                                                    styles.durationBtn,
                                                                    { backgroundColor: theme.card },
                                                                    pollDuration === value && { backgroundColor: theme.tint },
                                                                ]}
                                                            >
                                                                <Text style={{ color: pollDuration === value ? "white" : theme.text }}>{value}h</Text>
                                                            </AppButton>
                                                        ))}
                                                    </View>
                                                </View>
                                            </View>
                                            <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>Max votes par utilisateur</Text>
                                            <AppTextInput
                                                style={[styles.input, styles.inputNoMargin]}
                                                value={maxVotesPerUser}
                                                onChangeText={setMaxVotesPerUser}
                                                keyboardType="numeric"
                                                placeholder="3"
                                                placeholderTextColor={theme.textSecondary}
                                            />
                                        </View>
                                    )}

                                    <View style={styles.mealFeatureRow}>
                                        <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Liste de courses</Text>
                                        <View style={styles.mealFeatureControls}>
                                            <Switch
                                                value={mealOptions.shopping_list}
                                                onValueChange={(value) => updateMealOption("shopping_list", value)}
                                                trackColor={{ false: theme.icon, true: theme.tint }}
                                            />
                                            <View style={styles.mealChevronSpacer} />
                                        </View>
                                    </View>

                                </View>
                            )}

                            {showScopedModuleDetails && activeModules[module.id] && expandedModules[module.id] && module.id === "tasks" && (
                                <View style={styles.subConfigBox}>
                                    <View style={styles.switchRow}>
                                        <Text style={[styles.label, { color: theme.text }]}>Rappels actifs</Text>
                                        <Switch
                                            value={tasksSettings.reminders_enabled}
                                            onValueChange={(value) => setTasksSettings((prev) => ({ ...prev, reminders_enabled: value }))}
                                            trackColor={{ false: theme.icon, true: theme.tint }}
                                        />
                                    </View>

                                    <View style={styles.switchRow}>
                                        <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Garde alternée</Text>
                                        <Switch
                                            value={tasksSettings.alternating_custody_enabled}
                                            onValueChange={(value) =>
                                                setTasksSettings((prev) => ({ ...prev, alternating_custody_enabled: value }))
                                            }
                                            trackColor={{ false: theme.icon, true: theme.tint }}
                                        />
                                    </View>

                                    {tasksSettings.alternating_custody_enabled ? (
                                        <>
                                            <Text style={[styles.label, { color: theme.text, marginTop: 6 }]}>Jour de bascule</Text>
                                            <View style={styles.daysContainer}>
                                                {DAYS.map((day) => (
                                                    <AppButton
                                                        key={`custody-day-${day.value}`}
                                                        onPress={() =>
                                                            setTasksSettings((prev) => ({
                                                                ...prev,
                                                                custody_change_day: day.value,
                                                                custody_home_week_start: normalizeCustodyWeekStartDate(
                                                                    prev.custody_home_week_start,
                                                                    day.value
                                                                ),
                                                            }))
                                                        }
                                                        style={[
                                                            styles.dayChip,
                                                            { borderColor: theme.icon, backgroundColor: theme.card },
                                                            tasksSettings.custody_change_day === day.value
                                                                && { backgroundColor: theme.tint, borderColor: theme.tint },
                                                        ]}
                                                    >
                                                        <Text
                                                            style={{
                                                                color: tasksSettings.custody_change_day === day.value ? "white" : theme.text,
                                                                fontSize: 12,
                                                            }}
                                                        >
                                                            {day.label}
                                                        </Text>
                                                    </AppButton>
                                                ))}
                                            </View>

                                            <Text style={[styles.label, { color: theme.text }]}>Début d&apos;une semaine à la maison</Text>
                                            <AppButton
                                                onPress={openCustodyDateWheel}
                                                style={[styles.pickerFieldBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                                            >
                                                <MaterialCommunityIcons name="calendar-month-outline" size={16} color={theme.textSecondary} />
                                                <Text style={[styles.pickerFieldText, { color: theme.text }]}>
                                                    {tasksSettings.custody_home_week_start}
                                                </Text>
                                            </AppButton>
                                            {custodyDateWheelVisible ? (
                                                <View style={[styles.inlineWheelPanel, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                                                    <Text style={[styles.label, { color: theme.text }]}>Choisir la semaine de référence</Text>

                                                    <View style={styles.wheelRow}>
                                                        <View style={styles.wheelColumn}>
                                                            <ScrollView keyboardShouldPersistTaps="handled"
                                                                ref={custodyDayWheelRef}
                                                                nestedScrollEnabled
                                                                showsVerticalScrollIndicator={false}
                                                                snapToInterval={WHEEL_ITEM_HEIGHT}
                                                                decelerationRate="fast"
                                                                scrollEventThrottle={32}
                                                                contentContainerStyle={styles.wheelContentContainer}
                                                                onScroll={(event) => {
                                                                    const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, custodyDayOptions.length);
                                                                    if (index === custodyDateDayIndexRef.current) {
                                                                        return;
                                                                    }
                                                                    custodyDateDayIndexRef.current = index;
                                                                    setCustodyDateWheelDay(custodyDayOptions[index]);
                                                                }}
                                                            >
                                                                {custodyDayOptions.map((value) => (
                                                                    <View key={`custody-wheel-day-${value}`} style={styles.wheelItem}>
                                                                        <Text
                                                                            style={[
                                                                                styles.wheelItemText,
                                                                                { color: custodyDateWheelDay === value ? theme.text : theme.textSecondary },
                                                                                custodyDateWheelDay === value && styles.wheelItemTextSelected,
                                                                            ]}
                                                                        >
                                                                            {`${weekDayShortLabel(custodyDateWheelYear, custodyDateWheelMonth, value)} ${pad2(value)}`}
                                                                        </Text>
                                                                    </View>
                                                                ))}
                                                            </ScrollView>
                                                            <View
                                                                pointerEvents="none"
                                                                style={[
                                                                    styles.wheelSelectionOverlay,
                                                                    { borderColor: theme.icon, backgroundColor: `${theme.tint}14` },
                                                                ]}
                                                            />
                                                        </View>

                                                        <View style={styles.wheelColumn}>
                                                            <ScrollView keyboardShouldPersistTaps="handled"
                                                                ref={custodyMonthWheelRef}
                                                                nestedScrollEnabled
                                                                showsVerticalScrollIndicator={false}
                                                                snapToInterval={WHEEL_ITEM_HEIGHT}
                                                                decelerationRate="fast"
                                                                scrollEventThrottle={32}
                                                                contentContainerStyle={styles.wheelContentContainer}
                                                                onScroll={(event) => {
                                                                    const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, custodyMonthOptions.length);
                                                                    if (index === custodyDateMonthIndexRef.current) {
                                                                        return;
                                                                    }
                                                                    custodyDateMonthIndexRef.current = index;
                                                                    setCustodyDateWheelMonth(custodyMonthOptions[index]);
                                                                }}
                                                            >
                                                                {custodyMonthOptions.map((value) => (
                                                                    <View key={`custody-wheel-month-${value}`} style={styles.wheelItem}>
                                                                        <Text
                                                                            style={[
                                                                                styles.wheelItemText,
                                                                                { color: custodyDateWheelMonth === value ? theme.text : theme.textSecondary },
                                                                                custodyDateWheelMonth === value && styles.wheelItemTextSelected,
                                                                            ]}
                                                                        >
                                                                            {MONTH_LABELS[value - 1]}
                                                                        </Text>
                                                                    </View>
                                                                ))}
                                                            </ScrollView>
                                                            <View
                                                                pointerEvents="none"
                                                                style={[
                                                                    styles.wheelSelectionOverlay,
                                                                    { borderColor: theme.icon, backgroundColor: `${theme.tint}14` },
                                                                ]}
                                                            />
                                                        </View>

                                                        <View style={styles.wheelColumn}>
                                                            <ScrollView keyboardShouldPersistTaps="handled"
                                                                ref={custodyYearWheelRef}
                                                                nestedScrollEnabled
                                                                showsVerticalScrollIndicator={false}
                                                                snapToInterval={WHEEL_ITEM_HEIGHT}
                                                                decelerationRate="fast"
                                                                scrollEventThrottle={32}
                                                                contentContainerStyle={styles.wheelContentContainer}
                                                                onScroll={(event) => {
                                                                    const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, custodyYearOptions.length);
                                                                    if (index === custodyDateYearIndexRef.current) {
                                                                        return;
                                                                    }
                                                                    custodyDateYearIndexRef.current = index;
                                                                    setCustodyDateWheelYear(custodyYearOptions[index]);
                                                                }}
                                                            >
                                                                {custodyYearOptions.map((value) => (
                                                                    <View key={`custody-wheel-year-${value}`} style={styles.wheelItem}>
                                                                        <Text
                                                                            style={[
                                                                                styles.wheelItemText,
                                                                                { color: custodyDateWheelYear === value ? theme.text : theme.textSecondary },
                                                                                custodyDateWheelYear === value && styles.wheelItemTextSelected,
                                                                            ]}
                                                                        >
                                                                            {value}
                                                                        </Text>
                                                                    </View>
                                                                ))}
                                                            </ScrollView>
                                                            <View
                                                                pointerEvents="none"
                                                                style={[
                                                                    styles.wheelSelectionOverlay,
                                                                    { borderColor: theme.icon, backgroundColor: `${theme.tint}14` },
                                                                ]}
                                                            />
                                                        </View>
                                                    </View>
                                                </View>
                                            ) : null}
                                            <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                                                Les tâches récurrentes des enfants seront planifiées une semaine sur deux, à partir de cette semaine.
                                            </Text>
                                        </>
                                    ) : (
                                        <Text style={[styles.memberMeta, { color: theme.textSecondary, marginTop: 4 }]}>
                                            Active la garde alternée pour limiter les routines enfants aux semaines à la maison.
                                        </Text>
                                    )}
                                </View>
                            )}

                            {showScopedModuleDetails && activeModules[module.id] && expandedModules[module.id] && module.id === "calendar" && (
                                <View style={styles.subConfigBox}>
                                    <View style={styles.switchRow}>
                                        <Text style={[styles.label, { color: theme.text }]}>Vue partagée</Text>
                                        <Switch
                                            value={calendarSettings.shared_view_enabled}
                                            onValueChange={(value) => setCalendarSettings((prev) => ({ ...prev, shared_view_enabled: value }))}
                                            trackColor={{ false: theme.icon, true: theme.tint }}
                                        />
                                    </View>
                                    <View style={styles.switchRow}>
                                        <Text style={[styles.label, { color: theme.text }]}>Suivi des absences</Text>
                                        <Switch
                                            value={calendarSettings.absence_tracking_enabled}
                                            onValueChange={(value) => setCalendarSettings((prev) => ({ ...prev, absence_tracking_enabled: value }))}
                                            trackColor={{ false: theme.icon, true: theme.tint }}
                                        />
                                    </View>
                                </View>
                            )}

                            {showScopedModuleDetails && activeModules[module.id] && expandedModules[module.id] && module.id === "budget" && (
                                <View style={styles.subConfigBox}>
                                    {isEditMode ? (
                                        <>
                                            <Text style={[styles.label, { color: theme.text }]}>Paramètres par enfant</Text>
                                            <Text style={[styles.memberMeta, { color: theme.textSecondary, marginBottom: 8 }]}>
                                                Définis ici le montant de base, la récurrence, le jour de réinitialisation et les règles d&apos;avance.
                                            </Text>

                                            {budgetSettingsLoading ? (
                                                <ActivityIndicator size="small" color={theme.tint} />
                                            ) : budgetSettingsError ? (
                                                <Text style={[styles.memberMeta, { color: theme.accentWarm }]}>{budgetSettingsError}</Text>
                                            ) : budgetChildDrafts.length === 0 ? (
                                                <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                                                    Aucun enfant trouvé pour ce foyer.
                                                </Text>
                                            ) : (
                                                <View style={{ gap: 10 }}>
                                                    {budgetChildDrafts.map((draft) => (
                                                        <View key={`budget-child-${draft.childId}`} style={[styles.budgetChildCard, { backgroundColor: theme.background, borderColor: theme.icon }]}>
                                                            <Text style={[styles.memberName, { color: theme.text }]}>{draft.childName}</Text>

                                                            <Text style={[styles.label, { color: theme.text, marginBottom: 4 }]}>Montant de base</Text>
                                                            <AppTextInput
                                                                style={styles.budgetCompactInput}
                                                                keyboardType="decimal-pad"
                                                                value={draft.baseAmountInput}
                                                                onChangeText={(value) => updateBudgetChildDraft(draft.childId, { baseAmountInput: value })}
                                                                placeholder="Ex: 12,00"
                                                                placeholderTextColor={theme.textSecondary}
                                                            />

                                                            <Text style={[styles.label, { color: theme.text, marginBottom: 4 }]}>Récurrence</Text>
                                                            <View style={styles.budgetRecurrenceRow}>
                                                                <AppButton
                                                                    onPress={() => updateBudgetChildDraft(draft.childId, { recurrence: "weekly" })}
                                                                    style={[
                                                                        styles.budgetChoiceBtn,
                                                                        draft.recurrence === "weekly"
                                                                            ? { backgroundColor: theme.tint, borderColor: theme.tint }
                                                                            : { borderColor: theme.icon, backgroundColor: theme.card },
                                                                    ]}
                                                                >
                                                                    <Text style={[styles.budgetChoiceText, { color: draft.recurrence === "weekly" ? "#FFFFFF" : theme.text }]}>
                                                                        Hebdomadaire
                                                                    </Text>
                                                                </AppButton>
                                                                <AppButton
                                                                    onPress={() => updateBudgetChildDraft(draft.childId, { recurrence: "monthly" })}
                                                                    style={[
                                                                        styles.budgetChoiceBtn,
                                                                        draft.recurrence === "monthly"
                                                                            ? { backgroundColor: theme.tint, borderColor: theme.tint }
                                                                            : { borderColor: theme.icon, backgroundColor: theme.card },
                                                                    ]}
                                                                >
                                                                    <Text style={[styles.budgetChoiceText, { color: draft.recurrence === "monthly" ? "#FFFFFF" : theme.text }]}>
                                                                        Mensuelle
                                                                    </Text>
                                                                </AppButton>
                                                            </View>

                                                            <Text style={[styles.label, { color: theme.text, marginBottom: 4 }]}>
                                                                {draft.recurrence === "weekly"
                                                                    ? "Jour de réinitialisation (1 à 7)"
                                                                    : "Jour de réinitialisation (1 à 31)"}
                                                            </Text>
                                                            <AppTextInput
                                                                style={styles.budgetCompactInput}
                                                                keyboardType="number-pad"
                                                                value={draft.resetDayInput}
                                                                onChangeText={(value) => updateBudgetChildDraft(draft.childId, { resetDayInput: value })}
                                                                placeholder={draft.recurrence === "weekly" ? "1 à 7" : "1 à 31"}
                                                                placeholderTextColor={theme.textSecondary}
                                                            />

                                                            <View style={styles.switchRow}>
                                                                <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Autoriser les avances</Text>
                                                                <Switch
                                                                    value={draft.allowAdvances}
                                                                    onValueChange={(value) => updateBudgetChildDraft(draft.childId, { allowAdvances: value })}
                                                                    trackColor={{ false: theme.icon, true: theme.tint }}
                                                                />
                                                            </View>

                                                            <Text style={[styles.label, { color: theme.text, marginBottom: 4 }]}>Plafond d&apos;avance</Text>
                                                            <AppTextInput
                                                                style={[styles.budgetCompactInput, !draft.allowAdvances && styles.inputDisabled]}
                                                                keyboardType="decimal-pad"
                                                                value={draft.maxAdvanceInput}
                                                                editable={draft.allowAdvances}
                                                                onChangeText={(value) => updateBudgetChildDraft(draft.childId, { maxAdvanceInput: value })}
                                                                placeholder="Ex: 15,00"
                                                                placeholderTextColor={theme.textSecondary}
                                                            />

                                                            <AppButton
                                                                onPress={() => {
                                                                    void saveBudgetChildDraft(draft);
                                                                }}
                                                                style={[styles.budgetSaveBtn, { backgroundColor: theme.tint, opacity: savingBudgetChildId === draft.childId ? 0.8 : 1 }]}
                                                                disabled={savingBudgetChildId === draft.childId}
                                                            >
                                                                {savingBudgetChildId === draft.childId ? (
                                                                    <ActivityIndicator size="small" color="white" />
                                                                ) : (
                                                                    <Text style={styles.budgetSaveBtnText}>Enregistrer pour {draft.childName}</Text>
                                                                )}
                                                            </AppButton>
                                                        </View>
                                                    ))}
                                                </View>
                                            )}
                                        </>
                                    ) : (
                                        <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                                            Les paramètres détaillés par enfant seront disponibles dès que le foyer sera créé.
                                        </Text>
                                    )}
                                </View>
                            )}
                        </View>
                                    );
                                })}
                            </View>
                        ) : null}
                    </View>
                </View>
                </>
                )}

                {(!shouldUseSetupWizard || isChildrenStepActive) ? (
                    <AppButton
                        style={[styles.submitButton, { backgroundColor: theme.tint, opacity: loading ? 0.7 : 1 }]}
                        onPress={handleSave}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text style={styles.submitButtonText}>
                                {isEditMode ? "Enregistrer la configuration" : "Créer le foyer"}
                            </Text>
                        )}
                    </AppButton>
                ) : null}

                <View style={{ height: 40 }} />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
    lockCard: { width: "100%", borderRadius: 16, padding: 20, alignItems: "center" },
    lockTitle: { fontSize: 20, fontWeight: "700", marginTop: 10 },
    lockText: { fontSize: 14, marginTop: 6 },
    headerBar: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingBottom: 12,
        borderBottomWidth: 1,
        gap: 12,
    },
    headerActionBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 2,
    },
    headerTitle: { fontSize: 18, fontWeight: "700", flex: 1 },
    container: { padding: 20 },
    section: { marginBottom: 24 },
    sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
    label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
    input: { height: 50, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, marginBottom: 16 },
    inputNoMargin: { marginBottom: 0 },
    inputWithBottomSpacing: { marginBottom: 12 },
    inputWithSmallBottomSpacing: { marginBottom: 10 },
    inputCentered: { textAlign: "center" },
    inputDisabled: { opacity: 0.65 },
    pickerFieldBtn: {
        borderWidth: 1,
        borderRadius: 10,
        minHeight: 44,
        paddingHorizontal: 12,
        marginBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    pickerFieldText: {
        fontSize: 14,
        fontWeight: "600",
    },
    inlineWheelPanel: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 10,
        marginBottom: 10,
    },
    wheelRow: {
        flexDirection: "row",
        gap: 8,
    },
    wheelColumn: {
        flex: 1,
        height: WHEEL_CONTAINER_HEIGHT,
        position: "relative",
    },
    wheelContentContainer: {
        paddingVertical: WHEEL_VERTICAL_PADDING,
    },
    wheelItem: {
        height: WHEEL_ITEM_HEIGHT,
        alignItems: "center",
        justifyContent: "center",
    },
    wheelItemText: {
        fontSize: 16,
        fontWeight: "500",
    },
    wheelItemTextSelected: {
        fontWeight: "700",
    },
    wheelSelectionOverlay: {
        position: "absolute",
        left: 0,
        right: 0,
        top: WHEEL_VERTICAL_PADDING,
        height: WHEEL_ITEM_HEIGHT,
        borderWidth: 1,
        borderRadius: 10,
    },

    activeUserCard: {
        borderRadius: 12,
        padding: 10,
        marginBottom: 8,
    },
    activeUserLabel: { fontSize: 11, fontWeight: "600" },
    activeUserName: { fontSize: 14, fontWeight: "700", marginTop: 2 },
    activeUserEmail: { fontSize: 11, marginTop: 1 },
    collapsibleSectionCard: {
        borderRadius: 12,
        borderWidth: 1,
        overflow: "hidden",
    },
    collapsibleSectionHeader: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    collapsibleSectionBody: {
        paddingHorizontal: 12,
        paddingBottom: 12,
        paddingTop: 10,
    },
    memberActionRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
        marginTop: 2,
    },
    memberActionBtn: {
        minHeight: 30,
        paddingHorizontal: 8,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
    },
    memberActionBtnText: {
        color: "white",
        fontSize: 11,
        fontWeight: "700",
    },

    memberEditor: { borderRadius: 12, padding: 10 },
    roleRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
    roleChip: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    roleChipText: { fontSize: 12, fontWeight: "600" },

    inlineRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
    smallChip: {
        flex: 1,
        height: 40,
        borderRadius: 10,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    tagsLoadingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: 4,
    },
    categoryFilterWrap: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 10,
    },
    categoryFilterChip: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 7,
    },
    selectedHint: {
        fontSize: 12,
    },
    selectedValues: {
        fontSize: 13,
        fontWeight: "600",
        marginTop: 2,
    },
    tagsWrap: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    tagChip: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        minWidth: 120,
    },
    tagChipText: {
        fontSize: 13,
        fontWeight: "700",
    },
    tagChipType: {
        fontSize: 11,
        marginTop: 2,
    },
    createTagBox: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 10,
        marginTop: 12,
    },
    createTagTitle: {
        fontSize: 13,
        fontWeight: "700",
        marginBottom: 4,
    },
    createTagTypeText: {
        fontSize: 12,
        marginBottom: 10,
    },
    createTagBtn: {
        height: 40,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    createTagBtnText: {
        color: "white",
        fontSize: 14,
        fontWeight: "700",
    },

    addButton: {
        height: 44,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        marginTop: 4,
    },
    addButtonText: { fontSize: 14, fontWeight: "700" },
    sendCredentialBtn: {
        minWidth: 104,
        height: 38,
        borderRadius: 10,
        paddingHorizontal: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
    },
    sendCredentialBtnText: {
        color: "white",
        fontSize: 13,
        fontWeight: "700",
    },

    memberCard: {
        borderRadius: 12,
        padding: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    memberTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
    },
    memberRoleBadge: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    memberRoleBadgeText: {
        fontSize: 10,
        fontWeight: "700",
    },
    memberName: { fontSize: 14, fontWeight: "700" },
    memberMeta: { fontSize: 11, marginTop: 2 },
    connectedHouseholdCard: {
        borderRadius: 12,
        padding: 10,
    },
    connectedHouseholdLabel: {
        fontSize: 12,
        fontWeight: "700",
        textTransform: "uppercase",
        marginBottom: 4,
    },
    connectedHouseholdName: {
        fontSize: 16,
        fontWeight: "700",
        marginBottom: 8,
    },
    connectedHouseholdPrimaryBtn: {
        minHeight: 44,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
    },
    connectedHouseholdPrimaryText: {
        color: "white",
        fontSize: 14,
        fontWeight: "700",
    },
    connectedHouseholdSecondaryBtn: {
        minHeight: 44,
        borderRadius: 10,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
    },
    connectedHouseholdSecondaryText: {
        fontSize: 14,
        fontWeight: "700",
    },
    connectedHouseholdDangerBtn: {
        minHeight: 40,
        borderRadius: 10,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 10,
        alignSelf: "flex-start",
    },
    connectedHouseholdDangerText: {
        fontSize: 13,
        fontWeight: "700",
    },
    connectedCodeInfo: {
        borderWidth: 1,
        borderRadius: 10,
        padding: 10,
        marginTop: 10,
    },
    connectedCodeLabel: {
        fontSize: 12,
        fontWeight: "700",
        marginBottom: 2,
    },
    connectedCodeValue: {
        fontSize: 20,
        fontWeight: "800",
        letterSpacing: 1,
        marginBottom: 4,
    },
    templateCard: {
        borderRadius: 12,
        padding: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    templateName: { fontSize: 14, fontWeight: "700" },

    moduleContainer: {
        borderRadius: 12,
        marginBottom: 10,
        overflow: "hidden",
    },
    moduleCard: {
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
    },
    moduleIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
    },
    moduleLabel: { fontSize: 15, fontWeight: "600" },

    subConfigBox: {
        paddingHorizontal: 12,
        paddingBottom: 12,
        paddingTop: 2,
    },
    budgetChildCard: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 8,
    },
    budgetCompactInput: {
        height: 42,
        borderRadius: 10,
        borderWidth: 1,
        paddingHorizontal: 12,
        marginBottom: 6,
        fontSize: 14,
    },
    budgetRecurrenceRow: {
        flexDirection: "row",
        gap: 8,
        marginBottom: 6,
    },
    budgetChoiceBtn: {
        flex: 1,
        minHeight: 36,
        borderRadius: 10,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 8,
    },
    budgetChoiceText: {
        fontSize: 12,
        fontWeight: "700",
    },
    budgetSaveBtn: {
        minHeight: 38,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 10,
    },
    budgetSaveBtnText: {
        color: "white",
        fontSize: 13,
        fontWeight: "700",
    },
    mealFeatureRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
    },
    mealFeatureControls: {
        flexDirection: "row",
        alignItems: "center",
    },
    mealChevronSpacer: {
        width: 28,
        marginLeft: 8,
    },
    mealSectionBox: {
        borderRadius: 12,
        padding: 10,
        marginBottom: 12,
    },
    switchRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
    },
    daysContainer: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
    dayChip: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
    },
    durationBtn: {
        flex: 1,
        height: 42,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center",
    },
    wizardActionsRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    wizardPrimaryBtn: {
        flex: 1,
        minHeight: 48,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    wizardPrimaryBtnText: {
        color: "#FFFFFF",
        fontSize: 15,
        fontWeight: "700",
    },
    wizardSecondaryBtn: {
        minHeight: 48,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
    },
    wizardSecondaryBtnText: {
        fontSize: 15,
        fontWeight: "600",
    },

    submitButton: {
        height: 56,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 10,
    },
    submitButtonText: { color: "white", fontSize: 18, fontWeight: "bold" },
});



