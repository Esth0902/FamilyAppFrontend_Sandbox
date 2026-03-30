
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { apiFetch } from "@/src/api/client";
import { useDebounce } from "@/src/hooks/useDebounce";
import { useRecipeSearch } from "@/src/hooks/useRecipeSearch";
import { MEAL_TYPE_SORT, type MealType } from "@/src/features/calendar/calendar-types";
import { mergeUniqueRecipes } from "@/src/features/recipes/recipe-utils";
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
import { queryKeys } from "@/src/query/query-keys";
import { subscribeToHouseholdRealtime } from "@/src/realtime/client";
import {
  getStoredUserStateSnapshot,
  refreshStoredUserFromStorage,
  useStoredUserState,
} from "@/src/session/user-cache";
import { addDaysFromIso, addDaysIso, parseOptionalIsoDate, toIsoDate, todayIso } from "@/src/utils/date";
import { MealPollCreateView } from "@/src/features/meals/poll/components/MealPollCreateView";
import { MealPollOpenView } from "@/src/features/meals/poll/components/MealPollOpenView";
import { MealPollClosedView } from "@/src/features/meals/poll/components/MealPollClosedView";
import { MealPollValidatedView } from "@/src/features/meals/poll/components/MealPollValidatedView";
import { MealPollPlanningDateModal } from "@/src/features/meals/poll/components/MealPollPlanningDateModal";
import { MealPollPlannerModal } from "@/src/features/meals/poll/components/MealPollPlannerModal";

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

type MealPlanAssignment = {
  slotKey: string;
  date: string;
  meal_type: MealType;
  recipe_id: number;
  servings: number;
};

type AiPreviewIngredient = {
  name: string;
  quantity: number;
  unit: string;
  category: string;
};

