import { useCallback, useState } from "react";
import { Alert } from "react-native";
import {
    addIngredientsToShoppingList,
    buildShoppingIngredientsFromRecipeSelections,
    createShoppingList,
    defaultShoppingListTitle,
    loadShoppingLists,
    resolvePreferredShoppingListId,
    type ShoppingListSummary,
} from "@/src/features/shopping-list/list-utils";
import type { Recipe } from "@/src/services/recipeService";

type UseRecipeShoppingListArgs = {
    isParent: boolean;
    isMutationPending: boolean;
    onNavigateToList: (listId: number) => void;
};

export const useRecipeShoppingList = ({
    isParent,
    isMutationPending,
    onNavigateToList,
}: UseRecipeShoppingListArgs) => {
    const [isShoppingSubmitting, setIsShoppingSubmitting] = useState(false);
    const [shoppingPickerVisible, setShoppingPickerVisible] = useState(false);
    const [shoppingLists, setShoppingLists] = useState<ShoppingListSummary[]>([]);
    const [selectedShoppingListId, setSelectedShoppingListId] = useState<number | null>(null);
    const [useNewShoppingList, setUseNewShoppingList] = useState(false);
    const [newShoppingListTitle, setNewShoppingListTitle] = useState(defaultShoppingListTitle());
    const [pendingRecipeForShopping, setPendingRecipeForShopping] = useState<Recipe | null>(null);

    const isSubmitting = isMutationPending || isShoppingSubmitting;

    const openRecipeShoppingListPicker = useCallback(async (recipe: Recipe) => {
        if (!isParent || isSubmitting) {
            return;
        }

        setIsShoppingSubmitting(true);
        try {
            const payload = await loadShoppingLists();
            if (!payload.can_manage) {
                Alert.alert("Liste de courses", "Seul un parent peut ajouter des ingrédients à la liste de courses.");
                return;
            }

            const availableLists = payload.lists;
            setShoppingLists(availableLists);
            setSelectedShoppingListId(resolvePreferredShoppingListId(availableLists));
            setUseNewShoppingList(availableLists.length === 0);
            setNewShoppingListTitle(defaultShoppingListTitle());
            setPendingRecipeForShopping(recipe);
            setShoppingPickerVisible(true);
        } catch (error: any) {
            Alert.alert("Liste de courses", error?.message || "Impossible de charger les listes de courses.");
        } finally {
            setIsShoppingSubmitting(false);
        }
    }, [isParent, isSubmitting]);

    const closeRecipeShoppingListPicker = useCallback(() => {
        if (isSubmitting) {
            return;
        }

        setShoppingPickerVisible(false);
        setPendingRecipeForShopping(null);
    }, [isSubmitting]);

    const confirmRecipeShoppingListSelection = useCallback(async () => {
        if (!pendingRecipeForShopping) {
            return;
        }

        setIsShoppingSubmitting(true);
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

            const servings = Math.max(1, Number(pendingRecipeForShopping.display_servings ?? pendingRecipeForShopping.base_servings ?? 1));
            const ingredients = await buildShoppingIngredientsFromRecipeSelections([
                { recipeId: pendingRecipeForShopping.id, servings },
            ]);

            if (ingredients.length === 0) {
                Alert.alert("Liste de courses", "Cette recette ne contient aucun ingrédient exploitable.");
                return;
            }

            const addedCount = await addIngredientsToShoppingList(targetListId, ingredients);
            setShoppingPickerVisible(false);
            setPendingRecipeForShopping(null);

            Alert.alert(
                "Liste de courses",
                `${addedCount} ingrédient(s) de "${pendingRecipeForShopping.title}" ajouté(s) à "${targetListTitle}".`,
                [
                    { text: "Fermer", style: "cancel" },
                    {
                        text: "Voir la liste",
                        onPress: () => onNavigateToList(targetListId),
                    },
                ],
            );
        } catch (error: any) {
            Alert.alert("Liste de courses", error?.message || "Impossible d'ajouter les ingrédients de la recette.");
        } finally {
            setIsShoppingSubmitting(false);
        }
    }, [
        newShoppingListTitle,
        onNavigateToList,
        pendingRecipeForShopping,
        selectedShoppingListId,
        shoppingLists,
        useNewShoppingList,
    ]);

    return {
        shoppingPickerVisible,
        pendingRecipeForShopping,
        shoppingLists,
        selectedShoppingListId,
        useNewShoppingList,
        newShoppingListTitle,
        isShoppingSubmitting,
        isSubmitting,
        openRecipeShoppingListPicker,
        closeRecipeShoppingListPicker,
        confirmRecipeShoppingListSelection,
        setSelectedShoppingListId,
        setUseNewShoppingList,
        setNewShoppingListTitle,
    };
};
