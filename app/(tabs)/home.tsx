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
    role: string;
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
    const theme = Colors[colorScheme ?? 'light'];

    const [user, setUser] = useState<StoredUser | null>(null);
    const [loading, setLoading] = useState(true);

    useFocusEffect(
        useCallback(() => {
            const fetchUserData = async () => {
                try {
                    const token = await SecureStore.getItemAsync("authToken");

                    if (token) {
                        const response = await fetch(`${API_BASE_URL}/me`, {
                            headers: { Authorization: `Bearer ${token}` }
                        });

                        if (response.ok) {
                            const data = await response.json();
                            setUser(data.user);

                            await SecureStore.setItemAsync("user", JSON.stringify(data.user));
                        } else {
                            const raw = await SecureStore.getItemAsync("user");
                            if (raw) setUser(JSON.parse(raw));
                        }
                    }
                } catch (e) {
                    console.error("Erreur chargement user:", e);
                } finally {
                    setLoading(false);
                }
            };

            fetchUserData();
        }, [])
    );

    const onSetupHouse = () => {
        router.push("/householdSetup");
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
                }).catch(e => console.log("Logout backend error:", e));
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
                <Text style={[styles.title, { color: theme.text }]}>
                    Bonjour{user?.name ? `, ${user.name}` : ""} 👋
                </Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                    {activeHousehold
                        ? `Heureux de te retrouver dans ${activeHousehold.name}.`
                        : "Bienvenue dans ton espace familial."}
                </Text>
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
                <View style={[styles.accentStrip, { backgroundColor: activeHousehold ? theme.tint : theme.accentCool }]} />

                <View style={styles.cardContent}>
                    {activeHousehold ? (
                        <>
                            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                                <Text style={[styles.cardTitle, { color: theme.text }]}>
                                    {activeHousehold.name}
                                </Text>
                                <MaterialCommunityIcons name="home-account" size={24} color={theme.tint} />
                            </View>

                            <Text style={[styles.cardText, { color: theme.textSecondary }]}>
                                Ton espace est configuré. Accède au planning, aux repas et au budget.
                            </Text>

                            <TouchableOpacity
                                style={[styles.primaryButton, { backgroundColor: theme.tint }]}
                                onPress={() => { /* Navigation vers dashboard futur */ }}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.primaryButtonText}>Voir mon tableau de bord</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <Text style={[styles.cardTitle, { color: theme.text }]}>
                                Créons ton cocon
                            </Text>
                            <Text style={[styles.cardText, { color: theme.textSecondary }]}>
                                Ajoute les membres, définis les rôles et prépare ton calendrier partagé.
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

            <View style={{ marginTop: 32, alignItems: 'center' }}>
                <TouchableOpacity onPress={onLogout} style={styles.ghostButton}>
                    <Text style={[styles.ghostButtonText, { color: theme.accentWarm }]}>
                        Se déconnecter
                    </Text>
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
    title: {
        fontSize: 28,
        fontWeight: "bold",
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        lineHeight: 24,
    },
    card: {
        borderRadius: 20,
        flexDirection: 'row',
        overflow: 'hidden',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 3,
        marginBottom: 20,
    },
    accentStrip: {
        width: 8,
        height: '100%',
    },
    cardContent: {
        flex: 1,
        padding: 20,
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
        alignItems: 'center',
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 16,
    },
    ghostButton: {
        padding: 10,
    },
    ghostButtonText: {
        fontSize: 15,
        fontWeight: '500',
    }
});