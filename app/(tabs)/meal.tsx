import React, { useCallback, useMemo, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";
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
    loadedAt: number;
    mealsEnabled: boolean;
    mealOptions: Record<MealOptionKey, boolean>;
};

const MEAL_CONFIG_CACHE_TTL_MS = 30_000;

let mealModuleConfigCache: MealModuleConfig | null = null;
let mealModuleConfigInFlight: Promise<MealModuleConfig> | null = null;

const extractMealModuleConfig = (response: any): MealModuleConfig => {
    const modules = response?.config?.modules ?? {};
    const meals = modules?.meals ?? {};
    const options = meals?.options ?? {};

    return {
        loadedAt: Date.now(),
        mealsEnabled: meals?.enabled !== false,
        mealOptions: {
            recipes: options?.recipes !== false,
            polls: options?.polls !== false,
            shopping_list: options?.shopping_list !== false,
        },
    };
};

const fetchMealModuleConfig = async (): Promise<MealModuleConfig> => {
    if (!mealModuleConfigInFlight) {
        mealModuleConfigInFlight = apiFetch("/households/config")
            .then((response) => extractMealModuleConfig(response))
            .finally(() => {
                mealModuleConfigInFlight = null;
            });
    }

    return mealModuleConfigInFlight;
};

export default function MealScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const themeColors = Colors[colorScheme ?? "light"];
    const { role } = useStoredUserState();
    const canManageHouseholdConfig = role === "parent";

    const [loadingConfig, setLoadingConfig] = useState(true);
    const [mealsEnabled, setMealsEnabled] = useState(true);
    const [mealOptions, setMealOptions] = useState<Record<MealOptionKey, boolean>>({
        recipes: true,
        polls: true,
        shopping_list: true,
    });

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
                const cachedConfig = mealModuleConfigCache;
                const isCacheFresh = cachedConfig !== null
                    && (Date.now() - cachedConfig.loadedAt) < MEAL_CONFIG_CACHE_TTL_MS;

                if (cachedConfig) {
                    applyMealConfig(cachedConfig);
                    setLoadingConfig(false);
                } else {
                    setLoadingConfig(true);
                }

                if (isCacheFresh) {
                    return;
                }

                try {
                    const config = await fetchMealModuleConfig();

                    if (cancelled) {
                        return;
                    }

                    mealModuleConfigCache = config;
                    applyMealConfig(config);
                } catch (error: any) {
                    if (Number(error?.status) === 429) {
                        if (!cachedConfig) {
                            console.warn("Configuration repas temporairement limitée (429).");
                        }
                        return;
                    }
                    if (Number(error?.status) === 401) {
                        router.replace("/");
                        return;
                    }
                    console.error("Erreur chargement config repas:", error);
                } finally {
                    if (!cancelled) {
                        setLoadingConfig(false);
                    }
                }
            };

            void loadMealModuleConfig();

            return () => {
                cancelled = true;
            };
        }, [router])
    );

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: themeColors.background }]}
            contentContainerStyle={styles.content}
        >
            <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                <View style={styles.headerTopRow}>
                    <Text style={[styles.headerTitle, { color: themeColors.text }]}>Repas & Cuisine</Text>
                    {canManageHouseholdConfig ? (
                        <TouchableOpacity
                            onPress={() => router.push("/householdSetup?mode=edit&scope=meals")}
                            style={[styles.settingsButton, { borderColor: themeColors.icon }]}
                        >
                            <MaterialCommunityIcons name="cog-outline" size={20} color={themeColors.tint} />
                        </TouchableOpacity>
                    ) : null}
                </View>
                <Text style={[styles.headerSubtitle, { color: themeColors.icon }]}>
                    Gère l&apos;alimentation de ton foyer
                </Text>
            </View>

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
                            style={[styles.card, { backgroundColor: colorScheme === "dark" ? "#1E1E1E" : "#FFF" }]}
                            onPress={() => router.push(option.route)}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.cardAccent, { backgroundColor: option.color }]} />
                            <View style={styles.cardContent}>
                                <View style={[styles.iconContainer, { backgroundColor: option.color + "15" }]}>
                                    <MaterialCommunityIcons name={option.icon} size={28} color={option.color} />
                                </View>
                                <View style={styles.textContainer}>
                                    <Text style={[styles.cardTitle, { color: themeColors.text }]}>{option.title}</Text>
                                    <Text style={[styles.cardDescription, { color: themeColors.icon }]}>
                                        {option.description}
                                    </Text>
                                </View>
                                <MaterialCommunityIcons name="chevron-right" size={20} color={themeColors.icon} />
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
        paddingBottom: 40,
    },
    header: {
        paddingHorizontal: 25,
        paddingTop: 60,
        paddingBottom: 20,
    },
    headerTopRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    settingsButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    headerTitle: {
        fontSize: 26,
        fontWeight: "bold",
    },
    headerSubtitle: {
        fontSize: 15,
        marginTop: 4,
    },
    menuGrid: {
        padding: 20,
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
        marginBottom: 16,
        overflow: "hidden",
        flexDirection: "row",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    cardAccent: {
        width: 6,
        height: "100%",
    },
    cardContent: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        padding: 18,
    },
    iconContainer: {
        width: 52,
        height: 52,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 15,
    },
    textContainer: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 17,
        fontWeight: "700",
        marginBottom: 2,
    },
    cardDescription: {
        fontSize: 13,
        lineHeight: 18,
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
