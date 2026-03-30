import React, { useCallback, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { apiFetch } from "@/src/api/client";
import { queryKeys } from "@/src/query/query-keys";
import { useStoredUserState } from "@/src/session/user-cache";

type MealOptionKey = "polls" | "recipes" | "shopping_list";

type MealOptionCard = {
    id: string;
    settingKey: MealOptionKey;
    title: string;
    description: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    color: string;
    route: "/meal/poll" | "/meal/recipes" | "/meal/shopping-list";
};

type MealModuleConfig = {
    mealsEnabled: boolean;
    mealOptions: Record<MealOptionKey, boolean>;
};

const extractMealModuleConfig = (response: any): MealModuleConfig => {
    const modules = response?.config?.modules ?? {};
    const meals = modules?.meals ?? {};
    const options = meals?.options ?? {};

    return {
        mealsEnabled: meals?.enabled !== false,
        mealOptions: {
            recipes: options?.recipes !== false,
            polls: options?.polls !== false,
            shopping_list: options?.shopping_list !== false,
        },
    };
};

export default function MealHomeScreen() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const colorScheme = useColorScheme();
    const themeColors = Colors[colorScheme ?? "light"];
    const { householdId, role } = useStoredUserState();
    const canManageHouseholdConfig = role === "parent";

    const [loadingConfig, setLoadingConfig] = useState(true);
    const [mealsEnabled, setMealsEnabled] = useState(true);
    const [mealOptions, setMealOptions] = useState<Record<MealOptionKey, boolean>>({
        recipes: true,
        polls: true,
        shopping_list: true,
    });
    const hasLoadedConfigRef = useRef(false);

    const menuOptions = useMemo<MealOptionCard[]>(
        () => [
            {
                id: "poll",
                settingKey: "polls",
                title: "Sondage de la semaine",
                description: "Votez pour les prochains repas du foyer",
                icon: "vote",
                color: colorScheme === "dark" ? "#4dabff" : themeColors.tint,
                route: "/meal/poll",
            },
            {
                id: "recipes",
                settingKey: "recipes",
                title: "Gestion des recettes",
                description: "Bibliothèque culinaire et création par IA",
                icon: "silverware-fork-knife",
                color: "#F5A623",
                route: "/meal/recipes",
            },
            {
                id: "shopping",
                settingKey: "shopping_list",
                title: "Liste de courses",
                description: "Générez la liste selon les menus choisis",
                icon: "cart-outline",
                color: "#7ED321",
                route: "/meal/shopping-list",
            },
        ],
        [colorScheme, themeColors.tint]
    );

    const visibleMenuOptions = useMemo(() => {
        if (!mealsEnabled) {
            return [];
        }
        return menuOptions.filter((option) => mealOptions[option.settingKey]);
    }, [mealOptions, mealsEnabled, menuOptions]);

    const skeletonCards = useMemo(() => [0, 1, 2], []);

    useFocusEffect(
        useCallback(() => {
            let cancelled = false;
            const applyMealConfig = (config: MealModuleConfig) => {
                setMealsEnabled(config.mealsEnabled);
                setMealOptions(config.mealOptions);
            };

            const loadMealModuleConfig = async () => {
                const activeHouseholdId = Number(householdId);
                if (!Number.isInteger(activeHouseholdId) || activeHouseholdId <= 0) {
                    setLoadingConfig(false);
                    return;
                }

                if (!hasLoadedConfigRef.current) {
                    setLoadingConfig(true);
                }

                try {
                    const response = await queryClient.fetchQuery({
                        queryKey: queryKeys.household.config(activeHouseholdId),
                        queryFn: () => apiFetch("/households/config"),
                        staleTime: 30_000,
                        gcTime: 10 * 60_000,
                    });
                    const config = extractMealModuleConfig(response);

                    if (cancelled) {
                        return;
                    }

                    applyMealConfig(config);
                } catch (error: any) {
                    if (Number(error?.status) === 429) {
                        console.warn("Configuration repas temporairement limitée (429).");
                        return;
                    }
                    console.error("Erreur chargement config repas:", error);
                } finally {
                    if (!cancelled) {
                        hasLoadedConfigRef.current = true;
                        setLoadingConfig(false);
                    }
                }
            };

            void loadMealModuleConfig();

            return () => {
                cancelled = true;
            };
        }, [householdId, queryClient])
    );

    return (
        <ScrollView keyboardShouldPersistTaps="handled"
            style={[styles.container, { backgroundColor: themeColors.background }]}
            contentContainerStyle={styles.content}
        >
            <ScreenHeader
                title="Repas & Cuisine"
                subtitle="Gère l'alimentation de ton foyer"
                containerStyle={styles.headerContainer}
                contentStyle={styles.headerContent}
                rightSlot={
                    canManageHouseholdConfig ? (
                        <TouchableOpacity
                            onPress={() => router.push("/householdSetup?mode=edit&scope=meals")}
                            style={[styles.settingsButton, { borderColor: themeColors.icon }]}
                        >
                            <MaterialCommunityIcons name="cog-outline" size={20} color={themeColors.tint} />
                        </TouchableOpacity>
                    ) : null
                }
            />

            <View style={styles.menuGrid}>
                {loadingConfig ? (
                    <View style={styles.skeletonList}>
                        {skeletonCards.map((item) => (
                            <View
                                key={`meal-skeleton-${item}`}
                                style={[styles.skeletonCard, { backgroundColor: colorScheme === "dark" ? "#1E1E1E" : "#FFF" }]}
                            >
                                <View style={[styles.skeletonAccent, { backgroundColor: themeColors.icon + "33" }]} />
                                <View style={styles.skeletonBody}>
                                    <View style={[styles.skeletonIcon, { backgroundColor: themeColors.icon + "22" }]} />
                                    <View style={styles.skeletonTextWrap}>
                                        <View style={[styles.skeletonTitle, { backgroundColor: themeColors.icon + "28" }]} />
                                        <View style={[styles.skeletonSubtitle, { backgroundColor: themeColors.icon + "1F" }]} />
                                    </View>
                                </View>
                            </View>
                        ))}
                        <View style={styles.skeletonLoadingRow}>
                            <ActivityIndicator size="small" color={themeColors.tint} />
                            <Text style={[styles.skeletonLoadingText, { color: themeColors.icon }]}>
                                Chargement de la configuration repas...
                            </Text>
                        </View>
                    </View>
                ) : visibleMenuOptions.length > 0 ? (
                    visibleMenuOptions.map((option) => (
                        <TouchableOpacity
                            key={option.id}
                            style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.icon }]}
                            onPress={() => router.push(option.route)}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.cardAccent, { backgroundColor: option.color }]} />
                            <View style={styles.cardContent}>
                                <View style={[styles.iconContainer, { backgroundColor: option.color + "15" }]}>
                                    <MaterialCommunityIcons name={option.icon} size={24} color={option.color} />
                                </View>
                                <View style={styles.textContainer}>
                                    <Text style={[styles.cardTitle, { color: themeColors.text }]}>{option.title}</Text>
                                    <Text style={[styles.cardDescription, { color: themeColors.textSecondary }]}>
                                        {option.description}
                                    </Text>
                                </View>
                                <MaterialCommunityIcons name="chevron-right" size={20} color={themeColors.textSecondary} />
                            </View>
                        </TouchableOpacity>
                    ))
                ) : (
                    <View style={[styles.emptyStateCard, { backgroundColor: colorScheme === "dark" ? "#1E1E1E" : "#FFF" }]}>
                        <MaterialCommunityIcons name="food-off-outline" size={24} color={themeColors.icon} />
                        <Text style={[styles.emptyStateText, { color: themeColors.icon }]}>
                            Aucun sous-module repas actif.
                        </Text>
                        <Text style={[styles.emptyStateHint, { color: themeColors.icon }]}>Active des sous-modules via la molette.</Text>
                    </View>
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        paddingTop: 56,
        paddingBottom: 40,
    },
    headerContainer: {
        paddingHorizontal: 16,
        paddingBottom: 0,
    },
    headerContent: {
        minHeight: 0,
    },
    settingsButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    menuGrid: {
        paddingHorizontal: 16,
        paddingTop: 4,
        gap: 10,
    },
    skeletonList: {
        gap: 14,
    },
    skeletonCard: {
        borderRadius: 15,
        overflow: "hidden",
        flexDirection: "row",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 2,
    },
    skeletonAccent: {
        width: 6,
    },
    skeletonBody: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        padding: 18,
        gap: 12,
    },
    skeletonIcon: {
        width: 52,
        height: 52,
        borderRadius: 12,
    },
    skeletonTextWrap: {
        flex: 1,
        gap: 8,
    },
    skeletonTitle: {
        height: 14,
        borderRadius: 7,
        width: "60%",
    },
    skeletonSubtitle: {
        height: 12,
        borderRadius: 6,
        width: "90%",
    },
    skeletonLoadingRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        marginTop: 4,
    },
    skeletonLoadingText: {
        fontSize: 13,
        fontWeight: "500",
    },
    card: {
        borderRadius: 15,
        overflow: "hidden",
        flexDirection: "row",
        borderWidth: 1,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 2,
    },
    cardAccent: {
        width: 6,
        height: "100%",
    },
    cardContent: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        padding: 14,
        gap: 10,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center",
    },
    textContainer: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: "700",
        marginBottom: 2,
    },
    cardDescription: {
        fontSize: 12,
        lineHeight: 17,
    },
    emptyStateCard: {
        borderRadius: 15,
        paddingVertical: 20,
        paddingHorizontal: 16,
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
    },
    emptyStateText: {
        fontSize: 14,
        fontWeight: "600",
        textAlign: "center",
    },
    emptyStateHint: {
        fontSize: 12,
        textAlign: "center",
    },
});


