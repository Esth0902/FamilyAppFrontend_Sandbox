import React, { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { normalizeRecipeTypeValue, type RecipeTab } from "@/src/features/recipes/recipe-types";
import type { Recipe } from "@/src/services/recipeService";

type RecipeCardProps = {
    recipe: Recipe;
    selectedTab: RecipeTab;
    isParent: boolean;
    isSubmitting: boolean;
    theme: typeof Colors.light;
    isDarkMode: boolean;
    onOpenDetails: (recipeId: number) => void;
    onToggleSave: (recipe: Recipe) => void;
    onAddToShopping: (recipe: Recipe) => void;
    onOpenActions: (recipe: Recipe) => void;
};

function RecipeCardComponent({
    recipe,
    selectedTab,
    isParent,
    isSubmitting,
    theme,
    isDarkMode,
    onOpenDetails,
    onToggleSave,
    onAddToShopping,
    onOpenActions,
}: RecipeCardProps) {
    const isOwned = recipe.is_owned_by_household !== false;
    const isGlobal = recipe.is_global === true;
    const isAiGenerated = recipe.is_ai_generated === true;
    const recipeScopeLabel = isGlobal ? "Globale" : isAiGenerated ? "IA" : "Perso";
    const normalizedRecipeType = normalizeRecipeTypeValue(recipe.type);
    const isInMine = recipe.is_in_my_recipes ?? isOwned;
    const canManageRecipe = isParent && isOwned;
    const showHeart = selectedTab === "all" && (isGlobal || isOwned);

    return (
        <TouchableOpacity
            style={[styles.recipeCard, { backgroundColor: isDarkMode ? "#1E1E1E" : "#FFFFFF" }]}
            onPress={() => onOpenDetails(recipe.id)}
            activeOpacity={0.85}
        >
            <View style={styles.recipeInfo}>
                <View style={styles.recipeHeader}>
                    <Text style={[styles.recipeTitle, { color: theme.text }]}>{recipe.title}</Text>

                    <View style={styles.chipsRow}>
                        <View
                            style={[
                                styles.chip,
                                { backgroundColor: isDarkMode ? "#2A2A2A" : "#EEEEEE", borderColor: "transparent" },
                            ]}
                        >
                            <Text style={[styles.chipText, { color: theme.icon }]}>{normalizedRecipeType}</Text>
                        </View>

                        <View
                            style={[
                                styles.chip,
                                { borderColor: isGlobal ? theme.tint : theme.icon, backgroundColor: "transparent" },
                            ]}
                        >
                            <Text style={[styles.chipText, { color: isGlobal ? theme.tint : theme.icon }]}>
                                {recipeScopeLabel}
                            </Text>
                        </View>
                    </View>

                    <Text style={[styles.servings, { color: theme.icon }]}>
                        {recipe.display_servings ?? recipe.base_servings ?? 1} portions
                    </Text>
                </View>

                <Text style={[styles.recipeDesc, { color: theme.icon }]} numberOfLines={2}>
                    {recipe.description || "Aucune description"}
                </Text>
            </View>

            <View style={styles.actionsRow}>
                {showHeart ? (
                    <TouchableOpacity
                        onPress={() => onToggleSave(recipe)}
                        style={[styles.iconBtn, { opacity: isSubmitting ? 0.6 : 1 }]}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        disabled={isSubmitting || isOwned}
                    >
                        <MaterialCommunityIcons
                            name={isInMine ? "heart" : "heart-outline"}
                            size={22}
                            color={isInMine ? "#E94A61" : theme.icon}
                        />
                    </TouchableOpacity>
                ) : null}

                {isParent ? (
                    <TouchableOpacity
                        onPress={() => onAddToShopping(recipe)}
                        style={[styles.iconBtn, { opacity: isSubmitting ? 0.6 : 1 }]}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        disabled={isSubmitting}
                    >
                        <MaterialCommunityIcons name="cart-plus" size={22} color={theme.icon} />
                    </TouchableOpacity>
                ) : null}

                {canManageRecipe ? (
                    <TouchableOpacity
                        onPress={() => onOpenActions(recipe)}
                        style={styles.iconBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <MaterialCommunityIcons name="dots-vertical" size={22} color={theme.icon} />
                    </TouchableOpacity>
                ) : null}

                <MaterialCommunityIcons name="chevron-right" size={24} color={theme.icon} />
            </View>
        </TouchableOpacity>
    );
}

export const RecipeCard = memo(RecipeCardComponent);

const styles = StyleSheet.create({
    recipeCard: {
        flexDirection: "row",
        alignItems: "flex-start",
        padding: 16,
        borderRadius: 15,
        marginBottom: 12,
        elevation: 2,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 8,
    },
    recipeInfo: {
        flex: 1,
    },
    recipeHeader: {
        gap: 6,
    },
    recipeTitle: {
        fontSize: 18,
        fontWeight: "bold",
        lineHeight: 24,
    },
    chipsRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    chip: {
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
    },
    chipText: {
        fontSize: 12,
        fontWeight: "600",
    },
    servings: {
        fontSize: 12,
    },
    recipeDesc: {
        fontSize: 14,
        lineHeight: 20,
    },
    actionsRow: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "center",
        gap: 6,
    },
    iconBtn: {
        padding: 6,
    },
});
