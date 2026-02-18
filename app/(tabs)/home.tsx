import React, { useState, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    useColorScheme,
} from "react-native";

import { useRouter, useFocusEffect } from "expo-router";
import { API_BASE_URL } from "@/src/api/client";
import * as SecureStore from "expo-secure-store";
import { Colors } from "@/constants/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type Household = {
    id: number;
    name: string;
};

type StoredUser = {
    id: number;
    name: string;
    email: string;
    households?: Household[];
};

export default function ConnectedHome() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];

    const [user, setUser] = useState<StoredUser | null>(null);
    const [loading, setLoading] = useState(true);

    useFocusEffect(
        useCallback(() => {
            const fetchUserData = async () => {
                try {
                    const token = await SecureStore.getItemAsync("authToken");

                    if (token) {
                        const response = await fetch(`${API_BASE_URL}/me`, {
                            headers: { Authorization: `Bearer ${token}` },
                        });

                        if (response.ok) {
                            const data = await response.json();
                            const userToSave = {
                                ...data.user,
                                household_id: data.user.households && data.user.households.length > 0
                                    ? data.user.households[0].id
                                    : null,
                            };
                            setUser(userToSave);
                            await SecureStore.setItemAsync("user", JSON.stringify(userToSave));
                        } else {
                            const raw = await SecureStore.getItemAsync("user");
                            if (raw) {
                                setUser(JSON.parse(raw));
                            }
                        }
                    }
                } catch (e) {
                    console.error("Erreur chargement user:", e);
                } finally {
                    setLoading(false);
                }
            };

            void fetchUserData();
        }, [])
    );

    const onSetupHouse = () => {
        router.push("/householdSetup");
    };

    const onEditHouseholdConfig = () => {
        router.push("/householdSetup?mode=edit");
    };

    const onLogout = async () => {
        try {
            const token = await SecureStore.getItemAsync("authToken");
            if (token) {
                fetch(`${API_BASE_URL}/logout`, {
                    method: "POST",
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                }).catch((e) => console.log("Logout backend error:", e));
            }
        } catch (e) {
            console.error("Erreur logout:", e);
        } finally {
            await SecureStore.deleteItemAsync("authToken");
            await SecureStore.deleteItemAsync("user");
            router.replace("/");
        }
    };

    if (loading) {
        return (
            <View style={[styles.center, { backgroundColor: theme.background }]}>
                <ActivityIndicator color={theme.accentCool} size="large" />
            </View>
        );
    }

    const activeHousehold = user?.households && user.households.length > 0
        ? user.households[0]
        : null;

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={styles.header}>
                <View style={styles.headerTopRow}>
                    <View style={styles.headerTextWrap}>
                        <Text style={[styles.title, { color: theme.text }]}>
                            Bonjour{user?.name ? `, ${user.name}` : ""}
                        </Text>
                        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                            {activeHousehold
                                ? `Heureux de te retrouver dans ${activeHousehold.name}.`
                                : "Bienvenue dans ton espace familial."}
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={() => router.push("/settings")}
                        style={[styles.userSettingsButton, { borderColor: theme.icon }]}
                        accessibilityLabel="Ouvrir les parametres utilisateur"
                    >
                        <MaterialCommunityIcons name="account-cog-outline" size={20} color={theme.tint} />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
                <View style={[styles.accentStrip, { backgroundColor: activeHousehold ? theme.tint : theme.accentCool }]} />

                <View style={styles.cardContent}>
                    {activeHousehold ? (
                        <>
                            <View style={styles.cardHeaderRow}>
                                <Text style={[styles.cardTitle, { color: theme.text }]}>
                                    {activeHousehold.name}
                                </Text>
                                <View style={styles.cardActionRow}>
                                    <TouchableOpacity
                                        onPress={onEditHouseholdConfig}
                                        style={[styles.householdSettingsButton, { borderColor: theme.icon }]}
                                    >
                                        <MaterialCommunityIcons name="cog-outline" size={20} color={theme.tint} />
                                    </TouchableOpacity>
                                    <MaterialCommunityIcons name="home-account" size={24} color={theme.tint} />
                                </View>
                            </View>

                            <Text style={[styles.cardText, { color: theme.textSecondary }]}>
                                Ton espace est configure. Accede au planning, aux repas et au budget.
                            </Text>

                            <TouchableOpacity
                                style={[styles.primaryButton, { backgroundColor: theme.tint }]}
                                onPress={() => {
                                    router.push("/dashboard");
                                }}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.primaryButtonText}>Voir mon tableau de bord</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <Text style={[styles.cardTitle, { color: theme.text }]}>Creons ton cocon</Text>
                            <Text style={[styles.cardText, { color: theme.textSecondary }]}>
                                Ajoute les membres de ton foyer, definis les rôles et prépare ton calendrier partagé.
                            </Text>

                            <TouchableOpacity
                                style={[styles.primaryButton, { backgroundColor: theme.accentCool }]}
                                onPress={onSetupHouse}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.primaryButtonText}>Configurer mon foyer</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>

            <View style={styles.logoutWrap}>
                <TouchableOpacity onPress={onLogout} style={styles.ghostButton}>
                    <Text style={[styles.ghostButtonText, { color: theme.accentWarm }]}>Se déconnecter</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    container: {
        flex: 1,
        padding: 24,
        paddingTop: 60,
    },
    header: {
        marginBottom: 30,
    },
    headerTopRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
    },
    headerTextWrap: {
        flex: 1,
    },
    title: {
        fontSize: 28,
        fontWeight: "bold",
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        lineHeight: 24,
    },
    userSettingsButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 4,
    },
    card: {
        borderRadius: 20,
        flexDirection: "row",
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 3,
        marginBottom: 20,
    },
    accentStrip: {
        width: 8,
        height: "100%",
    },
    cardContent: {
        flex: 1,
        padding: 20,
    },
    cardHeaderRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    cardActionRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    householdSettingsButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: "700",
        marginBottom: 8,
    },
    cardText: {
        fontSize: 14,
        marginBottom: 20,
        lineHeight: 20,
    },
    primaryButton: {
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        alignItems: "center",
    },
    primaryButtonText: {
        color: "#FFFFFF",
        fontWeight: "600",
        fontSize: 16,
    },
    logoutWrap: {
        marginTop: 32,
        alignItems: "center",
    },
    ghostButton: {
        padding: 10,
    },
    ghostButtonText: {
        fontSize: 15,
        fontWeight: "500",
    },
});