type AiPreviewRecipe = {
  title: string;
  description: string;
  instructions: string;
  type: string;
  ingredients: AiPreviewIngredient[];
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

const normalizeAiPreviewRecipe = (payload: any): AiPreviewRecipe | null => {
  const title = String(payload?.title ?? "").trim();
  if (!title) {
    return null;
  }

  const ingredientsSource = Array.isArray(payload?.ingredients) ? payload.ingredients : [];
  const ingredients = ingredientsSource.map((ingredient: any) => {
    const quantityRaw = Number(ingredient?.quantity);
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;

    return {
      name: String(ingredient?.name ?? "ingredient").trim() || "ingrédient",
      quantity,
      unit: String(ingredient?.unit ?? "unite").trim() || "unité",
      category: String(ingredient?.category ?? "autre").trim() || "autre",
    };
  });

  return {
    title,
    description: String(payload?.description ?? ""),
    instructions: String(payload?.instructions ?? ""),
    type: String(payload?.type ?? "plat principal"),
    ingredients,
  };
};

export default function MealPollScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId, role } = useStoredUserState();
  const isParent = role === "parent";


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
  const debouncedSearchRecipe = useDebounce(searchRecipe, 400);
  const [selectedRecipeIdsForCreation, setSelectedRecipeIdsForCreation] = useState<number[]>([]);

  const [manualTitle, setManualTitle] = useState("");
  const [aiPreview, setAiPreview] = useState<AiPreviewRecipe | null>(null);

  const [draftVoteOptionIds, setDraftVoteOptionIds] = useState<number[]>([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const successAnim = useRef(new Animated.Value(0)).current;
  const createDefaultsAppliedRef = useRef(false);

  const [selectedRecipeIdsForValidation, setSelectedRecipeIdsForValidation] = useState<number[]>([]);
  const [mealPlanAssignments, setMealPlanAssignments] = useState<Record<string, MealPlanAssignment>>({});
  const [validationSearchRecipe, setValidationSearchRecipe] = useState("");
  const debouncedValidationSearchRecipe = useDebounce(validationSearchRecipe, 400);
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

  const creationRecipeSearch = useRecipeSearch({
    householdId,
    query: debouncedSearchRecipe,
    scope: "all",
    limit: 12,
  });
  const validationRecipeSearch = useRecipeSearch({
    householdId,
    query: debouncedValidationSearchRecipe,
    scope: "all",
    limit: 6,
  });

  const recipesById = useMemo(() => {
    const map = new Map<number, Recipe>();
    recipes.forEach((recipe) => map.set(recipe.id, recipe));
    return map;
  }, [recipes]);

  const filteredCreationRecipes = useMemo(() => {
    return creationRecipeSearch.results;
  }, [creationRecipeSearch.results]);

  const filteredValidationRecipes = useMemo(() => {
    return validationRecipeSearch.results;
  }, [validationRecipeSearch.results]);

  useEffect(() => {
    if (creationRecipeSearch.results.length === 0 && validationRecipeSearch.results.length === 0) {
      return;
    }

    setRecipes((previousRecipes) =>
      mergeUniqueRecipes(previousRecipes, [
        ...creationRecipeSearch.results,
        ...validationRecipeSearch.results,
      ])
    );
  }, [creationRecipeSearch.results, validationRecipeSearch.results]);

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

  const mealPollQueryKey = useMemo(() => ["mealPoll", "active", householdId ?? 0] as const, [householdId]);
  const shoppingListsQueryKey = useMemo(() => ["shoppingLists", householdId ?? 0] as const, [householdId]);

  const invalidateMealPoll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: mealPollQueryKey });
  }, [mealPollQueryKey, queryClient]);

  const invalidateRecipes = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.recipes.root(householdId) });
  }, [householdId, queryClient]);

  const mealPollQuery = useQuery({
    queryKey: mealPollQueryKey,
    enabled: Boolean(householdId),
    refetchInterval: 12000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      await refreshStoredUserFromStorage();
      const sessionState = getStoredUserStateSnapshot();
      const currentRole = sessionState.role ?? role;

      let configuredDuration = 24;
      let configuredMaxVotes = 3;
      let configuredDefaultServings = 4;

      if (currentRole === "parent") {
        try {
          const configResponse = await queryClient.fetchQuery({
            queryKey: queryKeys.household.config(householdId),
            queryFn: () => apiFetch("/households/config"),
            staleTime: 30_000,
            gcTime: 10 * 60_000,
          });
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
        } catch {
          configuredDefaultServings = 4;
        }
      }

      const pollResponse = await apiFetch("/meal-polls/active");
      const poll: Poll | null = pollResponse?.poll ?? null;
      const pollRecipes = Array.isArray(poll?.options)
        ? poll.options
          .map((option) => option.recipe)
          .filter((recipe): recipe is Recipe => Boolean(recipe?.id && recipe?.title))
        : [];

      return {
        poll,
        pollRecipes,
        currentRole,
        configuredDuration,
        configuredMaxVotes,
        configuredDefaultServings,
      };
    },
  });

  useEffect(() => {
    const payload = mealPollQuery.data;
    if (!payload) {
      return;
    }

    const {
      poll,
      pollRecipes,
      currentRole,
      configuredDuration,
      configuredMaxVotes,
      configuredDefaultServings,
    } = payload;

    setDefaultServings(configuredDefaultServings);
    setRecipes((previousRecipes) => mergeUniqueRecipes(previousRecipes, pollRecipes));
    setActivePoll(poll);

    if (poll) {
      createDefaultsAppliedRef.current = false;
    } else if (currentRole === "parent" && !createDefaultsAppliedRef.current) {
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

    if (poll?.status === "closed" && currentRole === "parent") {
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
  }, [mealPollQuery.data]);

  useEffect(() => {
    if (!mealPollQuery.error) {
      return;
    }
    const error = mealPollQuery.error as { message?: string } | null;
    Alert.alert("Sondage", error?.message || "Impossible de charger les données.");
  }, [mealPollQuery.error]);

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
          void invalidateMealPoll();
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
  }, [householdId, invalidateMealPoll]);

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

  const upsertPollMutation = useMutation({
    mutationFn: async ({
      pollId,
      payload,
    }: {
      pollId: number | null;
      payload: {
        title: string | null;
        recipe_ids: number[];
        planning_start_date: string;
        planning_end_date: string;
        duration_hours: number;
        max_votes_per_user: number;
      };
    }) => {
      return await apiFetch(pollId ? `/meal-polls/${pollId}` : "/meal-polls", {
        method: pollId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      await invalidateMealPoll();
    },
  });

  const createRecipeMutation = useMutation({
    mutationFn: async (payload: {
      title: string;
      type: string;
      description: string;
      instructions: string;
      base_servings: number;
      ingredients: { name: string; quantity: number; unit: string }[];
    }) => {
      return await apiFetch("/recipes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      await invalidateRecipes();
    },
  });

  const previewAiRecipeMutation = useMutation({
    mutationFn: async (title: string) => {
      return await apiFetch("/recipes/preview-ai", {
        method: "POST",
        body: JSON.stringify({ title }),
      });
    },
  });

  const saveAiRecipeMutation = useMutation({
    mutationFn: async (payload: AiPreviewRecipe & { household_id: number }) => {
      return await apiFetch("/recipes/ai-store", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          ingredients: payload.ingredients,
        }),
      });
    },
    onSuccess: async () => {
      await invalidateRecipes();
    },
  });

  const submitVotesMutation = useMutation({
    mutationFn: async ({ pollId, optionIds }: { pollId: number; optionIds: number[] }) => {
      return await apiFetch(`/meal-polls/${pollId}/votes/sync`, {
        method: "POST",
        body: JSON.stringify({ option_ids: optionIds }),
      });
    },
    onSuccess: async () => {
      await invalidateMealPoll();
    },
  });

  const closePollMutation = useMutation({
    mutationFn: async (pollId: number) => {
      return await apiFetch(`/meal-polls/${pollId}/close`, {
        method: "POST",
      });
    },
    onSuccess: async () => {
      await invalidateMealPoll();
    },
  });

  const loadShoppingListsMutation = useMutation({
    mutationFn: async () => {
      return await loadShoppingLists();
    },
  });

  const addPollShoppingIngredientsMutation = useMutation({
    mutationFn: async ({
      selectedAssignments,
      selectedListId,
      existingLists,
      createNewList,
      listTitle,
    }: {
      selectedAssignments: MealPlanAssignment[];
      selectedListId: number | null;
      existingLists: ShoppingListSummary[];
      createNewList: boolean;
      listTitle: string;
    }) => {
      let targetListId = selectedListId;
      let targetListTitle = existingLists.find((list) => list.id === selectedListId)?.title ?? "";

      if (createNewList) {
        const created = await createShoppingList(listTitle);
        if (!created?.id) {
          throw new Error("Impossible de créer la nouvelle liste.");
        }
        targetListId = created.id;
        targetListTitle = created.title;
      }

      if (!targetListId) {
        throw new Error("Choisis une liste existante ou crée-en une nouvelle.");
      }

      const recipeSelections = selectedAssignments.map((assignment) => ({
        recipeId: assignment.recipe_id,
        servings: clamp(Number(assignment.servings) || 1, 1, 30),
      }));
      const ingredients = await buildShoppingIngredientsFromRecipeSelections(recipeSelections);
      if (ingredients.length === 0) {
        throw new Error("Aucun ingrédient exploitable à ajouter.");
      }

      const addedCount = await addIngredientsToShoppingList(targetListId, ingredients);
      return { addedCount, targetListId, targetListTitle };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: shoppingListsQueryKey });
    },
  });

  const validatePollMutation = useMutation({
    mutationFn: async ({
      pollId,
      selectedRecipeIds,
      mealPlan,
    }: {
      pollId: number;
      selectedRecipeIds: number[];
      mealPlan: { recipe_id: number; date: string; meal_type: MealType; servings: number }[];
    }) => {
      return await apiFetch(`/meal-polls/${pollId}/validate`, {
        method: "POST",
        body: JSON.stringify({
          selected_recipe_ids: selectedRecipeIds,
          meal_plan: mealPlan,
        }),
      });
    },
    onSuccess: async () => {
      await invalidateMealPoll();
    },
  });

  const aiLoading = previewAiRecipeMutation.isPending;
  const saving = upsertPollMutation.isPending
    || createRecipeMutation.isPending
    || saveAiRecipeMutation.isPending
    || submitVotesMutation.isPending
    || closePollMutation.isPending
    || loadShoppingListsMutation.isPending
    || addPollShoppingIngredientsMutation.isPending
    || validatePollMutation.isPending;
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

      const response = await upsertPollMutation.mutateAsync({
        pollId: isEditingOpenPoll ? activePoll?.id ?? null : null,
        payload,
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
    }
  };
  const saveManualRecipeForCreation = async () => {
    const title = manualTitle.trim();
    if (!title) {
      Alert.alert("Recette", "Donne un titre au plat manuel.");
      return;
    }

    try {
      const recipe = await createRecipeMutation.mutateAsync({
        title,
        type: "plat principal",
        description: "Ajout manuel depuis création du sondage",
        instructions: "A compléter",
        base_servings: 1,
        ingredients: [{ name: "ingredient", quantity: 1, unit: "unite" }],
      });

      setRecipes((prev) => mergeUniqueRecipes(prev, [recipe]));
      setSelectedRecipeIdsForCreation((prev) => (prev.includes(recipe.id) ? prev : [...prev, recipe.id]));
      setManualTitle("");
    } catch (error: any) {
      Alert.alert("Recette", error?.message || "Impossible d'ajouter ce plat.");
    }
  };
  const previewAiRecipe = async () => {
    const title = manualTitle.trim();
    if (!title) {
      Alert.alert("IA", "Indique d'abord un nom de plat.");
      return;
    }

    try {
      const preview = await previewAiRecipeMutation.mutateAsync(title);
      const normalizedPreview = normalizeAiPreviewRecipe(preview);
      if (!normalizedPreview) {
        Alert.alert("IA", "La réponse IA est invalide. Réessaie avec un autre intitulé.");
        return;
      }
      setAiPreview(normalizedPreview);
    } catch (error: any) {
      Alert.alert("IA", error?.message || "Impossible de générer la recette IA.");
    }
  };
  const saveAiRecipe = async () => {
    if (!aiPreview || !householdId) return;

    try {
      const recipe = await saveAiRecipeMutation.mutateAsync({
        ...aiPreview,
        household_id: householdId,
      });

      setRecipes((prev) => mergeUniqueRecipes(prev, [recipe]));
      setSelectedRecipeIdsForCreation((prev) => (prev.includes(recipe.id) ? prev : [...prev, recipe.id]));
      setAiPreview(null);
      setManualTitle("");
      Alert.alert("IA", "Recette IA enregistrée.");
    } catch (error: any) {
      Alert.alert("IA", error?.message || "Impossible d'enregistrer la recette IA.");
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

    try {
      const response = await submitVotesMutation.mutateAsync({
        pollId: activePoll.id,
        optionIds: draftVoteOptionIds,
      });

      setActivePoll(response?.poll ?? null);
      runVoteSuccess();
      Alert.alert("Vote", "Ton vote est enregistré.");
    } catch (error: any) {
      Alert.alert("Vote", error?.message || "Impossible d'enregistrer le vote.");
    }
  };
  const closePoll = async () => {
    if (!activePoll) return;

    try {
      const response = await closePollMutation.mutateAsync(activePoll.id);

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
      router.replace("/(app)/(tabs)/meal");
      return;
    }

    if (activePoll?.status === "open" && showPollBuilder) {
      setShowPollBuilder(false);
      return;
    }

    router.replace("/(app)/(tabs)/meal");
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

    try {
      const payload = await loadShoppingListsMutation.mutateAsync();
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

    try {
      const {
        addedCount,
        targetListId,
        targetListTitle,
      } = await addPollShoppingIngredientsMutation.mutateAsync({
        selectedAssignments,
        selectedListId: selectedShoppingListId,
        existingLists: shoppingLists,
        createNewList: useNewShoppingList,
        listTitle: newShoppingListTitle,
      });

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

    try {
      const recipe = await createRecipeMutation.mutateAsync({
        title,
        type: "plat principal",
        description: "Ajoutée lors de la validation du sondage",
        instructions: "A compléter",
        base_servings: 1,
        ingredients: [{ name: "ingredient", quantity: 1, unit: "unite" }],
      });

      setRecipes((prev) => mergeUniqueRecipes(prev, [recipe]));
      setSelectedRecipeIdsForValidation((prev) => (prev.includes(recipe.id) ? prev : [...prev, recipe.id]));
      setValidationManualTitle("");
      openPlanner(recipe.id);
    } catch (error: any) {
      Alert.alert("Validation", error?.message || "Impossible d'ajouter cette recette.");
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

    try {
      const response = await validatePollMutation.mutateAsync({
        pollId: activePoll.id,
        selectedRecipeIds,
        mealPlan,
      });

      const selectedFromApi = Array.isArray(response?.selected_recipe_ids)
        ? response.selected_recipe_ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
        : selectedRecipeIds;

      setSelectedRecipeIdsForValidation(selectedFromApi);
      setActivePoll(response?.poll ?? null);

      Alert.alert("Validation", "Sondage validé et menu de la semaine enregistré.");
    } catch (error: any) {
      Alert.alert("Validation", error?.message || "Impossible de valider le sondage.");
    }
  };
  const renderCreateView = () => {
    const isEditingOpenPoll = Boolean(isParent && activePoll?.status === "open" && showPollBuilder);

    return (
      <MealPollCreateView
        theme={theme}
        styles={styles}
        isEditingOpenPoll={isEditingOpenPoll}
        saving={saving}
        aiLoading={aiLoading}
        pollTitle={pollTitle}
        durationHours={durationHours}
        maxVotesPerUser={maxVotesPerUser}
        planningStartDate={planningStartDate}
        planningEndDate={planningEndDate}
        searchRecipe={searchRecipe}
        manualTitle={manualTitle}
        aiPreview={aiPreview}
        filteredCreationRecipes={filteredCreationRecipes}
        selectedRecipeIdsForCreation={selectedRecipeIdsForCreation}
        selectedCreationRecipes={selectedCreationRecipes}
        isCreationSearchFetching={creationRecipeSearch.isFetching}
        onPollTitleChange={setPollTitle}
        onDurationHoursChange={setDurationHours}
        onMaxVotesPerUserChange={setMaxVotesPerUser}
        onOpenPlanningPicker={openPlanningPicker}
        onSearchRecipeChange={setSearchRecipe}
        onToggleCreateRecipe={toggleCreateRecipe}
        onManualTitleChange={setManualTitle}
        onSaveManualRecipeForCreation={() => {
          void saveManualRecipeForCreation();
        }}
        onPreviewAiRecipe={() => {
          void previewAiRecipe();
        }}
        onSaveAiRecipe={() => {
          void saveAiRecipe();
        }}
        onRemoveCreateRecipe={removeCreateRecipe}
        onSavePoll={() => {
          void savePoll();
        }}
        onCancelEditOpenPoll={() => setShowPollBuilder(false)}
      />
    );
  };
  const renderVotingView = () => {
    if (!activePoll) {
      return null;
    }

    return (
      <MealPollOpenView
        theme={theme}
        styles={styles}
        poll={activePoll}
        draftVoteOptionIds={draftVoteOptionIds}
        saving={saving}
        canSubmitVotes={canSubmitVotes}
        isParent={isParent}
        shakeAnim={shakeAnim}
        successAnim={successAnim}
        formatDateTime={formatDateTime}
        onToggleDraftVote={toggleDraftVote}
        onSubmitVotes={() => {
          void submitVotes();
        }}
        onOpenPollBuilderForEdit={() => {
          openPollBuilderForEdit(activePoll);
        }}
        onConfirmClosePoll={confirmClosePoll}
      />
    );
  };
  const renderClosedView = () => {
    if (!activePoll) {
      return null;
    }

    return (
      <MealPollClosedView
        theme={theme}
        styles={styles}
        closedRanking={closedRanking}
        isParent={isParent}
        filteredValidationRecipes={filteredValidationRecipes}
        validationSearchRecipe={validationSearchRecipe}
        validationManualTitle={validationManualTitle}
        sortedAssignments={sortedAssignments}
        recipesById={recipesById}
        saving={saving}
        isValidationSearchFetching={validationRecipeSearch.isFetching}
        formatMealPlanDate={formatMealPlanDate}
        onOpenPlanner={openPlanner}
        onValidationSearchRecipeChange={setValidationSearchRecipe}
        onAddExistingRecipeToValidation={addExistingRecipeToValidation}
        onValidationManualTitleChange={setValidationManualTitle}
        onAddManualValidationRecipe={() => {
          void addManualValidationRecipe();
        }}
        onRemoveAssignment={removeAssignment}
        onOpenPollShoppingListPicker={() => {
          void openPollShoppingListPicker();
        }}
        onValidatePoll={() => {
          void validatePoll();
        }}
      />
    );
  };
  const renderValidatedView = () => {
    return (
      <MealPollValidatedView
        theme={theme}
        styles={styles}
        selectedRecipeIdsForValidation={selectedRecipeIdsForValidation}
        closedRanking={closedRanking}
        sortedAssignments={sortedAssignments}
        recipesById={recipesById}
        isParent={isParent}
        saving={saving}
        formatMealPlanDate={formatMealPlanDate}
        onOpenPollShoppingListPicker={() => {
          void openPollShoppingListPicker();
        }}
      />
    );
  };
  if (mealPollQuery.isLoading) {
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
      <ScreenHeader
        title="Sondage repas"
        withBackButton
        onBackPress={handleBackArrow}
        safeTop
        showBorder
      />

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {(isParent && !activePoll) || (isParent && activePoll?.status === "open" && showPollBuilder) ? (
          renderCreateView()
        ) : !activePoll ? (
          <View style={[styles.card, { backgroundColor: theme.card, alignItems: "center" }]}> 
            <MaterialCommunityIcons name="vote-outline" size={44} color={theme.tint} />
            <Text style={[styles.cardTitle, { color: theme.text, textAlign: "center", marginTop: 10 }]}>Aucun sondage actif</Text>
            <Text style={[styles.cardText, { color: theme.textSecondary, textAlign: "center" }]}>Un sondage doit être ouvert pour démarrer les votes.</Text>
          </View>
        ) : activePoll.status === "open" ? (
          renderVotingView()
        ) : activePoll.status === "closed" ? (
          renderClosedView()
        ) : (
          renderValidatedView()
        )}
      </ScrollView>

      <MealPollPlanningDateModal
        visible={planningPickerVisible}
        theme={theme}
        styles={styles}
        planningPickerTarget={planningPickerTarget}
        planningPickerMonth={planningPickerMonth}
        planningMonthCells={planningMonthCells}
        selectedPlanningDateIso={selectedPlanningDateIso}
        weekdays={PLANNING_WEEKDAYS}
        monthLabel={monthLabel}
        onRequestClose={() => setPlanningPickerVisible(false)}
        onShiftPlanningPickerMonth={shiftPlanningPickerMonth}
        onSelectPlanningDate={selectPlanningDate}
      />

      <MealPollPlannerModal
        visible={plannerVisible}
        theme={theme}
        styles={styles}
        plannerRecipeTitle={plannerRecipe?.title || "Recette"}
        weekSlots={weekSlots}
        plannerDate={plannerDate}
        plannerMealType={plannerMealType}
        plannerServings={plannerServings}
        onRequestClose={() => setPlannerVisible(false)}
        onPlannerDateChange={setPlannerDate}
        onPlannerMealTypeChange={setPlannerMealType}
        onDecreaseServings={() => setPlannerServings((prev) => clamp(prev - 1, 1, 30))}
        onIncreaseServings={() => setPlannerServings((prev) => clamp(prev + 1, 1, 30))}
        onAssignRecipeToSlot={assignRecipeToSlot}
      />

      <ShoppingListPickerModal
        visible={shoppingPickerVisible}
        title="Ajouter le repas à la liste de courses"
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



