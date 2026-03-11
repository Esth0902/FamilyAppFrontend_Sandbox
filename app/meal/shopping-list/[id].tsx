import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";
import { subscribeToHouseholdRealtime } from "@/src/realtime/client";
import { getStoredHouseholdId } from "@/src/session/user-cache";

type ShoppingListItem = {
  id: number;
  ingredient_id?: number | null;
  name: string;
  quantity?: string | null;
  unit?: string | null;
  is_checked: boolean;
  checked_by?: { id: number; name: string } | null;
  created_by?: { id: number; name: string } | null;
  is_manual_addition: boolean;
};

type RecipeIngredientSuggestion = {
  ingredient_id?: number | null;
  name: string;
  quantity: string;
  unit?: string | null;
  already_in_list: boolean;
};

type PlannedRecipeSuggestion = {
  meal_plan_id: number;
  recipe_id: number;
  recipe_title: string;
  date?: string | null;
  meal_type: "matin" | "midi" | "soir";
  servings: number;
  already_in_list: boolean;
  ingredients: RecipeIngredientSuggestion[];
};

type ShoppingListDetailPayload = {
  can_manage: boolean;
  can_add_manual_items?: boolean;
  planned_meals_from?: string;
  planned_meals_to?: string;
  planned_recipe_suggestions?: PlannedRecipeSuggestion[];
  list: {
    id: number;
    title: string;
    status: "active" | "inactive";
    items: ShoppingListItem[];
  };
};

const parseDate = (isoDate: string) => new Date(`${isoDate}T00:00:00`);

const mealTypeLabel = (mealType: "matin" | "midi" | "soir") => {
  if (mealType === "matin") return "Matin";
  if (mealType === "midi") return "Midi";
  return "Soir";
};

const formatMealSlot = (isoDate?: string | null, mealType?: "matin" | "midi" | "soir") => {
  if (!isoDate) return mealType ? mealTypeLabel(mealType) : "-";
  const parsed = parseDate(isoDate);
  if (Number.isNaN(parsed.getTime())) return `${isoDate} - ${mealTypeLabel(mealType || "soir")}`;

  return `${parsed.toLocaleDateString("fr-BE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  })} - ${mealTypeLabel(mealType || "soir")}`;
};

const normalizeIngredientKey = (ingredientId?: number | null, name?: string, unit?: string | null) => {
  if (ingredientId && Number.isInteger(ingredientId)) {
    return `id:${ingredientId}`;
  }
  return `name:${(name || "").trim().toLowerCase()}|unit:${(unit || "").trim().toLowerCase()}`;
};

