import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
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

export default function MealRecipesScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const isDarkMode = colorScheme === "dark";
  const { householdId, role } = useStoredUserState();
  const isParent = role === "parent";

  const [search, setSearch] = useState("");
  const [selectedTab, setSelectedTab] = useState<RecipeTab>("mine");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("all");
  const [isModalVisible, setIsModalVisible] = useState(false);

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
        title="Gestion des recettes"
        withBackButton
        backHref="/(app)/(tabs)/meal"
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
          <View style={styles.typeFilterHeaderLeft}>
            <MaterialCommunityIcons name="tune-variant" size={18} color={theme.icon} />
            <Text style={{ color: theme.text, fontWeight: "700" }}>Filtrer par type</Text>
          </View>
          {selectedTypeFilter !== "all" ? (
            <TouchableOpacity onPress={() => setSelectedTypeFilter("all")}>
              <Text style={{ color: theme.tint, fontWeight: "600" }}>Réinitialiser</Text>
            </TouchableOpacity>
          ) : null}
        </View>

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
        renderItem={renderRecipeItem}
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
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
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

      {isParent ? (
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

