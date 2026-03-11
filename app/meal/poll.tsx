
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Swipeable } from "react-native-gesture-handler";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";
import { filterRecipesByTitleQuery } from "@/src/features/recipes/recipe-search";
import {
  addIngredientsToShoppingList,
  buildShoppingIngredientsFromRecipeSelections,
  createShoppingList,
  defaultShoppingListTitle,
  loadShoppingLists,
  resolvePreferredShoppingListId,
  type ShoppingListSummary,
} from "@/src/features/shopping-list/list-utils";
import { ShoppingListPickerModal } from "@/src/features/shopping-list/shopping-list-picker-modal";
import { subscribeToHouseholdRealtime } from "@/src/realtime/client";
import { getStoredUser } from "@/src/session/user-cache";
import { addDaysFromIso, addDaysIso, parseOptionalIsoDate, toIsoDate, todayIso } from "@/src/utils/date";

type Recipe = {
  id: number;
  title: string;
  type?: string;
  description?: string | null;
};

type PollOption = {
  id: number;
  recipe_id: number;
  votes_count: number;
  is_voted_by_me: boolean;
  voters?: { user_id: number; name: string }[];
  recipe: Recipe;
};

type Poll = {
  id: number;
  status: "open" | "closed" | "validated";
  title?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  planning_start_date?: string | null;
  planning_end_date?: string | null;
  max_votes_per_user: number;
  my_votes_count: number;
  my_voted_option_ids?: number[];
  voters_summary: { user_id: number; name: string; votes_count: number }[];
  options: PollOption[];
};

type MealType = "matin" | "midi" | "soir";

type MealPlanAssignment = {
  slotKey: string;
  date: string;
  meal_type: MealType;
  recipe_id: number;
  servings: number;
};

const MEAL_TYPES: { label: string; value: MealType }[] = [
  { label: "Matin", value: "matin" },
  { label: "Midi", value: "midi" },
  { label: "Soir", value: "soir" },
];

const MEAL_TYPE_SORT: Record<MealType, number> = {
  matin: 0,
  midi: 1,
  soir: 2,
};

const PLANNING_WEEKDAYS = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const monthLabel = (date: Date) =>
  date.toLocaleDateString("fr-BE", { month: "long", year: "numeric" });

const buildMonthCells = (monthDate: Date) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (firstDay.getDay() + 6) % 7;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < offset; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

const formatDateTime = (iso?: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("fr-BE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const formatMealPlanDate = (isoDate: string) => {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;

  const dayName = date.toLocaleDateString("fr-BE", { weekday: "long" });
  const shortDate = date.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit" });
  return `${dayName} ${shortDate}`;
};

const buildWeekSlots = (startIso?: string | null, endIso?: string | null) => {
  const fallbackStart = todayIso();
  const fallbackEnd = addDaysIso(6);

  const parsedStart = parseOptionalIsoDate(startIso);
  const parsedEnd = parseOptionalIsoDate(endIso);

  let start = parsedStart ? new Date(parsedStart) : new Date(`${fallbackStart}T00:00:00`);
  let end = parsedEnd ? new Date(parsedEnd) : new Date(`${fallbackEnd}T00:00:00`);

  if (end < start) {
    const tmp = start;
    start = end;
    end = tmp;
  }

  const slots: { date: string; label: string }[] = [];
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 31) {
    const date = toIsoDate(cursor);
    slots.push({
      date,
      label: formatMealPlanDate(date),
    });
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }

  if (slots.length === 0) {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDaysIso(index);
      return {
        date,
        label: formatMealPlanDate(date),
      };
    });
  }

  return slots;
};