export default function ShoppingListDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [canAddManualItems, setCanAddManualItems] = useState(false);
  const [listTitle, setListTitle] = useState("Liste");
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [plannedRecipes, setPlannedRecipes] = useState<PlannedRecipeSuggestion[]>([]);
  const [expandedRecipeKeys, setExpandedRecipeKeys] = useState<string[]>([]);

  const [manualName, setManualName] = useState("");
  const [manualQuantity, setManualQuantity] = useState("");
  const [manualUnit, setManualUnit] = useState("");

  const listId = Number(id);
  const hasValidId = Number.isInteger(listId) && listId > 0;

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.is_checked !== b.is_checked) {
        return a.is_checked ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [items]);

  const recipeKey = (recipe: PlannedRecipeSuggestion) => `${recipe.meal_plan_id}-${recipe.recipe_id}`;

  const upsertItemInState = (item: ShoppingListItem) => {
    setItems((prev) => {
      const existingIndex = prev.findIndex((current) => current.id === item.id);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = item;
        return next;
      }
      return [item, ...prev];
    });
  };

  const markIngredientAddedLocally = (name: string, unit?: string | null) => {
    const targetKey = normalizeIngredientKey(undefined, name, unit);
    setPlannedRecipes((prev) =>
      prev.map((recipe) => {
        const nextIngredients = recipe.ingredients.map((ingredient) =>
          normalizeIngredientKey(ingredient.ingredient_id, ingredient.name, ingredient.unit) === targetKey
            ? { ...ingredient, already_in_list: true }
            : ingredient
        );

        return {
          ...recipe,
          ingredients: nextIngredients,
          already_in_list: nextIngredients.length > 0 && nextIngredients.every((ingredient) => ingredient.already_in_list),
        };
      })
    );
  };

  const loadList = useCallback(async (options?: { silent?: boolean; showError?: boolean }) => {
    const silent = options?.silent ?? false;
    const showError = options?.showError ?? !silent;

    if (!hasValidId) {
      if (!silent) {
        setLoading(false);
      }
      return;
    }

    if (!silent) {
      setLoading(true);
    }

    try {
      const response = (await apiFetch(`/shopping-lists/${listId}`)) as ShoppingListDetailPayload;
      setCanManage(Boolean(response?.can_manage));
      setCanAddManualItems(Boolean(response?.can_add_manual_items ?? response?.can_manage));
      setListTitle(response?.list?.title ?? "Liste");
      setItems(Array.isArray(response?.list?.items) ? response.list.items : []);
      setPlannedRecipes(Array.isArray(response?.planned_recipe_suggestions) ? response.planned_recipe_suggestions : []);

      if (!silent) {
        setExpandedRecipeKeys([]);
      }
    } catch (error: any) {
      if (showError) {
        Alert.alert("Liste de courses", error?.message || "Impossible de charger la liste.");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [hasValidId, listId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let unsubscribeRealtime: (() => void) | null = null;

      const bootstrapRealtime = async () => {
        await loadList({ silent: false, showError: true });

        if (!active) return;

        const householdId = await getStoredHouseholdId();
        if (!householdId || !active) return;

        unsubscribeRealtime = await subscribeToHouseholdRealtime(householdId, (message) => {
          if (message?.module !== "shopping_list") return;

          const payloadListId = Number((message?.payload as Record<string, unknown> | undefined)?.list_id ?? 0) || null;
          if (payloadListId && payloadListId !== listId) return;

          void loadList({ silent: true, showError: false });
        }, (error) => {
          if (__DEV__) {
            console.warn("[shopping-list detail] realtime disabled, fallback polling active", error);
          }
        });
      };

      void bootstrapRealtime();

      const fallbackInterval = setInterval(() => {
        if (!active) return;
        void loadList({ silent: true, showError: false });
      }, 10000);

      return () => {
        active = false;
        if (unsubscribeRealtime) {
          unsubscribeRealtime();
        }
        clearInterval(fallbackInterval);
      };
    }, [listId, loadList])
  );

  const toggleChecked = async (item: ShoppingListItem) => {
    try {
      const updated = await apiFetch(`/shopping-lists/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_checked: !item.is_checked }),
      });
      setItems((prev) => prev.map((current) => (current.id === item.id ? updated : current)));
    } catch (error: any) {
      Alert.alert("Liste de courses", error?.message || "Impossible de mettre à jour l'élément.");
    }
  };

  const deleteItem = async (itemId: number) => {
    if (!canManage) return;

    setSaving(true);
    try {
      await apiFetch(`/shopping-lists/items/${itemId}`, { method: "DELETE" });
      setItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (error: any) {
      Alert.alert("Liste de courses", error?.message || "Impossible de supprimer cet élément.");
    } finally {
      setSaving(false);
    }
  };

  const addManualItem = async () => {
    if (!canAddManualItems || !hasValidId) return;

    const name = manualName.trim();
    if (!name) {
      Alert.alert("Liste de courses", "Le nom de l'ingrédient est obligatoire.");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        unit: manualUnit.trim() || null,
      };

      const rawQty = manualQuantity.trim();
      if (rawQty !== "") {
        const parsed = Number(rawQty.replace(",", "."));
        if (!Number.isFinite(parsed) || parsed < 0) {
          Alert.alert("Liste de courses", "La quantité doit être numérique.");
          setSaving(false);
          return;
        }
        payload.quantity = parsed;
      }

      const created = await apiFetch(`/shopping-lists/${listId}/items`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      upsertItemInState(created);
      setManualName("");
      setManualQuantity("");
      setManualUnit("");
    } catch (error: any) {
      Alert.alert("Liste de courses", error?.message || "Impossible d'ajouter cet ingrédient.");
    } finally {
      setSaving(false);
    }
  };

  const toggleRecipeExpanded = (recipe: PlannedRecipeSuggestion) => {
    const key = recipeKey(recipe);
    setExpandedRecipeKeys((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  };

  const addPlannedIngredient = async (ingredient: RecipeIngredientSuggestion) => {
    if (!canManage || !hasValidId) return;
    if (ingredient.already_in_list) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ingredient_id: ingredient.ingredient_id ?? null,
        name: ingredient.name,
        unit: ingredient.unit ?? null,
        is_manual_addition: false,
      };

      const parsedQty = Number(ingredient.quantity);
      if (Number.isFinite(parsedQty)) {
        payload.quantity = parsedQty;
      }

      const created = await apiFetch(`/shopping-lists/${listId}/items`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      upsertItemInState(created);
      markIngredientAddedLocally(ingredient.name, ingredient.unit);
    } catch (error: any) {
      Alert.alert("Liste de courses", error?.message || "Impossible d'ajouter cet ingrédient.");
    } finally {
      setSaving(false);
    }
  };

  const addAllPlannedIngredients = async (recipe: PlannedRecipeSuggestion) => {
    if (!canManage || !hasValidId) return;

    const alreadyAddedKeys = new Set<string>();
    const missingIngredients = recipe.ingredients.filter((ingredient) => {
      const key = normalizeIngredientKey(ingredient.ingredient_id, ingredient.name, ingredient.unit);
      if (ingredient.already_in_list) return false;
      if (alreadyAddedKeys.has(key)) return false;
      alreadyAddedKeys.add(key);
      return true;
    });

    if (missingIngredients.length === 0) {
      return;
    }

    setSaving(true);
    try {
      for (const ingredient of missingIngredients) {
        const payload: Record<string, unknown> = {
          ingredient_id: ingredient.ingredient_id ?? null,
          name: ingredient.name,
          unit: ingredient.unit ?? null,
          is_manual_addition: false,
        };

        const parsedQty = Number(ingredient.quantity);
        if (Number.isFinite(parsedQty)) {
          payload.quantity = parsedQty;
        }

        const created = await apiFetch(`/shopping-lists/${listId}/items`, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        upsertItemInState(created);
        markIngredientAddedLocally(ingredient.name, ingredient.unit);
      }
    } catch (error: any) {
      Alert.alert("Liste de courses", error?.message || "Impossible d'ajouter les ingrédients de la recette.");
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

  if (!hasValidId) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text }}>Liste invalide.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: theme.icon }]}>
        <TouchableOpacity onPress={() => router.replace("/meal/shopping-list")}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>{listTitle}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Repas planifiés</Text>

          {plannedRecipes.length > 0 ? (
            plannedRecipes.map((recipe) => {
              const key = recipeKey(recipe);
              const isExpanded = expandedRecipeKeys.includes(key);
              const missingCount = recipe.ingredients.filter((ingredient) => !ingredient.already_in_list).length;

              return (
                <View key={key} style={[styles.recipeBlock, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                  <View style={styles.recipeHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: "700" }}>{recipe.recipe_title}</Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                        {formatMealSlot(recipe.date, recipe.meal_type)} - {recipe.servings} portions
                      </Text>
                    </View>

                    <View style={styles.recipeActionRow}>
                      {canManage ? (
                        <TouchableOpacity
                          onPress={() => void addAllPlannedIngredients(recipe)}
                          style={[
                            styles.smallBtn,
                            {
                              backgroundColor: missingCount === 0 ? theme.icon : theme.tint,
                              opacity: saving ? 0.7 : 1,
                            },
                          ]}
                          disabled={saving || missingCount === 0}
                        >
                          <Text style={styles.smallBtnText}>{missingCount === 0 ? "Ajoutés" : "Ajouter ingrédients"}</Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity
                        onPress={() => toggleRecipeExpanded(recipe)}
                        style={[styles.expandBtn, { borderColor: theme.icon }]}
                      >
                        <MaterialCommunityIcons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={theme.text} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {isExpanded ? (
                    <View style={{ marginTop: 8 }}>
                      {recipe.ingredients.length > 0 ? (
                        recipe.ingredients.map((ingredient, index) => (
                          <View key={`${key}-${index}`} style={[styles.itemRow, { borderColor: theme.icon, backgroundColor: theme.card }]}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: theme.text, fontWeight: "600" }}>{ingredient.name}</Text>
                              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                                {ingredient.quantity} {ingredient.unit || ""}
                                {ingredient.already_in_list ? " - déjà dans la liste" : ""}
                              </Text>
                            </View>
                            {canManage ? (
                              <TouchableOpacity
                                onPress={() => void addPlannedIngredient(ingredient)}
                                style={[
                                  styles.smallBtn,
                                  {
                                    backgroundColor: ingredient.already_in_list ? theme.icon : theme.tint,
                                    opacity: saving ? 0.7 : 1,
                                  },
                                ]}
                                disabled={saving || ingredient.already_in_list}
                              >
                                <Text style={styles.smallBtnText}>{ingredient.already_in_list ? "Ajouté" : "Ajouter"}</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        ))
                      ) : (
                        <Text style={{ color: theme.textSecondary }}>Aucun ingrédient détaillé pour cette recette.</Text>
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })
          ) : (
            <Text style={{ color: theme.textSecondary }}>Aucun repas planifié à venir.</Text>
          )}
        </View>

        {canAddManualItems ? (
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Ajouter manuellement</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
              value={manualName}
              onChangeText={setManualName}
              placeholder="Nom ingrédient"
              placeholderTextColor={theme.textSecondary}
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.flex, { backgroundColor: theme.background, color: theme.text }]}
                value={manualQuantity}
                onChangeText={setManualQuantity}
                placeholder="Quantité"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.input, styles.flex, { backgroundColor: theme.background, color: theme.text }]}
                value={manualUnit}
                onChangeText={setManualUnit}
                placeholder="Unité"
                placeholderTextColor={theme.textSecondary}
              />
              <TouchableOpacity
                onPress={() => void addManualItem()}
                style={[styles.addBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
                disabled={saving}
              >
                <Text style={styles.addBtnText}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            Liste ({items.filter((item) => item.is_checked).length}/{items.length})
          </Text>
          {sortedItems.length > 0 ? (
            sortedItems.map((item) => (
              <View key={item.id} style={[styles.itemRow, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                <TouchableOpacity onPress={() => void toggleChecked(item)} style={{ paddingRight: 4 }}>
                  <MaterialCommunityIcons
                    name={item.is_checked ? "checkbox-marked" : "checkbox-blank-outline"}
                    size={22}
                    color={item.is_checked ? theme.tint : theme.textSecondary}
                  />
                </TouchableOpacity>

                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      { color: theme.text, fontWeight: "600" },
                      item.is_checked && { color: theme.textSecondary, textDecorationLine: "line-through" },
                    ]}
                  >
                    {item.name}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    {item.quantity || "-"} {item.unit || ""}{" "}
                    {item.is_manual_addition
                      ? item.created_by?.name
                        ? `- ajouté par ${item.created_by.name}`
                        : "- ajouté manuellement"
                      : ""}
                  </Text>
                  {item.is_checked && item.checked_by?.name ? (
                    <View style={[styles.checkedByTag, { backgroundColor: `${theme.tint}22`, borderColor: theme.tint }]}>
                      <Text style={[styles.checkedByTagText, { color: theme.tint }]}>
                        Coche par {item.checked_by.name}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {canManage ? (
                  <TouchableOpacity onPress={() => void deleteItem(item.id)} disabled={saving}>
                    <MaterialCommunityIcons name="trash-can-outline" size={20} color="#CC4B4B" />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          ) : (
            <Text style={{ color: theme.textSecondary }}>Aucun ingrédient dans cette liste.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    height: 60,
    marginTop: 28,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: "700" },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  card: { borderRadius: 14, padding: 12 },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  recipeBlock: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  recipeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recipeActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  expandBtn: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  flex: { flex: 1 },
  input: { borderRadius: 10, height: 42, paddingHorizontal: 12, marginBottom: 8 },
  addBtn: {
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: { color: "white", fontWeight: "700" },
  smallBtn: {
    borderRadius: 10,
    height: 34,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  smallBtnText: { color: "white", fontWeight: "700", fontSize: 12 },
  checkedByTag: {
    marginTop: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  checkedByTagText: {
    fontSize: 11,
    fontWeight: "700",
  },
  itemRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
