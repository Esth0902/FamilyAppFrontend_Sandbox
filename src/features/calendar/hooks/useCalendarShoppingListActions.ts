import { useCallback, useState } from "react";
import { Alert, InteractionManager } from "react-native";

import { clamp } from "@/src/features/calendar/calendar-tab.helpers";
import type { MealPlanEntry } from "@/src/features/calendar/calendar-tab.types";
import {
  addIngredientsToShoppingList,
  buildShoppingIngredientsFromRecipeSelections,
  createShoppingList,
  defaultShoppingListTitle,
  loadShoppingLists,
  resolvePreferredShoppingListId,
  type ShoppingListSummary,
} from "@/src/features/shopping-list/list-utils";

type UseCalendarShoppingListActionsParams = {
  canManageMealPlan: boolean;
  dayProgramModalVisible: boolean;
  setDayProgramModalVisible: (visible: boolean) => void;
  saving: boolean;
  setSaving: (value: boolean) => void;
  onNavigateToShoppingList: (shoppingListId: number) => void;
};

export function useCalendarShoppingListActions({
  canManageMealPlan,
  dayProgramModalVisible,
  setDayProgramModalVisible,
  saving,
  setSaving,
  onNavigateToShoppingList,
}: UseCalendarShoppingListActionsParams) {
  const [shoppingPickerVisible, setShoppingPickerVisible] = useState(false);
  const [shoppingLists, setShoppingLists] = useState<ShoppingListSummary[]>([]);
  const [selectedShoppingListId, setSelectedShoppingListId] = useState<number | null>(null);
  const [useNewShoppingList, setUseNewShoppingList] = useState(false);
  const [newShoppingListTitle, setNewShoppingListTitle] = useState(defaultShoppingListTitle());
  const [pendingMealPlanForShopping, setPendingMealPlanForShopping] = useState<MealPlanEntry | null>(null);
  const [restoreDayProgramAfterShoppingPicker, setRestoreDayProgramAfterShoppingPicker] = useState(false);

  const openMealPlanShoppingListPicker = useCallback(
    async (entry: MealPlanEntry) => {
      if (!canManageMealPlan) {
        Alert.alert("Calendrier", "Seul un parent peut ajouter un repas à la liste de courses.");
        return;
      }
      if (saving) {
        Alert.alert("Calendrier", "Une action est déjà en cours. Réessaie dans un instant.");
        return;
      }

      const plannedRecipes = entry.recipes.filter((recipe) => Number.isInteger(recipe.id) && recipe.id > 0);
      if (plannedRecipes.length === 0) {
        Alert.alert("Calendrier", "Cette planification de repas ne contient pas de recette exploitable pour la liste de courses.");
        return;
      }

      setSaving(true);
      try {
        const payload = await loadShoppingLists();
        if (!payload.can_manage) {
          Alert.alert("Calendrier", "Seul un parent peut modifier la liste de courses.");
          return;
        }

        setShoppingLists(payload.lists);
        setSelectedShoppingListId(resolvePreferredShoppingListId(payload.lists));
        setUseNewShoppingList(payload.lists.length === 0);
        setNewShoppingListTitle(defaultShoppingListTitle());
        setPendingMealPlanForShopping(entry);
        const openedFromDayProgram = dayProgramModalVisible;
        setRestoreDayProgramAfterShoppingPicker(openedFromDayProgram);
        if (openedFromDayProgram) {
          setDayProgramModalVisible(false);
          InteractionManager.runAfterInteractions(() => {
            setShoppingPickerVisible(true);
          });
        } else {
          setShoppingPickerVisible(true);
        }
      } catch (error: any) {
        Alert.alert("Calendrier", error?.message || "Impossible de charger les listes de courses.");
      } finally {
        setSaving(false);
      }
    },
    [canManageMealPlan, dayProgramModalVisible, saving, setDayProgramModalVisible, setSaving]
  );

  const closeMealPlanShoppingListPicker = useCallback(() => {
    if (saving) return;
    setShoppingPickerVisible(false);
    setPendingMealPlanForShopping(null);
    if (restoreDayProgramAfterShoppingPicker) {
      setDayProgramModalVisible(true);
      setRestoreDayProgramAfterShoppingPicker(false);
    }
  }, [restoreDayProgramAfterShoppingPicker, saving, setDayProgramModalVisible]);

  const confirmMealPlanShoppingListSelection = useCallback(async () => {
    if (!pendingMealPlanForShopping) {
      return;
    }

    const plannedRecipes = pendingMealPlanForShopping.recipes
      .filter((recipe) => Number.isInteger(recipe.id) && recipe.id > 0)
      .map((recipe) => ({ recipeId: recipe.id, servings: clamp(Number(recipe.servings) || 1, 1, 30) }));

    if (plannedRecipes.length === 0) {
      Alert.alert("Calendrier", "Aucune recette exploitable dans cette planification de repas.");
      return;
    }

    setSaving(true);
    try {
      let targetListId = selectedShoppingListId;
      let targetListTitle = shoppingLists.find((list) => list.id === selectedShoppingListId)?.title ?? "";

      if (useNewShoppingList) {
        const created = await createShoppingList(newShoppingListTitle);
        if (!created?.id) {
          Alert.alert("Calendrier", "Impossible de créer la nouvelle liste.");
          return;
        }
        targetListId = created.id;
        targetListTitle = created.title;
      }

      if (!targetListId) {
        Alert.alert("Calendrier", "Choisis une liste existante ou crée-en une nouvelle.");
        return;
      }

      const ingredients = await buildShoppingIngredientsFromRecipeSelections(plannedRecipes);
      if (ingredients.length === 0) {
        Alert.alert("Calendrier", "Aucun ingrédient exploitable à ajouter.");
        return;
      }

      const addedCount = await addIngredientsToShoppingList(targetListId, ingredients);
      setShoppingPickerVisible(false);
      setPendingMealPlanForShopping(null);
      if (restoreDayProgramAfterShoppingPicker) {
        setDayProgramModalVisible(true);
        setRestoreDayProgramAfterShoppingPicker(false);
      }

      Alert.alert(
        "Calendrier",
        `${addedCount} ingrédient(s) ajouté(s) à "${targetListTitle}".`,
        [
          { text: "Fermer", style: "cancel" },
          { text: "Voir la liste", onPress: () => onNavigateToShoppingList(targetListId) },
        ]
      );
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible d'ajouter les ingrédients à la liste de courses.");
    } finally {
      setSaving(false);
    }
  }, [
    newShoppingListTitle,
    onNavigateToShoppingList,
    pendingMealPlanForShopping,
    restoreDayProgramAfterShoppingPicker,
    selectedShoppingListId,
    setDayProgramModalVisible,
    setSaving,
    shoppingLists,
    useNewShoppingList,
  ]);

  return {
    shoppingPickerVisible,
    shoppingLists,
    selectedShoppingListId,
    useNewShoppingList,
    newShoppingListTitle,
    pendingMealPlanForShopping,
    setSelectedShoppingListId,
    setUseNewShoppingList,
    setNewShoppingListTitle,
    openMealPlanShoppingListPicker,
    closeMealPlanShoppingListPicker,
    confirmMealPlanShoppingListSelection,
  };
}
