import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { useDebounce } from "@/src/hooks/useDebounce";
import { useRecipes } from "@/src/hooks/useRecipes";
import { useStoredUserState } from "@/src/session/user-cache";
import { RECIPE_TYPE_FILTERS, type RecipeTab } from "@/src/features/recipes/recipe-types";
import { recipesScreenStyles as styles } from "@/src/features/recipes/recipes-screen-styles";
import { useRecipeShoppingList } from "@/src/features/recipes/useRecipeShoppingList";
import { RecipeCard } from "@/src/features/recipes/RecipeCard";
import { RecipeModal } from "@/src/features/recipes/RecipeModal";
import { ShoppingListPickerModal } from "@/src/features/shopping-list/shopping-list-picker-modal";
import type { Recipe } from "@/src/services/recipeService";
import {
  clearMealPollRecipePickerLaunchState,
  getMealPollRecipePickerLaunchState,
  setMealPollRecipePickerSelectionState,
} from "@/src/features/meals/recipes/recipe-picker-session";

const normalizeRecipeIds = (recipeIds: number[]) =>
  Array.from(new Set(recipeIds.filter((id) => Number.isInteger(id) && id > 0)));

export default function MealRecipesScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const isDarkMode = colorScheme === "dark";
  const { householdId, role } = useStoredUserState();
  const isParent = role === "parent";
  const params = useLocalSearchParams<{ picker?: string }>();
  const isPollRecipePickerMode = params.picker === "meal-poll-create";

  const [search, setSearch] = useState("");
  const [selectedTab, setSelectedTab] = useState<RecipeTab>("mine");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("all");
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [pickerSelectedRecipeIds, setPickerSelectedRecipeIds] = useState<number[]>([]);
  const [isTypeFilterExpanded, setIsTypeFilterExpanded] = useState(true);

  const debouncedSearch = useDebounce(search, 400);
  const recipesApi = useRecipes({
    householdId,
    scope: selectedTab,
    searchQuery: debouncedSearch,
    typeFilter: selectedTypeFilter,
    limit: 20,
  });

  const shopping = useRecipeShoppingList({
    isParent,
    isMutationPending: recipesApi.isMutationPending,
    onNavigateToList: (listId) => router.push(`/meal/shopping-list/${listId}`),
  });
  const isSubmitting = recipesApi.isMutationPending || shopping.isShoppingSubmitting;

  useEffect(() => {
    if (!isPollRecipePickerMode) {
      setPickerSelectedRecipeIds([]);
      return;
    }

    const launchState = getMealPollRecipePickerLaunchState();
    setPickerSelectedRecipeIds(normalizeRecipeIds(launchState?.selectedRecipeIds ?? []));
  }, [isPollRecipePickerMode]);

  useEffect(() => {
    setIsTypeFilterExpanded(!isPollRecipePickerMode);
  }, [isPollRecipePickerMode]);

  const openRecipeActions = useCallback((recipe: Recipe) => {
    if (!isParent || !recipe.is_owned_by_household) return;

    Alert.alert(recipe.title, "Que veux-tu faire ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Modifier",
        onPress: () =>
          router.push({
            pathname: "/meal/recipe-detail",
            params: { id: recipe.id, autoEdit: "true" },
          }),
      },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: () =>
          void recipesApi
            .deleteRecipe(recipe.id)
            .catch(() => Alert.alert("Recettes", "Impossible de supprimer la recette.")),
      },
    ]);
  }, [isParent, recipesApi]);

  const togglePickerRecipe = useCallback((recipeId: number) => {
    setPickerSelectedRecipeIds((previous) => (
      previous.includes(recipeId)
        ? previous.filter((id) => id !== recipeId)
        : [...previous, recipeId]
    ));
  }, []);

  const selectedPickerRecipes = useMemo(
    () => recipesApi.recipes.filter((recipe) => pickerSelectedRecipeIds.includes(recipe.id)),
    [pickerSelectedRecipeIds, recipesApi.recipes]
  );

  const confirmPickerSelection = useCallback(() => {
    const normalizedIds = normalizeRecipeIds(pickerSelectedRecipeIds);
    setMealPollRecipePickerSelectionState({
      selectedRecipeIds: normalizedIds,
      selectedRecipes: selectedPickerRecipes.map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        type: recipe.type,
      })),
    });
    clearMealPollRecipePickerLaunchState();
    router.back();
  }, [pickerSelectedRecipeIds, selectedPickerRecipes]);

  const cancelPickerSelection = useCallback(() => {
    clearMealPollRecipePickerLaunchState();
    router.back();
  }, []);

  const renderRecipeItem = useCallback(({ item }: { item: Recipe }) => (
    <RecipeCard
      recipe={item}
      selectedTab={selectedTab}
      isParent={isParent}
      isSubmitting={isSubmitting}
      theme={theme}
      isDarkMode={isDarkMode}
      onOpenDetails={(recipeId) =>
        router.push({ pathname: "/meal/recipe-detail", params: { id: recipeId } })
      }
      onToggleSave={(recipe) =>
        void recipesApi
          .toggleGlobalRecipeInMine(recipe)
          .catch((error: any) =>
            Alert.alert("Recettes", error?.message || "Impossible de mettre à jour cette recette.")
          )
      }
      onAddToShopping={(recipe) => void shopping.openRecipeShoppingListPicker(recipe)}
      onOpenActions={openRecipeActions}
    />
  ), [
    isDarkMode,
    isParent,
    isSubmitting,
    openRecipeActions,
    recipesApi,
    selectedTab,
    shopping,
    theme,
  ]);

  const renderPickerRecipeItem = useCallback(({ item }: { item: Recipe }) => {
    const selected = pickerSelectedRecipeIds.includes(item.id);
    return (
      <TouchableOpacity
        onPress={() => togglePickerRecipe(item.id)}
        style={[
          pickerStyles.recipeRow,
          {
            borderColor: selected ? theme.tint : theme.icon,
            backgroundColor: selected ? `${theme.tint}18` : (isDarkMode ? "#1E1E1E" : "#FFFFFF"),
          },
        ]}
      >
        <View style={pickerStyles.recipeRowText}>
          <Text style={{ color: theme.text, fontWeight: "700" }} numberOfLines={1}>{item.title}</Text>
          <Text style={{ color: theme.textSecondary, marginTop: 2 }} numberOfLines={1}>
            {item.type || "autre"}
          </Text>
        </View>
        <MaterialCommunityIcons
          name={selected ? "check-circle" : "checkbox-blank-circle-outline"}
          size={22}
          color={selected ? theme.tint : theme.icon}
        />
      </TouchableOpacity>
    );
  }, [isDarkMode, pickerSelectedRecipeIds, theme.icon, theme.text, theme.textSecondary, theme.tint, togglePickerRecipe]);

  if (recipesApi.isInitialLoading) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center", backgroundColor: theme.background },
        ]}
      >
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title={isPollRecipePickerMode ? "Choisir des recettes" : "Gestion des recettes"}
        subtitle={isPollRecipePickerMode ? "Sélectionne des recettes puis valide pour revenir au sondage." : undefined}
        withBackButton
        onBackPress={isPollRecipePickerMode ? cancelPickerSelection : undefined}
        backHref={isPollRecipePickerMode ? undefined : "/(app)/(tabs)/meal"}
        safeTop
        showBorder
      />

      <View
        style={[
          styles.searchContainer,
          { backgroundColor: isDarkMode ? "#1E1E1E" : "#EEE" },
        ]}
      >
        <MaterialCommunityIcons name="magnify" size={20} color={theme.icon} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Rechercher une recette..."
          placeholderTextColor={theme.icon}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.tabsRow}>
        {(["mine", "all"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setSelectedTab(tab)}
            style={[
              styles.tabButton,
              {
                borderColor: selectedTab === tab ? theme.tint : theme.icon,
                backgroundColor: selectedTab === tab ? `${theme.tint}22` : "transparent",
              },
            ]}
          >
            <Text
              style={{
                color: selectedTab === tab ? theme.tint : theme.text,
                fontWeight: "700",
              }}
            >
              {tab === "mine" ? "Mes recettes" : "Toutes les recettes"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View
        style={[
          styles.typeFilterPanel,
          {
            backgroundColor: isDarkMode ? "#171717" : "#F4F6F8",
            borderColor: isDarkMode ? "#2A2A2A" : "#DCE1E8",
          },
        ]}
      >
        <View style={styles.typeFilterHeader}>
          <TouchableOpacity
            onPress={() => setIsTypeFilterExpanded((previous) => !previous)}
            style={styles.typeFilterHeaderLeft}
            accessibilityRole="button"
            accessibilityLabel="Ouvrir ou fermer le filtre par type"
          >
            <MaterialCommunityIcons
              name={isTypeFilterExpanded ? "chevron-down" : "chevron-right"}
              size={18}
              color={theme.icon}
            />
            <MaterialCommunityIcons name="tune-variant" size={18} color={theme.icon} />
            <Text style={{ color: theme.text, fontWeight: "700" }}>Filtrer par type</Text>
          </TouchableOpacity>
          {isTypeFilterExpanded && selectedTypeFilter !== "all" ? (
            <TouchableOpacity onPress={() => setSelectedTypeFilter("all")}>
              <Text style={{ color: theme.tint, fontWeight: "600" }}>Réinitialiser</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {isTypeFilterExpanded ? (
          <View style={styles.typeFiltersWrap}>
          {RECIPE_TYPE_FILTERS.map((filter) => {
            const selected = selectedTypeFilter === filter.value;
            return (
              <TouchableOpacity
                key={filter.value}
                onPress={() => setSelectedTypeFilter(filter.value)}
                style={[
                  styles.typeFilterChip,
                  {
                    borderColor: selected ? theme.tint : theme.icon,
                    backgroundColor: selected ? `${theme.tint}18` : "transparent",
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={filter.icon}
                  size={16}
                  color={selected ? theme.tint : theme.icon}
                />
                <Text
                  style={{
                    color: selected ? theme.tint : theme.text,
                    fontWeight: selected ? "700" : "600",
                    fontSize: 13,
                  }}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          </View>
        ) : null}
      </View>

      {recipesApi.recipesError ? (
        <View
          style={[
            styles.errorBanner,
            { backgroundColor: `${theme.tint}12`, borderColor: `${theme.tint}44` },
          ]}
        >
          <Text style={{ color: theme.text }}>
            Impossible de charger les recettes pour le moment.
          </Text>
          <TouchableOpacity onPress={() => void recipesApi.refreshRecipes()}>
            <Text style={{ color: theme.tint, fontWeight: "700" }}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={recipesApi.recipes}
        keyExtractor={(item) => item.id.toString()}
        renderItem={isPollRecipePickerMode ? renderPickerRecipeItem : renderRecipeItem}
        refreshControl={
          <RefreshControl
            refreshing={recipesApi.isRefreshing && !recipesApi.isInitialLoading}
            onRefresh={() => void recipesApi.refreshRecipes()}
            tintColor={theme.tint}
            colors={[theme.tint]}
          />
        }
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (!recipesApi.hasNextPage || recipesApi.isFetchingNextPage) {
            return;
          }
          void recipesApi.fetchNextPage();
        }}
        ListFooterComponent={
          recipesApi.isFetchingNextPage
            ? <ActivityIndicator color={theme.tint} style={{ marginVertical: 12 }} />
            : null
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + (isPollRecipePickerMode ? 170 : 100) },
        ]}
      />

      <RecipeModal
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        householdId={householdId}
        householdDietaryTags={recipesApi.householdDietaryTags}
        isSubmitting={isSubmitting}
        theme={theme}
        isDarkMode={isDarkMode}
        upsertRecipe={recipesApi.upsertRecipe}
        suggestRecipes={recipesApi.suggestRecipes}
        previewAiRecipe={recipesApi.previewAiRecipe}
        storeAiRecipe={recipesApi.storeAiRecipe}
      />

      <ShoppingListPickerModal
        visible={shopping.shoppingPickerVisible}
        title={
          shopping.pendingRecipeForShopping
            ? `Ajouter "${shopping.pendingRecipeForShopping.title}"`
            : "Ajouter à la liste de courses"
        }
        confirmLabel="Ajouter les ingrédients"
        theme={theme}
        saving={isSubmitting}
        lists={shopping.shoppingLists}
        selectedListId={shopping.selectedShoppingListId}
        useNewList={shopping.useNewShoppingList}
        newListTitle={shopping.newShoppingListTitle}
        onClose={shopping.closeRecipeShoppingListPicker}
        onSelectList={shopping.setSelectedShoppingListId}
        onToggleUseNewList={shopping.setUseNewShoppingList}
        onChangeNewListTitle={shopping.setNewShoppingListTitle}
        onConfirm={() => void shopping.confirmRecipeShoppingListSelection()}
      />

      {isPollRecipePickerMode ? (
        <View
          style={[
            pickerStyles.bottomBar,
            {
              borderColor: theme.icon,
              backgroundColor: theme.card,
              paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 16,
            },
          ]}
        >
          <Text style={{ color: theme.text, fontWeight: "700" }}>
            {pickerSelectedRecipeIds.length} recette{pickerSelectedRecipeIds.length > 1 ? "s" : ""} sélectionnée{pickerSelectedRecipeIds.length > 1 ? "s" : ""}
          </Text>
          <TouchableOpacity
            onPress={confirmPickerSelection}
            style={[pickerStyles.confirmButton, { backgroundColor: theme.tint }]}
          >
            <Text style={pickerStyles.confirmButtonText}>Ajouter au sondage</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isParent && !isPollRecipePickerMode ? (
        <TouchableOpacity
          activeOpacity={0.8}
          style={[
            styles.fab,
            { backgroundColor: theme.tint, bottom: insets.bottom > 0 ? insets.bottom + 15 : 25 },
          ]}
          onPress={() => setIsModalVisible(true)}
        >
          <MaterialCommunityIcons name="plus" size={30} color="white" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  recipeRow: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recipeRowText: {
    flex: 1,
  },
  bottomBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 0,
    borderTopWidth: 1,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 10,
  },
  confirmButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmButtonText: {
    color: "white",
    fontWeight: "700",
  },
});

