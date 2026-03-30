import React, { useCallback, useEffect, useMemo } from "react";
import { Tabs, useFocusEffect, useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants/theme";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { apiFetch } from "@/src/api/client";
import { queryKeys } from "@/src/query/query-keys";
import { subscribeToHouseholdRealtime } from "@/src/realtime/client";
import { useStoredUserState } from "@/src/session/user-cache";

type HouseholdModuleKey = "meals" | "tasks" | "budget" | "calendar";
type HouseholdModulesState = Record<HouseholdModuleKey, boolean> & { isSetupCompleted: boolean };
type TabsRouteName = "home" | "meal" | "tasks" | "budget" | "calendar";

const DEFAULT_HOUSEHOLD_MODULES: HouseholdModulesState = {
    meals: true,
    tasks: true,
    budget: true,
    calendar: true,
    isSetupCompleted: true,
};

const TABS_ROUTE_MODULE_MAP: Partial<Record<TabsRouteName, HouseholdModuleKey>> = {
    meal: "meals",
    tasks: "tasks",
    budget: "budget",
    calendar: "calendar",
};

const parseModuleEnabled = (rawModule: unknown): boolean => {
    if (typeof rawModule === "boolean") {
        return rawModule;
    }

    if (rawModule && typeof rawModule === "object") {
        return (rawModule as { enabled?: unknown }).enabled !== false;
    }

    return true;
};

const parseHouseholdModules = (response: unknown): HouseholdModulesState => {
    const config = (response as { config?: unknown } | null)?.config;
    const modules = (config as { modules?: unknown } | null)?.modules;
    const isSetupCompleted = (config as { is_setup_completed?: unknown } | null)?.is_setup_completed;
    const safeModules = (modules ?? {}) as Record<string, unknown>;

    return {
        meals: parseModuleEnabled(safeModules.meals),
        tasks: parseModuleEnabled(safeModules.tasks),
        budget: parseModuleEnabled(safeModules.budget),
        calendar: parseModuleEnabled(safeModules.calendar),
        isSetupCompleted: isSetupCompleted !== false, // On vérifie le flag de la DB
    };
};

export default function TabsLayout() {
    const router = useRouter();
    const segments = useSegments();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();
    const { householdId } = useStoredUserState();
    const householdConfigQuery = useQuery({
        queryKey: queryKeys.household.config(householdId),
        enabled: householdId !== null,
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: () => apiFetch("/households/config"),
    });
    const refetchHouseholdConfig = householdConfigQuery.refetch;
    const householdModules = useMemo<HouseholdModulesState>(() => {
        if (householdId === null) {
            return DEFAULT_HOUSEHOLD_MODULES;
        }
        return parseHouseholdModules(householdConfigQuery.data);
    }, [householdConfigQuery.data, householdId]);

const activeTabRoute = useMemo<TabsRouteName | null>(() => {
        const safeSegments = segments as string[];

        if (safeSegments[0] !== "(tabs)") {
            return null;
        }

        const candidate = safeSegments[1];
        if (
            candidate === "home"
            || candidate === "meal"
            || candidate === "tasks"
            || candidate === "budget"
            || candidate === "calendar"
        ) {
            return candidate as TabsRouteName;
        }
        return null;
    }, [segments]);

    useFocusEffect(
        useCallback(() => {
            if (householdId === null) {
                return;
            }
            void refetchHouseholdConfig();
        }, [householdId, refetchHouseholdConfig])
    );

    useEffect(() => {
        console.log("Modules reçus par le Layout :", householdModules);
        if (householdModules.isSetupCompleted === false) {
            console.log("Onboarding incomplet détecté, redirection vers le setup !");
            router.replace("/(app)/householdSetup?mode=edit");
        }
    }, [householdModules, router]);

    useEffect(() => {
        if (!householdId) {
            return;
        }

        let unsubscribeRealtime: (() => void) | null = null;
        let active = true;

        const bindRealtime = async () => {
            unsubscribeRealtime = await subscribeToHouseholdRealtime(householdId, (message) => {
                if (!active) {
                    return;
                }

                const module = String(message?.module ?? "");
                const type = String(message?.type ?? "");

                if (module !== "household" || type !== "config_updated") {
                    return;
                }

                void queryClient.invalidateQueries({
                    queryKey: queryKeys.household.config(householdId),
                });
            });
        };

        void bindRealtime();

        return () => {
            active = false;
            if (unsubscribeRealtime) {
                unsubscribeRealtime();
            }
        };
    }, [householdId, queryClient, refetchHouseholdConfig]);

    useEffect(() => {
        if (!activeTabRoute) {
            return;
        }

        const moduleKey = TABS_ROUTE_MODULE_MAP[activeTabRoute];
        if (!moduleKey) {
            return;
        }

        if (householdModules[moduleKey]) {
            return;
        }

        router.replace("/(app)/(tabs)/home");
    }, [activeTabRoute, householdModules, router]);

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: theme.tint,
                tabBarInactiveTintColor: theme.textSecondary,
                tabBarStyle: {
                    backgroundColor: theme.card,
                    borderTopWidth: 0,
                    elevation: 5,
                    shadowColor: "#000",
                    shadowOpacity: 0.05,
                    shadowRadius: 5,
                    height: 50 + insets.bottom, 
                    paddingBottom: insets.bottom > 0 ? insets.bottom - 5 : 0,
                    paddingTop: 0,
                },

                tabBarItemStyle: {
                    justifyContent: "center",
                    alignItems: "center",
                },

                tabBarLabelStyle: {
                    fontWeight: "600",
                    fontSize: 10,
                    marginBottom: 0,
                    marginTop: 2,
                },
            }}
        >
            <Tabs.Screen
                name="home"
                options={{
                    title: "Accueil",
                    tabBarIcon: ({ color, focused }) => (
                        <Ionicons
                            name={focused ? "home" : "home-outline"}
                            size={24}
                            color={color}
                        />
                    ),
                }}
            />

            <Tabs.Screen
                name="meal"
                options={{
                    title: "Repas",
                    href: householdModules.meals ? undefined : null,
                    tabBarIcon: ({ color }) => (
                        <MaterialCommunityIcons
                            name="silverware-fork-knife"
                            size={24}
                            color={color}
                        />
                    ),
                }}
            />

            <Tabs.Screen
                name="tasks"
                options={{
                    title: "Tâches",
                    href: householdModules.tasks ? undefined : null,
                    tabBarIcon: ({ color, focused }) => (
                        <Ionicons
                            name={focused ? "checkbox" : "checkbox-outline"}
                            size={24}
                            color={color}
                        />
                    ),
                }}
            />

            <Tabs.Screen
                name="budget"
                options={{
                    title: "Budget",
                    href: householdModules.budget ? undefined : null,
                    tabBarIcon: ({ color }) => (
                        <MaterialCommunityIcons
                            name="piggy-bank-outline"
                            size={24}
                            color={color}
                        />
                    ),
                }}
            />

            <Tabs.Screen
                name="calendar"
                options={{
                    title: "Calendrier",
                    href: householdModules.calendar ? undefined : null,
                    tabBarIcon: ({ color, focused }) => (
                        <Ionicons
                            name={focused ? "calendar" : "calendar-outline"}
                            size={24}
                            color={color}
                        />
                    ),
                }}
            />
        </Tabs>
    );
}