export default function MealPollScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const [isParent, setIsParent] = useState(false);
  const [householdId, setHouseholdId] = useState<number | null>(null);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [activePoll, setActivePoll] = useState<Poll | null>(null);

  const [pollTitle, setPollTitle] = useState("");
  const [durationHours, setDurationHours] = useState(24);
  const [maxVotesPerUser, setMaxVotesPerUser] = useState(3);
  const [planningStartDate, setPlanningStartDate] = useState(todayIso());
  const [planningEndDate, setPlanningEndDate] = useState(addDaysIso(6));
  const [planningPickerVisible, setPlanningPickerVisible] = useState(false);
  const [planningPickerTarget, setPlanningPickerTarget] = useState<"start" | "end">("start");
  const [planningPickerMonth, setPlanningPickerMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [searchRecipe, setSearchRecipe] = useState("");
  const [selectedRecipeIdsForCreation, setSelectedRecipeIdsForCreation] = useState<number[]>([]);

  const [manualTitle, setManualTitle] = useState("");
  const [aiPreview, setAiPreview] = useState<any | null>(null);

  const [draftVoteOptionIds, setDraftVoteOptionIds] = useState<number[]>([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const successAnim = useRef(new Animated.Value(0)).current;
  const createDefaultsAppliedRef = useRef(false);

  const [selectedRecipeIdsForValidation, setSelectedRecipeIdsForValidation] = useState<number[]>([]);
  const [mealPlanAssignments, setMealPlanAssignments] = useState<Record<string, MealPlanAssignment>>({});
  const [validationSearchRecipe, setValidationSearchRecipe] = useState("");
  const [validationManualTitle, setValidationManualTitle] = useState("");
  const [showPollBuilder, setShowPollBuilder] = useState(false);

  const [plannerVisible, setPlannerVisible] = useState(false);
  const [plannerRecipeId, setPlannerRecipeId] = useState<number | null>(null);
  const [plannerDate, setPlannerDate] = useState(todayIso());
  const [plannerMealType, setPlannerMealType] = useState<MealType>("soir");
  const [defaultServings, setDefaultServings] = useState(4);
  const [plannerServings, setPlannerServings] = useState(4);
  const [shoppingPickerVisible, setShoppingPickerVisible] = useState(false);
  const [shoppingLists, setShoppingLists] = useState<ShoppingListSummary[]>([]);
  const [selectedShoppingListId, setSelectedShoppingListId] = useState<number | null>(null);
  const [useNewShoppingList, setUseNewShoppingList] = useState(false);
  const [newShoppingListTitle, setNewShoppingListTitle] = useState(defaultShoppingListTitle());
  const [selectedAssignmentKeysForShopping, setSelectedAssignmentKeysForShopping] = useState<string[]>([]);

  const recipesById = useMemo(() => {
    const map = new Map<number, Recipe>();
    recipes.forEach((recipe) => map.set(recipe.id, recipe));
    return map;
  }, [recipes]);

  const filteredCreationRecipes = useMemo(() => {
    if (searchRecipe.trim().length === 0) return [];
    return filterRecipesByTitleQuery(recipes, searchRecipe);
  }, [recipes, searchRecipe]);

  const filteredValidationRecipes = useMemo(() => {
    return filterRecipesByTitleQuery(recipes, validationSearchRecipe);
  }, [recipes, validationSearchRecipe]);

  const selectedCreationRecipes = useMemo(
    () => selectedRecipeIdsForCreation.map((id) => recipesById.get(id)).filter(Boolean) as Recipe[],
    [recipesById, selectedRecipeIdsForCreation]
  );

  const closedRanking = useMemo(() => {
    if (!activePoll) return [] as PollOption[];
    return [...activePoll.options].sort((a, b) => b.votes_count - a.votes_count);
  }, [activePoll]);

  const sortedAssignments = useMemo(() => {
    return Object.values(mealPlanAssignments).sort((a, b) => {
      const dateComp = a.date.localeCompare(b.date);
      if (dateComp !== 0) return dateComp;
      return MEAL_TYPE_SORT[a.meal_type] - MEAL_TYPE_SORT[b.meal_type];
    });
  }, [mealPlanAssignments]);
  const planningMonthCells = useMemo(() => buildMonthCells(planningPickerMonth), [planningPickerMonth]);

  const voteLimit = activePoll?.max_votes_per_user ?? maxVotesPerUser;
  const canSubmitVotes = !!activePoll && activePoll.status === "open" && draftVoteOptionIds.length === voteLimit;

  const load = useCallback(async (options?: { silent?: boolean; showError?: boolean }) => {
    const silent = options?.silent ?? false;
    const showError = options?.showError ?? !silent;

    if (!silent) {
      setLoading(true);
    }

    try {
      const user = await getStoredUser();

      const hid = user?.household_id ?? user?.households?.[0]?.id ?? null;
      const role = user?.households?.[0]?.pivot?.role ?? user?.role;

      setHouseholdId(hid);
      setIsParent(role === "parent");

      let configuredDuration = 24;
      let configuredMaxVotes = 3;
      let configuredDefaultServings = 4;

      if (role === "parent") {
        try {
          const configResponse = await apiFetch("/households/config");
          const mealsSettings = configResponse?.config?.modules?.meals?.settings ?? {};

          configuredDuration = Number.isInteger(mealsSettings?.poll_duration)
            ? clamp(Number(mealsSettings.poll_duration), 1, 168)
            : 24;
          configuredMaxVotes = Number.isInteger(mealsSettings?.max_votes_per_user)
            ? clamp(Number(mealsSettings.max_votes_per_user), 1, 20)
            : 3;
          configuredDefaultServings = Number.isInteger(mealsSettings?.default_servings)
            ? clamp(Number(mealsSettings.default_servings), 1, 30)
            : 4;
          setDefaultServings(configuredDefaultServings);
        } catch {
          setDefaultServings(4);
        }
      } else {
        setDefaultServings(4);
      }

      const [recipesResponse, pollResponse] = await Promise.all([apiFetch("/recipes"), apiFetch("/meal-polls/active")]);
      const fetchedRecipes = Array.isArray(recipesResponse) ? recipesResponse : [];
      const poll: Poll | null = pollResponse?.poll ?? null;

      setRecipes(fetchedRecipes);
      setActivePoll(poll);

      if (poll) {
        createDefaultsAppliedRef.current = false;
      } else if (role === "parent" && !createDefaultsAppliedRef.current) {
        setDurationHours(configuredDuration);
        setMaxVotesPerUser(configuredMaxVotes);
        setPlanningStartDate(todayIso());
        setPlanningEndDate(addDaysIso(6));
        createDefaultsAppliedRef.current = true;
      }

      if (poll?.status === "open") {
        const mineFromPayload = Array.isArray(poll.my_voted_option_ids)
          ? poll.my_voted_option_ids
          : poll.options.filter((option) => option.is_voted_by_me).map((option) => option.id);
        setDraftVoteOptionIds(mineFromPayload);
      }

      if (poll?.status === "closed" && role === "parent") {
        const defaultSelection = [...poll.options]
          .filter((option) => option.votes_count > 0)
          .sort((a, b) => b.votes_count - a.votes_count)
          .map((option) => option.recipe_id);

        const fallback = defaultSelection.length > 0 ? defaultSelection : poll.options.slice(0, 3).map((option) => option.recipe_id);
        setSelectedRecipeIdsForValidation(fallback);

        setMealPlanAssignments((prev) => {
          if (Object.keys(prev).length > 0) return prev;

          const next: Record<string, MealPlanAssignment> = {};
          const basePlanningDate = poll.planning_start_date ?? todayIso();
          fallback.slice(0, 3).forEach((recipeId, index) => {
            const date = addDaysFromIso(basePlanningDate, index);
            const slotKey = `${date}_soir`;
            next[slotKey] = {
              slotKey,
              date,
              meal_type: "soir",
              recipe_id: recipeId,
              servings: configuredDefaultServings,
            };
          });

          return next;
        });
      }
    } catch (error: any) {
      if (showError) {
        Alert.alert("Sondage", error?.message || "Impossible de charger les données.");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load({ silent: false, showError: true });
    }, [load])
  );

  useEffect(() => {
    if (!householdId) {
      return;
    }

    let isMounted = true;
    let unsubscribeRealtime: (() => void) | null = null;
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;

    const bindRealtime = async () => {
      unsubscribeRealtime = await subscribeToHouseholdRealtime(householdId, (message) => {
        if (!isMounted) return;
        if (message?.module !== "meal_poll") return;

        if (reloadTimer) {
          clearTimeout(reloadTimer);
        }

        reloadTimer = setTimeout(() => {
          if (!isMounted) return;
          void load({ silent: true, showError: false });
        }, 150);
      });
    };

    void bindRealtime();

    return () => {
      isMounted = false;
      if (reloadTimer) {
        clearTimeout(reloadTimer);
      }
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
      }
    };
  }, [householdId, load]);

  useEffect(() => {
    if (activePoll?.status !== "open") return;
    const mineFromPayload = Array.isArray(activePoll.my_voted_option_ids)
      ? activePoll.my_voted_option_ids
      : activePoll.options.filter((option) => option.is_voted_by_me).map((option) => option.id);

    setDraftVoteOptionIds(mineFromPayload);
  }, [activePoll?.id, activePoll?.status, activePoll?.my_votes_count, activePoll?.my_voted_option_ids, activePoll?.options]);

  const runLimitShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  };

  const runVoteSuccess = () => {
    successAnim.setValue(0);
    Animated.timing(successAnim, {
      toValue: 1,
      duration: 650,
      useNativeDriver: true,
    }).start(() => {
      successAnim.setValue(0);
    });
  };

  const toggleCreateRecipe = (recipeId: number) => {
    setSelectedRecipeIdsForCreation((prev) =>
      prev.includes(recipeId) ? prev.filter((id) => id !== recipeId) : [...prev, recipeId]
    );
  };

  const removeCreateRecipe = (recipeId: number) => {
    setSelectedRecipeIdsForCreation((prev) => prev.filter((id) => id !== recipeId));
  };

  const openPlanningPicker = (target: "start" | "end") => {
    const sourceIso = target === "start" ? planningStartDate : planningEndDate;
    const sourceDate = parseOptionalIsoDate(sourceIso) ?? new Date();
    setPlanningPickerTarget(target);
    setPlanningPickerMonth(new Date(sourceDate.getFullYear(), sourceDate.getMonth(), 1));
    setPlanningPickerVisible(true);
  };

  const shiftPlanningPickerMonth = (offset: number) => {
    setPlanningPickerMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const selectPlanningDate = (date: Date) => {
    const iso = toIsoDate(date);
    if (planningPickerTarget === "start") {
      setPlanningStartDate(iso);
      const endDate = parseOptionalIsoDate(planningEndDate);
      if (endDate && endDate < date) {
        setPlanningEndDate(iso);
      }
    } else {
      setPlanningEndDate(iso);
      const startDate = parseOptionalIsoDate(planningStartDate);
      if (startDate && startDate > date) {
        setPlanningStartDate(iso);
      }
    }
    setPlanningPickerVisible(false);
  };

  const openPollBuilderForEdit = useCallback((poll: Poll) => {
    const recipeIds = poll.options.map((option) => option.recipe_id);
    const startsAt = poll.starts_at ? new Date(poll.starts_at) : null;
    const endsAt = poll.ends_at ? new Date(poll.ends_at) : null;
    const hasValidDates = startsAt && endsAt && !Number.isNaN(startsAt.getTime()) && !Number.isNaN(endsAt.getTime());
    const durationFromDates = hasValidDates
      ? clamp(Math.round(((endsAt as Date).getTime() - (startsAt as Date).getTime()) / (1000 * 60 * 60)), 1, 168)
      : 24;

    setPollTitle(poll.title ?? "");
    setDurationHours(durationFromDates);
    setMaxVotesPerUser(clamp(Number(poll.max_votes_per_user || 3), 1, 20));
    setPlanningStartDate(poll.planning_start_date || todayIso());
    setPlanningEndDate(poll.planning_end_date || addDaysIso(6));
    setSelectedRecipeIdsForCreation(recipeIds);
    setSearchRecipe("");
    setManualTitle("");
    setAiPreview(null);
    setShowPollBuilder(true);
  }, []);

  const savePoll = async () => {
    if (selectedRecipeIdsForCreation.length < 2) {
      Alert.alert("Sondage", "Sélectionne au moins 2 plats.");
      return;
    }

    const selectedCount = selectedRecipeIdsForCreation.length;
    const clampedMaxVotesPerUser = clamp(maxVotesPerUser, 1, 20);
    if (clampedMaxVotesPerUser > selectedCount) {
      Alert.alert("Sondage", "Le nombre de votes par personne ne peut pas dépasser le nombre de plats selectionnés.");
      return;
    }

    const startDate = planningStartDate.trim();
    const endDate = planningEndDate.trim();
    const parsedStartDate = parseOptionalIsoDate(startDate);
    const parsedEndDate = parseOptionalIsoDate(endDate);

    if (!parsedStartDate || !parsedEndDate) {
      Alert.alert("Sondage", "Renseigne une date de début et de fin valides (YYYY-MM-DD).");
      return;
    }

    if (parsedEndDate < parsedStartDate) {
      Alert.alert("Sondage", "La date de fin doit être postérieure à la date de début.");
      return;
    }

    setSaving(true);
    try {
      const isEditingOpenPoll = Boolean(showPollBuilder && activePoll && activePoll.status === "open");
      const payload = {
        title: pollTitle.trim() || null,
        recipe_ids: selectedRecipeIdsForCreation,
        planning_start_date: startDate,
        planning_end_date: endDate,
        duration_hours: clamp(durationHours, 1, 168),
        max_votes_per_user: clampedMaxVotesPerUser,
      };

      const response = await apiFetch(isEditingOpenPoll ? `/meal-polls/${activePoll?.id}` : "/meal-polls", {
        method: isEditingOpenPoll ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });

      const poll: Poll | null = response?.poll ?? null;
      setActivePoll(poll);

      if (poll?.status === "open") {
        const mineFromPayload = Array.isArray(poll.my_voted_option_ids)
          ? poll.my_voted_option_ids
          : poll.options.filter((option) => option.is_voted_by_me).map((option) => option.id);
        setDraftVoteOptionIds(mineFromPayload);
      }
      setShowPollBuilder(false);
      setSearchRecipe("");
      setManualTitle("");
      setAiPreview(null);

      Alert.alert("Sondage", isEditingOpenPoll ? "Sondage modifié." : "Sondage ouvert.");
    } catch (error: any) {
      Alert.alert("Sondage", error?.message || "Impossible d'enregistrer ce sondage.");
    } finally {
      setSaving(false);
    }
  };

  const saveManualRecipeForCreation = async () => {
    const title = manualTitle.trim();
    if (!title) {
      Alert.alert("Recette", "Donne un titre au plat manuel.");
      return;
    }

    setSaving(true);
    try {
      const recipe = await apiFetch("/recipes", {
        method: "POST",
        body: JSON.stringify({
          title,
          type: "plat principal",
          description: "Ajout manuel depuis création du sondage",
          instructions: "A compléter",
          base_servings: 1,
          ingredients: [{ name: "ingredient", quantity: 1, unit: "unite" }],
        }),
      });

      setRecipes((prev) => [recipe, ...prev]);
      setSelectedRecipeIdsForCreation((prev) => (prev.includes(recipe.id) ? prev : [...prev, recipe.id]));
      setManualTitle("");
    } catch (error: any) {
      Alert.alert("Recette", error?.message || "Impossible d'ajouter ce plat.");
    } finally {
      setSaving(false);
    }
  };

  const previewAiRecipe = async () => {
    const title = manualTitle.trim();
    if (!title) {
      Alert.alert("IA", "Indique d'abord un nom de plat.");
      return;
    }

    setAiLoading(true);
    try {
      const preview = await apiFetch("/recipes/preview-ai", {
        method: "POST",
        body: JSON.stringify({ title }),
      });
      setAiPreview(preview);
    } catch (error: any) {
      Alert.alert("IA", error?.message || "Impossible de générer la recette IA.");
    } finally {
      setAiLoading(false);
    }
  };

  const saveAiRecipe = async () => {
    if (!aiPreview || !householdId) return;

    setSaving(true);
    try {
      const ingredients = Array.isArray(aiPreview.ingredients) ? aiPreview.ingredients : [];

      const recipe = await apiFetch("/recipes/ai-store", {
        method: "POST",
        body: JSON.stringify({
          ...aiPreview,
          household_id: householdId,
          type: String(aiPreview.type ?? "plat principal"),
          description: String(aiPreview.description ?? ""),
          instructions: String(aiPreview.instructions ?? ""),
          ingredients: ingredients.map((ing: any) => ({
            name: String(ing?.name ?? "ingredient").trim(),
            quantity: Number(ing?.quantity ?? 1),
            unit: String(ing?.unit ?? "unite"),
            category: String(ing?.category ?? "autre"),
          })),
        }),
      });

      setRecipes((prev) => [recipe, ...prev]);
      setSelectedRecipeIdsForCreation((prev) => (prev.includes(recipe.id) ? prev : [...prev, recipe.id]));
      setAiPreview(null);
      setManualTitle("");
      Alert.alert("IA", "Recette IA enregistrée.");
    } catch (error: any) {
      Alert.alert("IA", error?.message || "Impossible d'enregistrer la recette IA.");
    } finally {
      setSaving(false);
    }
  };

  const toggleDraftVote = (optionId: number) => {
    if (!activePoll || activePoll.status !== "open") return;

    setDraftVoteOptionIds((prev) => {
      if (prev.includes(optionId)) {
        return prev.filter((id) => id !== optionId);
      }

      if (prev.length >= activePoll.max_votes_per_user) {
        runLimitShake();
        return prev;
      }

      return [...prev, optionId];
    });
  };

  const submitVotes = async () => {
    if (!activePoll || activePoll.status !== "open") return;

    if (draftVoteOptionIds.length !== activePoll.max_votes_per_user) {
      Alert.alert("Vote", `Sélectionne exactement ${activePoll.max_votes_per_user} plats.`);
      runLimitShake();
      return;
    }

    setSaving(true);
    try {
      const response = await apiFetch(`/meal-polls/${activePoll.id}/votes/sync`, {
        method: "POST",
        body: JSON.stringify({ option_ids: draftVoteOptionIds }),
      });

      setActivePoll(response?.poll ?? null);
      runVoteSuccess();
      Alert.alert("Vote", "Ton vote est enregistré.");
    } catch (error: any) {
      Alert.alert("Vote", error?.message || "Impossible d'enregistrer le vote.");
    } finally {
      setSaving(false);
    }
  };

  const closePoll = async () => {
    if (!activePoll) return;

    setSaving(true);
    try {
      const response = await apiFetch(`/meal-polls/${activePoll.id}/close`, {
        method: "POST",
      });

      const poll: Poll | null = response?.poll ?? null;
      setActivePoll(poll);

      if (poll?.status === "closed") {
        const defaults = [...poll.options]
          .filter((option) => option.votes_count > 0)
          .sort((a, b) => b.votes_count - a.votes_count)
          .map((option) => option.recipe_id);

        setSelectedRecipeIdsForValidation(defaults);
      }

      Alert.alert("Sondage", "Sondage clôturé.");
    } catch (error: any) {
      Alert.alert("Sondage", error?.message || "Impossible de clôturer le sondage.");
    } finally {
      setSaving(false);
    }
  };

  const confirmClosePoll = () => {
    if (!activePoll) {
      return;
    }

    const totalVotes = activePoll.options.reduce((sum, option) => sum + Number(option.votes_count || 0), 0);
    if (totalVotes > 0) {
      void closePoll();
      return;
    }

    Alert.alert(
      "Clôturer le sondage",
      "Il n'y a aucun vote pour ce sondage, clôturer ?",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Confirmer", style: "destructive", onPress: () => void closePoll() },
      ]
    );
  };

  const handleBackArrow = () => {
    if (!isParent) {
      router.replace("/(tabs)/meal");
      return;
    }

    if (activePoll?.status === "open" && showPollBuilder) {
      setShowPollBuilder(false);
      return;
    }

    router.replace("/(tabs)/meal");
  };

  const openPlanner = (recipeId: number) => {
    setPlannerRecipeId(recipeId);
    const plannerStartDate = activePoll?.planning_start_date && parseOptionalIsoDate(activePoll.planning_start_date)
      ? activePoll.planning_start_date
      : (parseOptionalIsoDate(planningStartDate) ? planningStartDate : todayIso());
    setPlannerDate(plannerStartDate);
    setPlannerMealType("soir");
    setPlannerServings(defaultServings);
    setPlannerVisible(true);
  };

  const assignRecipeToSlot = () => {
    if (!plannerRecipeId) return;

    const slotKey = `${plannerDate}_${plannerMealType}`;

    setMealPlanAssignments((prev) => ({
      ...prev,
      [slotKey]: {
        slotKey,
        date: plannerDate,
        meal_type: plannerMealType,
        recipe_id: plannerRecipeId,
        servings: clamp(plannerServings, 1, 30),
      },
    }));

    setSelectedRecipeIdsForValidation((prev) =>
      prev.includes(plannerRecipeId) ? prev : [...prev, plannerRecipeId]
    );

    setPlannerVisible(false);
  };

  const removeAssignment = (slotKey: string) => {
    setMealPlanAssignments((prev) => {
      const next = { ...prev };
      delete next[slotKey];
      return next;
    });
  };

  const openPollShoppingListPicker = async () => {
    if (!isParent || saving) {
      return;
    }

    if (sortedAssignments.length === 0) {
      Alert.alert("Liste de courses", "Planifie au moins un repas avant d'ajouter des ingrédients.");
      return;
    }

    setSaving(true);
    try {
      const payload = await loadShoppingLists();
      if (!payload.can_manage) {
        Alert.alert("Liste de courses", "Seul un parent peut modifier la liste de courses.");
        return;
      }

      setShoppingLists(payload.lists);
      setSelectedShoppingListId(resolvePreferredShoppingListId(payload.lists));
      setUseNewShoppingList(payload.lists.length === 0);
      setNewShoppingListTitle(defaultShoppingListTitle());
      setSelectedAssignmentKeysForShopping(sortedAssignments.map((assignment) => assignment.slotKey));
      setShoppingPickerVisible(true);
    } catch (error: any) {
      Alert.alert("Liste de courses", error?.message || "Impossible de charger les listes de courses.");
    } finally {
      setSaving(false);
    }
  };

  const closePollShoppingListPicker = () => {
    if (saving) return;
    setShoppingPickerVisible(false);
  };

  const toggleAssignmentForShopping = (slotKey: string) => {
    setSelectedAssignmentKeysForShopping((prev) =>
      prev.includes(slotKey) ? prev.filter((key) => key !== slotKey) : [...prev, slotKey]
    );
  };

  const confirmPollShoppingListSelection = async () => {
    const selectedAssignments = sortedAssignments.filter((assignment) =>
      selectedAssignmentKeysForShopping.includes(assignment.slotKey)
    );

    if (selectedAssignments.length === 0) {
      Alert.alert("Liste de courses", "Sélectionne au moins un repas planifié.");
      return;
    }

    setSaving(true);
    try {
      let targetListId = selectedShoppingListId;
      let targetListTitle = shoppingLists.find((list) => list.id === selectedShoppingListId)?.title ?? "";

      if (useNewShoppingList) {
        const created = await createShoppingList(newShoppingListTitle);
        if (!created?.id) {
          Alert.alert("Liste de courses", "Impossible de créer la nouvelle liste.");
          return;
        }
        targetListId = created.id;
        targetListTitle = created.title;
      }

      if (!targetListId) {
        Alert.alert("Liste de courses", "Choisis une liste existante ou crée-en une nouvelle.");
        return;
      }

      const recipeSelections = selectedAssignments.map((assignment) => ({
        recipeId: assignment.recipe_id,
        servings: clamp(Number(assignment.servings) || 1, 1, 30),
      }));
      const ingredients = await buildShoppingIngredientsFromRecipeSelections(recipeSelections);

      if (ingredients.length === 0) {
        Alert.alert("Liste de courses", "Aucun ingrédient exploitable à ajouter.");
        return;
      }

      const addedCount = await addIngredientsToShoppingList(targetListId, ingredients);
      setShoppingPickerVisible(false);

      Alert.alert(
        "Liste de courses",
        `${addedCount} ingrédient(s) ajouté(s) à "${targetListTitle}".`,
        [
          { text: "Fermer", style: "cancel" },
          { text: "Voir la liste", onPress: () => router.push(`/meal/shopping-list/${targetListId}`) },
        ]
      );
    } catch (error: any) {
      Alert.alert("Liste de courses", error?.message || "Impossible d'ajouter les ingrédients sélectionnés.");
    } finally {
      setSaving(false);
    }
  };

  const addExistingRecipeToValidation = (recipeId: number) => {
    setSelectedRecipeIdsForValidation((prev) => (prev.includes(recipeId) ? prev : [...prev, recipeId]));
    setValidationSearchRecipe("");
    openPlanner(recipeId);
  };

  const addManualValidationRecipe = async () => {
    const title = validationManualTitle.trim();
    if (!title) {
      Alert.alert("Validation", "Donne un nom au repas à ajouter.");
      return;
    }

    setSaving(true);
    try {
      const recipe = await apiFetch("/recipes", {
        method: "POST",
        body: JSON.stringify({
          title,
          type: "plat principal",
          description: "Ajoutée lors de la validation du sondage",
          instructions: "A compléter",
          base_servings: 1,
          ingredients: [{ name: "ingredient", quantity: 1, unit: "unite" }],
        }),
      });

      setRecipes((prev) => [recipe, ...prev]);
      setSelectedRecipeIdsForValidation((prev) => (prev.includes(recipe.id) ? prev : [...prev, recipe.id]));
      setValidationManualTitle("");
      openPlanner(recipe.id);
    } catch (error: any) {
      Alert.alert("Validation", error?.message || "Impossible d'ajouter cette recette.");
    } finally {
      setSaving(false);
    }
  };

  const validatePoll = async () => {
    if (!activePoll) return;

    const mealPlan = sortedAssignments.map((entry) => ({
      recipe_id: entry.recipe_id,
      date: entry.date,
      meal_type: entry.meal_type,
      servings: entry.servings,
    }));

    const selectedRecipeIds = Array.from(
      new Set([...selectedRecipeIdsForValidation, ...mealPlan.map((entry) => entry.recipe_id)])
    );

    if (selectedRecipeIds.length === 0) {
      Alert.alert("Validation", "Sélectionne au moins une recette.");
      return;
    }

    if (mealPlan.length === 0) {
      Alert.alert("Validation", "Assigne au moins un repas dans le menu de la semaine.");
      return;
    }

    setSaving(true);
    try {
      const response = await apiFetch(`/meal-polls/${activePoll.id}/validate`, {
        method: "POST",
        body: JSON.stringify({
          selected_recipe_ids: selectedRecipeIds,
          meal_plan: mealPlan,
        }),
      });

      const selectedFromApi = Array.isArray(response?.selected_recipe_ids)
        ? response.selected_recipe_ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
        : selectedRecipeIds;

      setSelectedRecipeIdsForValidation(selectedFromApi);
      setActivePoll(response?.poll ?? null);

      Alert.alert("Validation", "Sondage validé et menu de la semaine enregistré.");
    } catch (error: any) {
      Alert.alert("Validation", error?.message || "Impossible de valider le sondage.");
    } finally {
      setSaving(false);
    }
  };

  const renderCreateView = () => {
    const isEditingOpenPoll = Boolean(isParent && activePoll?.status === "open" && showPollBuilder);

    return (
      <View style={[styles.card, { backgroundColor: theme.card }]}> 
        <Text style={[styles.cardTitle, { color: theme.text }]}>
          {isEditingOpenPoll ? "Modifier le sondage ouvert" : "Créer le sondage de la semaine"}
        </Text>
        {isEditingOpenPoll ? (
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>
            Corrige les paramètres puis enregistre les modifications.
          </Text>
        ) : null}

        <TextInput
          style={[styles.input, { backgroundColor: theme.background, color: theme.text, marginTop: 12 }]}
          value={pollTitle}
          onChangeText={setPollTitle}
          placeholder="Titre du sondage (optionnel)"
          placeholderTextColor={theme.textSecondary}
        />

        <View style={[styles.settingsGrid, { marginTop: 6 }]}> 
          <View style={[styles.settingCard, { borderColor: theme.icon, backgroundColor: theme.background }]}> 
            <Text style={[styles.settingLabel, { color: theme.text }]}>Durée (heures)</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                onPress={() => setDurationHours((prev) => clamp(prev - 1, 1, 168))}
                style={[styles.stepperBtn, { borderColor: theme.icon }]}
              >
                <MaterialCommunityIcons name="minus" size={18} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.stepperValue, { color: theme.text }]}>{durationHours}</Text>
              <TouchableOpacity
                onPress={() => setDurationHours((prev) => clamp(prev + 1, 1, 168))}
                style={[styles.stepperBtn, { borderColor: theme.icon }]}
              >
                <MaterialCommunityIcons name="plus" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.settingCard, { borderColor: theme.icon, backgroundColor: theme.background }]}> 
            <Text style={[styles.settingLabel, { color: theme.text }]}>Nombre de votes</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                onPress={() => setMaxVotesPerUser((prev) => clamp(prev - 1, 1, 20))}
                style={[styles.stepperBtn, { borderColor: theme.icon }]}
              >
                <MaterialCommunityIcons name="minus" size={18} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.stepperValue, { color: theme.text }]}>{maxVotesPerUser}</Text>
              <TouchableOpacity
                onPress={() => setMaxVotesPerUser((prev) => clamp(prev + 1, 1, 20))}
                style={[styles.stepperBtn, { borderColor: theme.icon }]}
              >
                <MaterialCommunityIcons name="plus" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>Période de planification</Text>
        <View style={styles.planningDatesRow}>
          <TouchableOpacity
            onPress={() => openPlanningPicker("start")}
            style={[styles.planningDateBtn, { backgroundColor: theme.background, borderColor: theme.icon }]}
          >
            <MaterialCommunityIcons name="calendar-month-outline" size={18} color={theme.textSecondary} />
            <Text style={[styles.planningDateBtnText, { color: theme.text }]} numberOfLines={1}>
              {planningStartDate}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => openPlanningPicker("end")}
            style={[styles.planningDateBtn, { backgroundColor: theme.background, borderColor: theme.icon }]}
          >
            <MaterialCommunityIcons name="calendar-month-outline" size={18} color={theme.textSecondary} />
            <Text style={[styles.planningDateBtnText, { color: theme.text }]} numberOfLines={1}>
              {planningEndDate}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>Rechercher dans mon répertoire</Text>
        <View style={[styles.searchBox, { borderColor: theme.icon, backgroundColor: theme.background }]}> 
          <MaterialCommunityIcons name="magnify" size={20} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            value={searchRecipe}
            onChangeText={setSearchRecipe}
            placeholder="Chercher une recette..."
            placeholderTextColor={theme.textSecondary}
          />
        </View>

        {searchRecipe.trim().length > 0 ? (
          <>
            <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>Résultats de recherche</Text>
            {filteredCreationRecipes.length > 0 ? (
              <View style={styles.recipeGrid}>
                {filteredCreationRecipes.slice(0, 12).map((recipe) => {
                  const selected = selectedRecipeIdsForCreation.includes(recipe.id);
                  return (
                    <TouchableOpacity
                      key={`grid-${recipe.id}`}
                      onPress={() => toggleCreateRecipe(recipe.id)}
                      style={[
                        styles.recipeCard,
                        { borderColor: theme.icon, backgroundColor: theme.background },
                        selected && { borderColor: theme.tint, backgroundColor: `${theme.tint}14` },
                      ]}
                    >
                      <View style={[styles.recipeIcon, { backgroundColor: `${theme.tint}1A` }]}> 
                        <MaterialCommunityIcons name="silverware-fork-knife" size={18} color={theme.tint} />
                      </View>
                      <Text style={{ color: theme.text, fontWeight: "600" }} numberOfLines={2}>{recipe.title}</Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 12 }} numberOfLines={1}>{recipe.type || "autre"}</Text>
                      <MaterialCommunityIcons
                        name={selected ? "check-circle" : "plus-circle-outline"}
                        size={20}
                        color={selected ? theme.tint : theme.textSecondary}
                        style={styles.recipePickIcon}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={[styles.suggestionsBox, { borderColor: theme.icon, backgroundColor: theme.background }]}> 
                <Text style={{ color: theme.textSecondary, padding: 10 }}>Aucune recette trouvée.</Text>
              </View>
            )}
          </>
        ) : null}
        <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>Ajouter une recette</Text>
        <View style={styles.manualCreateBlock}> 
          <View style={[styles.searchBox, { borderColor: theme.icon, backgroundColor: theme.background }]}>
            <MaterialCommunityIcons name="silverware-fork-knife" size={20} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              value={manualTitle}
              onChangeText={setManualTitle}
              placeholder="Mon plat"
              placeholderTextColor={theme.textSecondary}
            />
          </View>
          <View style={styles.manualActionsRow}>
            <TouchableOpacity
              onPress={saveManualRecipeForCreation}
              style={[styles.smallActionBtn, styles.manualActionBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
              disabled={saving}
            >
              <Text style={styles.smallActionBtnText}>Ajouter</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={previewAiRecipe}
              style={[
                styles.smallActionBtn,
                styles.manualActionBtn,
                { backgroundColor: theme.background, borderColor: theme.icon, borderWidth: 1, opacity: aiLoading ? 0.7 : 1 },
              ]}
              disabled={aiLoading}
            >
              {aiLoading ? <ActivityIndicator size="small" color={theme.tint} /> : <Text style={[styles.smallActionBtnText, { color: theme.text }]}>Demander à l&apos;IA</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {aiPreview ? (
          <View style={[styles.aiPreviewBox, { borderColor: theme.icon, backgroundColor: theme.background }]}> 
            <Text style={{ color: theme.text, fontWeight: "700" }}>{String(aiPreview.title ?? manualTitle)}</Text>
            <Text style={{ color: theme.textSecondary, marginTop: 4 }} numberOfLines={2}>{String(aiPreview.description ?? "")}</Text>
            <TouchableOpacity
              onPress={saveAiRecipe}
              style={[styles.inlinePrimaryBtn, { backgroundColor: theme.tint }]}
              disabled={saving}
            >
              <Text style={styles.primaryBtnText}>Enregistrer la recette IA</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>Plats selectionnés</Text>
        <View style={styles.chipsRow}>
          {selectedCreationRecipes.length > 0 &&(
            selectedCreationRecipes.map((recipe) => (
              <Swipeable
                key={`selected-${recipe.id}`}
                overshootRight={false}
                renderRightActions={() => (
                  <TouchableOpacity
                    onPress={() => removeCreateRecipe(recipe.id)}
                    style={[styles.swipeDeleteBtn, { backgroundColor: "#CC4B4B" }]}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color="white" />
                    <Text style={styles.swipeDeleteText}>Retirer</Text>
                  </TouchableOpacity>
                )}
              >
                <View style={[styles.recipeChip, { borderColor: theme.tint, backgroundColor: `${theme.tint}1A` }]}> 
                  <Text style={{ color: theme.text, fontWeight: "600" }} numberOfLines={1}>{recipe.title}</Text>
                </View>
              </Swipeable>
            ))
          )}
        </View>
        <Text style={[styles.helperText, { color: theme.textSecondary }]}>Astuce: glisse une puce vers la gauche pour retirer un plat.</Text>

        <TouchableOpacity
          onPress={savePoll}
          style={[styles.primaryBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {isEditingOpenPoll ? "Enregistrer les modifications" : "Ouvrir le sondage"}
            </Text>
          )}
        </TouchableOpacity>
        {isEditingOpenPoll ? (
          <TouchableOpacity
            onPress={() => setShowPollBuilder(false)}
            style={[styles.secondaryBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
            disabled={saving}
          >
            <Text style={{ color: theme.text, fontWeight: "700" }}>Retour au vote</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const renderVotingView = () => {
    if (!activePoll) return null;

    const shakeStyle = {
      transform: [{ translateX: shakeAnim }],
    };

    return (
      <View style={[styles.card, { backgroundColor: theme.card }]}> 
        <Text style={[styles.cardTitle, { color: theme.text }]}>{activePoll.title || "Sondage de la semaine"}</Text>
        <Text style={[styles.cardText, { color: theme.textSecondary }]}>Ouvert le {formatDateTime(activePoll.starts_at)}</Text>
        <Text style={[styles.cardText, { color: theme.textSecondary }]}>Fin prévue le {formatDateTime(activePoll.ends_at)}</Text>

        <Animated.View style={[styles.voteCounterBox, { borderColor: theme.icon, backgroundColor: theme.background }, shakeStyle]}>
          <Text style={[styles.voteCounterTitle, { color: theme.text }]}>Choisis tes plats préférés :</Text>
          <Text style={[styles.voteCounterValue, { color: theme.tint }]}>{draftVoteOptionIds.length} / {activePoll.max_votes_per_user}</Text>
        </Animated.View>

        <View style={styles.voteGrid}>
          {activePoll.options.map((option) => {
            const selected = draftVoteOptionIds.includes(option.id);
            const disabled = !selected && draftVoteOptionIds.length >= activePoll.max_votes_per_user;

            return (
              <TouchableOpacity
                key={`option-${option.id}`}
                onPress={() => toggleDraftVote(option.id)}
                disabled={saving}
                style={[
                  styles.voteCard,
                  { borderColor: theme.icon, backgroundColor: theme.background },
                  selected && { borderColor: theme.tint, backgroundColor: `${theme.tint}16` },
                  disabled && { opacity: 0.45 },
                ]}
              >
                <Text style={{ color: theme.text, fontWeight: "700" }} numberOfLines={2}>{option.recipe?.title || "Recette"}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>{option.votes_count} vote(s)</Text>

                <View style={styles.voteCardFooter}>
                  <Text style={{ color: selected ? theme.tint : theme.textSecondary, fontSize: 12, fontWeight: "700" }}>
                    {selected ? "Selectionné" : "Choisir"}
                  </Text>
                  <MaterialCommunityIcons
                    name={selected ? "star" : "star-outline"}
                    size={22}
                    color={selected ? theme.tint : theme.textSecondary}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          onPress={submitVotes}
          disabled={!canSubmitVotes || saving}
          style={[styles.primaryBtn, { backgroundColor: theme.tint, opacity: canSubmitVotes && !saving ? 1 : 0.5 }]}
        >
          {saving ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.primaryBtnText}>Voter !</Text>}
        </TouchableOpacity>

        <Text style={[styles.helperText, { color: theme.textSecondary, textAlign: "center" }]}>Tu dois choisir exactement {activePoll.max_votes_per_user} plats.</Text>

        <View style={[styles.sectionBox, { borderColor: theme.icon, backgroundColor: theme.background }]}> 
          <Text style={{ color: theme.text, fontWeight: "700", marginBottom: 8 }}>Participation</Text>
          {Array.isArray(activePoll.voters_summary) && activePoll.voters_summary.length > 0 ? (
            activePoll.voters_summary.map((voter) => (
              <View key={`voter-${voter.user_id}`} style={styles.voterRow}>
                <Text style={{ color: theme.text }}>{voter.name}</Text>
                <Text style={{ color: theme.textSecondary, fontWeight: "600" }}>{voter.votes_count}/{activePoll.max_votes_per_user}</Text>
              </View>
            ))
          ) : (
            <Text style={{ color: theme.textSecondary }}>Personne n&apos;a voté pour le moment.</Text>
          )}
        </View>

        {isParent ? (
          <>
            <TouchableOpacity
              onPress={() => openPollBuilderForEdit(activePoll)}
              style={[styles.secondaryBtn, { borderColor: theme.icon, backgroundColor: theme.background, opacity: saving ? 0.6 : 1 }]}
              disabled={saving}
            >
              <Text style={{ color: theme.text, fontWeight: "700" }}>Modifier le sondage</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmClosePoll}
              style={[styles.secondaryBtn, { borderColor: theme.icon, backgroundColor: theme.background, opacity: saving ? 0.6 : 1 }]}
              disabled={saving}
            >
              <Text style={{ color: theme.text, fontWeight: "700" }}>Clôturer le sondage</Text>
            </TouchableOpacity>
          </>
        ) : null}

        <Animated.View
          pointerEvents="none"
          style={[
            styles.successBurst,
            {
              opacity: successAnim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
              transform: [{ scale: successAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.35] }) }],
            },
          ]}
        >
          <Text style={styles.successBurstText}>???</Text>
        </Animated.View>
      </View>
    );
  };

  const renderClosedView = () => {
    if (!activePoll) return null;

    const maxVotes = Math.max(1, ...closedRanking.map((option) => option.votes_count));

    return (
      <View style={[styles.card, { backgroundColor: theme.card }]}> 
        <Text style={[styles.cardTitle, { color: theme.text }]}>Résultats du sondage</Text>
        <Text style={[styles.cardText, { color: theme.textSecondary }]}>Classement des plats</Text>

        {closedRanking.map((option, index) => {
          const percent = Math.round((option.votes_count / maxVotes) * 100);

          return (
            <View key={`result-${option.id}`} style={[styles.resultCard, { borderColor: theme.icon, backgroundColor: theme.background }]}> 
              <View style={styles.resultHeaderRow}>
                <Text style={{ color: theme.text, fontWeight: "700", flex: 1 }} numberOfLines={1}>{index + 1}. {option.recipe?.title || "Recette"}</Text>
                <Text style={{ color: theme.textSecondary, fontWeight: "700" }}>{option.votes_count} vote(s)</Text>
              </View>

              <View style={[styles.resultBarBg, { backgroundColor: `${theme.icon}33` }]}> 
                <View style={[styles.resultBarFill, { backgroundColor: theme.tint, width: `${percent}%` }]} />
              </View>

              <View style={styles.votersChipsRow}>
                {Array.isArray(option.voters) && option.voters.length > 0 ? (
                  option.voters.slice(0, 6).map((voter) => (
                    <View key={`opt-${option.id}-voter-${voter.user_id}`} style={[styles.voterChip, { borderColor: theme.icon }]}> 
                      <Text style={{ color: theme.textSecondary, fontSize: 11 }} numberOfLines={1}>{voter.name}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Aucun vote sur ce plat</Text>
                )}
              </View>

              {isParent ? (
                <View style={styles.resultActionsRow}>
                  <TouchableOpacity
                    onPress={() => openPlanner(option.recipe_id)}
                    style={[styles.resultActionBtn, { borderColor: theme.icon, backgroundColor: theme.card }]}
                  >
                    <Text style={{ color: theme.text, fontWeight: "600" }}>Planifier</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        })}

        {isParent ? (
          <>
            <View style={[styles.sectionBox, { borderColor: theme.icon, backgroundColor: theme.background }]}> 
              <Text style={{ color: theme.text, fontWeight: "700", marginBottom: 8 }}>Ajouter une autre recette</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.card, color: theme.text, marginBottom: 8 }]}
                value={validationSearchRecipe}
                onChangeText={setValidationSearchRecipe}
                placeholder="Rechercher une recette du foyer"
                placeholderTextColor={theme.textSecondary}
              />

              {validationSearchRecipe.trim().length > 0 ? (
                <View style={[styles.suggestionsBox, { borderColor: theme.icon, backgroundColor: theme.card }]}> 
                  {filteredValidationRecipes.slice(0, 6).map((recipe) => (
                    <TouchableOpacity
                      key={`validation-suggestion-${recipe.id}`}
                      onPress={() => addExistingRecipeToValidation(recipe.id)}
                      style={styles.suggestionRow}
                    >
                      <Text style={{ color: theme.text, flex: 1 }} numberOfLines={1}>{recipe.title}</Text>
                      <MaterialCommunityIcons name="plus-circle-outline" size={20} color={theme.tint} />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              <View style={styles.manualRow}>
                <TextInput
                  style={[styles.input, styles.manualInput, { backgroundColor: theme.card, color: theme.text }]}
                  value={validationManualTitle}
                  onChangeText={setValidationManualTitle}
                  placeholder="Repas hors sondage"
                  placeholderTextColor={theme.textSecondary}
                />
                <TouchableOpacity
                  onPress={addManualValidationRecipe}
                  style={[styles.smallActionBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
                  disabled={saving}
                >
                  <Text style={styles.smallActionBtnText}>Ajouter</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.sectionBox, { borderColor: theme.icon, backgroundColor: theme.background }]}> 
              <Text style={{ color: theme.text, fontWeight: "700", marginBottom: 8 }}>Menu de la semaine</Text>
              {sortedAssignments.length > 0 ? (
                sortedAssignments.map((assignment) => {
                  const recipe = recipesById.get(assignment.recipe_id);
                  return (
                    <View key={`assignment-${assignment.slotKey}`} style={[styles.assignmentRow, { borderColor: theme.icon }]}> 
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: "700" }} numberOfLines={1}>{recipe?.title || `Recette ${assignment.recipe_id}`}</Text>
                        <Text style={{ color: theme.textSecondary, marginTop: 2, fontSize: 12 }}>
                          {formatMealPlanDate(assignment.date)} - {assignment.meal_type} - {assignment.servings} portions
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => removeAssignment(assignment.slotKey)}>
                        <MaterialCommunityIcons name="close-circle-outline" size={22} color={theme.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  );
                })
              ) : (
                <Text style={{ color: theme.textSecondary }}>Aucun repas planifié pour l&apos;instant.</Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => void openPollShoppingListPicker()}
              style={[
                styles.secondaryBtn,
                { borderColor: theme.icon, backgroundColor: theme.background, opacity: saving || sortedAssignments.length === 0 ? 0.5 : 1 },
              ]}
              disabled={saving || sortedAssignments.length === 0}
            >
              <Text style={{ color: theme.text, fontWeight: "700" }}>Ajouter à la liste de courses</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={validatePoll}
              style={[styles.primaryBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
              disabled={saving}
            >
              {saving ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.primaryBtnText}>Valider le menu de la semaine</Text>}
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    );
  };

  const renderValidatedView = () => {
    if (!activePoll) return null;

    const selectedIds = selectedRecipeIdsForValidation.length > 0
      ? selectedRecipeIdsForValidation
      : closedRanking.filter((option) => option.votes_count > 0).map((option) => option.recipe_id);

    return (
      <View style={[styles.card, { backgroundColor: theme.card }]}> 
        <Text style={[styles.cardTitle, { color: theme.text }]}>Sondage validé</Text>
        <Text style={[styles.cardText, { color: theme.textSecondary }]}>Plats retenus</Text>

        {selectedIds.length > 0 ? (
          selectedIds.map((recipeId) => {
            const recipe = recipesById.get(recipeId);
            return (
              <View key={`validated-${recipeId}`} style={[styles.assignmentRow, { borderColor: theme.icon, backgroundColor: theme.background }]}> 
                <Text style={{ color: theme.text, fontWeight: "700", flex: 1 }} numberOfLines={1}>{recipe?.title || `Recette ${recipeId}`}</Text>
              </View>
            );
          })
        ) : (
          <Text style={{ color: theme.textSecondary }}>Aucune recette validée détectée.</Text>
        )}

        {sortedAssignments.length > 0 ? (
          <View style={{ marginTop: 10 }}>
            <Text style={[styles.cardText, { color: theme.textSecondary }]}>Planification</Text>
            {sortedAssignments.map((assignment) => {
              const recipe = recipesById.get(assignment.recipe_id);
              return (
                <View key={`validated-plan-${assignment.slotKey}`} style={[styles.assignmentRow, { borderColor: theme.icon, backgroundColor: theme.background }]}> 
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: "700" }}>{recipe?.title || `Recette ${assignment.recipe_id}`}</Text>
                    <Text style={{ color: theme.textSecondary, marginTop: 2, fontSize: 12 }}>
                      {formatMealPlanDate(assignment.date)} - {assignment.meal_type} - {assignment.servings} portions
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {isParent && sortedAssignments.length > 0 ? (
          <TouchableOpacity
            onPress={() => void openPollShoppingListPicker()}
            style={[styles.secondaryBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
            disabled={saving}
          >
            <Text style={{ color: theme.text, fontWeight: "700" }}>Ajouter à la liste de courses</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}> 
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  const plannerRecipe = plannerRecipeId ? recipesById.get(plannerRecipeId) : null;
  const selectedPlanningDateIso = planningPickerTarget === "start" ? planningStartDate : planningEndDate;
  const weekSlots = buildWeekSlots(
    activePoll?.planning_start_date ?? planningStartDate,
    activePoll?.planning_end_date ?? planningEndDate
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: theme.icon }]}> 
        <TouchableOpacity onPress={handleBackArrow}> 
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Sondage repas</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {(isParent && !activePoll) || (isParent && activePoll?.status === "open" && showPollBuilder) ? (
          renderCreateView()
        ) : !activePoll ? (
          <View style={[styles.card, { backgroundColor: theme.card, alignItems: "center" }]}> 
            <MaterialCommunityIcons name="vote-outline" size={44} color={theme.tint} />
            <Text style={[styles.cardTitle, { color: theme.text, textAlign: "center", marginTop: 10 }]}>Aucun sondage actif</Text>
            <Text style={[styles.cardText, { color: theme.textSecondary, textAlign: "center" }]}>Un parent doit ouvrir un sondage pour démarrer les votes.</Text>
          </View>
        ) : activePoll.status === "open" ? (
          renderVotingView()
        ) : activePoll.status === "closed" ? (
          renderClosedView()
        ) : (
          renderValidatedView()
        )}
      </ScrollView>

      <Modal
        visible={planningPickerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setPlanningPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setPlanningPickerVisible(false)} />
          <View style={[styles.bottomSheet, { backgroundColor: theme.card, borderTopColor: theme.icon }]}>
            <View style={styles.bottomSheetHandle} />
            <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 10 }]}>
              {planningPickerTarget === "start" ? "Date de début" : "Date de fin"}
            </Text>

            <View style={styles.calendarHeaderRow}>
              <TouchableOpacity
                onPress={() => shiftPlanningPickerMonth(-1)}
                style={[styles.calendarNavBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
              >
                <MaterialCommunityIcons name="chevron-left" size={18} color={theme.text} />
              </TouchableOpacity>

              <Text style={[styles.calendarMonthText, { color: theme.text }]}>{monthLabel(planningPickerMonth)}</Text>

              <TouchableOpacity
                onPress={() => shiftPlanningPickerMonth(1)}
                style={[styles.calendarNavBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
              >
                <MaterialCommunityIcons name="chevron-right" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarWeekRow}>
              {PLANNING_WEEKDAYS.map((weekday) => (
                <Text key={`weekday-${weekday}`} style={[styles.calendarWeekdayText, { color: theme.textSecondary }]}>
                  {weekday}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {planningMonthCells.map((dayDate, index) => {
                if (!dayDate) {
                  return <View key={`calendar-empty-${index}`} style={styles.calendarCell} />;
                }

                const iso = toIsoDate(dayDate);
                const isSelected = iso === selectedPlanningDateIso;

                return (
                  <TouchableOpacity
                    key={`calendar-day-${iso}`}
                    onPress={() => selectPlanningDate(dayDate)}
                    style={[
                      styles.calendarDayBtn,
                      { borderColor: theme.icon, backgroundColor: theme.background },
                      isSelected && { borderColor: theme.tint, backgroundColor: `${theme.tint}1A` },
                    ]}
                  >
                    <View style={styles.calendarDayInner}>
                      <Text style={[styles.calendarDayText, { color: isSelected ? theme.tint : theme.text }]}>
                        {dayDate.getDate()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={plannerVisible} animationType="slide" transparent onRequestClose={() => setPlannerVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setPlannerVisible(false)} />

          <View style={[styles.bottomSheet, { backgroundColor: theme.card, borderTopColor: theme.icon }]}> 
            <View style={styles.bottomSheetHandle} />
            <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 6 }]}>Planifier au menu de la semaine</Text>
            <Text style={{ color: theme.textSecondary, marginBottom: 10 }} numberOfLines={1}>{plannerRecipe?.title || "Recette"}</Text>

            <Text style={[styles.label, { color: theme.text }]}>Jour</Text>
            <View style={styles.weekSlotsWrap}>
              {weekSlots.map((slot) => (
                <TouchableOpacity
                  key={`slot-day-${slot.date}`}
                  onPress={() => setPlannerDate(slot.date)}
                  style={[
                    styles.weekSlotChip,
                    { borderColor: theme.icon, backgroundColor: theme.background },
                    plannerDate === slot.date && { borderColor: theme.tint, backgroundColor: `${theme.tint}16` },
                  ]}
                >
                  <Text style={{ color: theme.text, fontSize: 12 }} numberOfLines={1}>{slot.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: theme.text, marginTop: 10 }]}>Repas</Text>
            <View style={styles.mealTypeRow}>
              {MEAL_TYPES.map((mealType) => (
                <TouchableOpacity
                  key={`planner-meal-${mealType.value}`}
                  onPress={() => setPlannerMealType(mealType.value)}
                  style={[
                    styles.mealTypeChip,
                    { borderColor: theme.icon, backgroundColor: theme.background },
                    plannerMealType === mealType.value && { borderColor: theme.tint, backgroundColor: `${theme.tint}16` },
                  ]}
                >
                  <Text style={{ color: theme.text }}>{mealType.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: theme.text, marginTop: 10 }]}>Portions</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity onPress={() => setPlannerServings((prev) => clamp(prev - 1, 1, 30))} style={[styles.stepperBtn, { borderColor: theme.icon }]}> 
                <MaterialCommunityIcons name="minus" size={18} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.stepperValue, { color: theme.text }]}>{plannerServings}</Text>
              <TouchableOpacity onPress={() => setPlannerServings((prev) => clamp(prev + 1, 1, 30))} style={[styles.stepperBtn, { borderColor: theme.icon }]}> 
                <MaterialCommunityIcons name="plus" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={assignRecipeToSlot} style={[styles.primaryBtn, { backgroundColor: theme.tint }]}> 
              <Text style={styles.primaryBtnText}>Planifier ce repas</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ShoppingListPickerModal
        visible={shoppingPickerVisible}
        title="Ajouter le meal plan à la liste de courses"
        confirmLabel="Ajouter les ingrédients"
        theme={theme}
        saving={saving}
        lists={shoppingLists}
        selectedListId={selectedShoppingListId}
        useNewList={useNewShoppingList}
        newListTitle={newShoppingListTitle}
        onClose={closePollShoppingListPicker}
        onSelectList={setSelectedShoppingListId}
        onToggleUseNewList={setUseNewShoppingList}
        onChangeNewListTitle={setNewShoppingListTitle}
        onConfirm={() => void confirmPollShoppingListSelection()}
        extraContent={
          <View>
            <Text style={[styles.label, { color: theme.text }]}>Repas planifiés à inclure</Text>
            <View style={{ gap: 8 }}>
              {sortedAssignments.map((assignment) => {
                const recipe = recipesById.get(assignment.recipe_id);
                const selected = selectedAssignmentKeysForShopping.includes(assignment.slotKey);

                return (
                  <TouchableOpacity
                    key={`shopping-assignment-${assignment.slotKey}`}
                    onPress={() => toggleAssignmentForShopping(assignment.slotKey)}
                    style={[
                      styles.assignmentRow,
                      { borderColor: theme.icon, backgroundColor: theme.background },
                      selected && { borderColor: theme.tint, backgroundColor: `${theme.tint}18` },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={selected ? "checkbox-marked" : "checkbox-blank-outline"}
                      size={20}
                      color={selected ? theme.tint : theme.textSecondary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: "700" }} numberOfLines={1}>
                        {recipe?.title || `Recette ${assignment.recipe_id}`}
                      </Text>
                      <Text style={{ color: theme.textSecondary, marginTop: 2, fontSize: 12 }}>
                        {formatMealPlanDate(assignment.date)} - {assignment.meal_type} - {assignment.servings} portions
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    minHeight: 60,
    marginTop: 28,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: "700" },
  content: { padding: 16, paddingBottom: 40 },

  card: { borderRadius: 14, padding: 14 },
  cardTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  cardText: { fontSize: 13, marginBottom: 4 },

  label: { fontSize: 13, fontWeight: "700", marginBottom: 6 },
  helperText: { fontSize: 12, marginTop: 6 },

  input: { borderRadius: 10, paddingHorizontal: 12, height: 44, marginBottom: 10 },
  planningDatesRow: {
    flexDirection: "row",
    gap: 8,
  },
  planningDateBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  planningDateBtnText: {
    flex: 1,
    fontSize: 14,
  },
  searchBox: {
    borderWidth: 1,
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: { flex: 1, marginLeft: 8 },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "flex-start" },
  emptyChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  recipeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 120,
    maxWidth: 220,
  },
  swipeDeleteBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    marginLeft: 8,
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  swipeDeleteText: { color: "white", fontWeight: "700", fontSize: 12 },

  suggestionsBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 2,
    marginTop: 8,
    marginBottom: 4,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },

  recipeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 4,
    rowGap: 8,
  },
  recipeCard: {
    width: "48.5%",
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    minHeight: 118,
    justifyContent: "space-between",
  },
  recipeIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  recipePickIcon: {
    position: "absolute",
    right: 8,
    top: 8,
  },

  manualRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  manualInput: {
    flex: 1,
    marginBottom: 0,
  },
  manualCreateBlock: {
    gap: 8,
  },
  manualActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  manualActionBtn: {
    flex: 1,
  },
  smallActionBtn: {
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 70,
  },
  smallActionBtnText: { color: "white", fontWeight: "700" },

  aiPreviewBox: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },

  settingsGrid: {
    flexDirection: "row",
    gap: 8,
  },
  settingCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  settingLabel: { fontSize: 12, fontWeight: "700", marginBottom: 8 },

  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: { minWidth: 28, textAlign: "center", fontWeight: "700", fontSize: 16 },

  voteCounterBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
    marginBottom: 8,
    alignItems: "center",
  },
  voteCounterTitle: { fontSize: 14, fontWeight: "700" },
  voteCounterValue: { fontSize: 22, fontWeight: "800", marginTop: 2 },

  voteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
  voteCard: {
    width: "48.5%",
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    minHeight: 126,
    justifyContent: "space-between",
  },
  voteCardFooter: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  successBurst: {
    position: "absolute",
    top: "48%",
    alignSelf: "center",
  },
  successBurstText: {
    fontSize: 36,
    color: "#F5A623",
    fontWeight: "900",
  },

  sectionBox: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  voterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },

  resultCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
  },
  resultHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resultBarBg: {
    marginTop: 8,
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  resultBarFill: {
    height: 8,
    borderRadius: 999,
  },
  votersChipsRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  voterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 120,
  },
  resultActionsRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  resultActionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    height: 38,
  },

  assignmentRow: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },

  primaryBtn: {
    marginTop: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    height: 46,
  },
  inlinePrimaryBtn: {
    marginTop: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    height: 40,
  },
  primaryBtnText: { color: "white", fontWeight: "700" },

  secondaryBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    height: 44,
  },

  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  bottomSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    maxHeight: "80%",
  },
  bottomSheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 4,
    backgroundColor: "#999",
    marginBottom: 12,
  },
  calendarHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  calendarNavBtn: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarMonthText: {
    fontSize: 15,
    fontWeight: "700",
  },
  calendarWeekRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  calendarWeekdayText: {
    width: "14.2857%",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 6,
  },
  calendarCell: {
    width: "14.2857%",
    aspectRatio: 1,
  },
  calendarDayBtn: {
    width: "14.2857%",
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDayInner: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDayText: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 13,
    textAlignVertical: "center",
    includeFontPadding: false,
  },

  weekSlotsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  weekSlotChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    maxWidth: "48%",
  },
  mealTypeRow: {
    flexDirection: "row",
    gap: 8,
  },
  mealTypeChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
});

