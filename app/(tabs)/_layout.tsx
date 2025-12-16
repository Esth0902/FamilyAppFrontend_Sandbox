import React from "react";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";

export default function TabsLayout() {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];
    const insets = useSafeAreaInsets();
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
                    shadowColor: '#000',
                    shadowOpacity: 0.05,
                    shadowRadius: 5,
                    height: 60 + insets.bottom,
                    paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
                    paddingTop: 10,
                },

                tabBarLabelStyle: {
                    fontWeight: '600',
                    fontSize: 10,
                    marginBottom: 5,
                }
            }}
        >
            <Tabs.Screen
                name="index"
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

            {/* --- EXEMPLE POUR TES FUTURS ONGLETS ---

               Dès que tu créeras les fichiers 'tasks.tsx' ou 'calendar.tsx'
               dans le dossier (tabs), décommente ces lignes :
            */}

            {/* <Tabs.Screen
                name="tasks"
                options={{
                    title: "Tâches",
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
                name="calendar"
                options={{
                    title: "Agenda",
                    tabBarIcon: ({ color, focused }) => (
                        <Ionicons
                            name={focused ? "calendar" : "calendar-outline"}
                            size={24}
                            color={color}
                        />
                    ),
                }}
            />
            */}
        </Tabs>
    );
}