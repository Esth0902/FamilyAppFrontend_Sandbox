import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useColorScheme,
} from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { apiFetch } from "@/src/api/client";

type HouseholdPivot = {
    role?: string;
    nickname?: string | null;
};

type HouseholdMembership = {
    id: number;
    name: string;
    role?: string;
    nickname?: string | null;
    pivot?: HouseholdPivot;
};

type ApiUser = {
    id: number;
    name: string;
    email: string;
    households?: HouseholdMembership[];
};

const getHouseholdRole = (household: HouseholdMembership): string => {
    return household.pivot?.role ?? household.role ?? "enfant";
};

const getHouseholdNickname = (household: HouseholdMembership): string => {
    return household.pivot?.nickname ?? household.nickname ?? "";
};

export default function SettingsScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];

    const [loading, setLoading] = useState(true);
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingNicknameFor, setSavingNicknameFor] = useState<number | null>(null);

    const [user, setUser] = useState<ApiUser | null>(null);
    const [email, setEmail] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [householdNicknames, setHouseholdNicknames] = useState<Record<number, string>>({});

    const hydrateFromUser = useCallback((apiUser: ApiUser) => {
        setUser(apiUser);
        setEmail(apiUser.email ?? "");

        const nextNicknames: Record<number, string> = {};
        for (const household of apiUser.households ?? []) {
            nextNicknames[household.id] = getHouseholdNickname(household);
        }
        setHouseholdNicknames(nextNicknames);
    }, []);

    const persistUserCache = useCallback(async (apiUser: ApiUser) => {
        const normalizedUser = {
            ...apiUser,
            household_id: apiUser.households && apiUser.households.length > 0
                ? apiUser.households[0].id
                : null,
        };

        await SecureStore.setItemAsync("user", JSON.stringify(normalizedUser));
    }, []);

    const loadProfile = useCallback(async () => {
        try {
            const response = await apiFetch("/me");
            const apiUser = response?.user as ApiUser | undefined;

            if (!apiUser) {
                throw new Error("Profil introuvable.");
            }

            hydrateFromUser(apiUser);
            await persistUserCache(apiUser);
        } catch (error: any) {
            if (Number(error?.status) === 401) {
                await SecureStore.deleteItemAsync("authToken");
                await SecureStore.deleteItemAsync("user");
                router.replace("/");
                return;
            }

            Alert.alert("Erreur", error?.message || "Impossible de charger le profil.");
        } finally {
            setLoading(false);
        }
    }, [hydrateFromUser, persistUserCache, router]);

    useEffect(() => {
        void loadProfile();
    }, [loadProfile]);

    const households = useMemo(() => user?.households ?? [], [user?.households]);

    const onSaveNickname = async (householdId: number) => {
        const nickname = (householdNicknames[householdId] ?? "").trim();
        if (!nickname) {
            Alert.alert("Pseudo", "Le pseudo ne peut pas être vide.");
            return;
        }

        setSavingNicknameFor(householdId);
        try {
            await apiFetch(`/auth/households/${householdId}/nickname`, {
                method: "PATCH",
                body: JSON.stringify({ nickname }),
            });

            await loadProfile();
            Alert.alert("Pseudo", "Pseudo du foyer mis à jour.");
        } catch (error: any) {
            Alert.alert("Erreur", error?.message || "Impossible de mettre à jour le pseudo.");
        } finally {
            setSavingNicknameFor(null);
        }
    };

    const onSaveProfile = async () => {
        if (!user) {
            return;
        }

        const trimmedEmail = email.trim();
        const emailChanged = trimmedEmail !== user.email;
        const passwordChanged = newPassword.trim().length > 0;

        if (!emailChanged && !passwordChanged) {
            Alert.alert("Profil", "Aucune modification detectée.");
            return;
        }

        if (!currentPassword) {
            Alert.alert("Profil", "Le mot de passe actuel est requis.");
            return;
        }

        if (passwordChanged && newPassword !== confirmPassword) {
            Alert.alert("Profil", "La confirmation du nouveau mot de passe est invalide.");
            return;
        }

        const payload: {
            current_password: string;
            email?: string;
            password?: string;
            password_confirmation?: string;
        } = {
            current_password: currentPassword,
        };

        if (emailChanged) {
            payload.email = trimmedEmail;
        }

        if (passwordChanged) {
            payload.password = newPassword;
            payload.password_confirmation = confirmPassword;
        }

        setSavingProfile(true);
        try {
            const response = await apiFetch("/auth/profile", {
                method: "PATCH",
                body: JSON.stringify(payload),
            });

            const updatedUser = response?.user as ApiUser | undefined;
            if (updatedUser) {
                hydrateFromUser(updatedUser);
                await persistUserCache(updatedUser);
            }

            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            Alert.alert("Profil", "Informations utilisateur mises à jour.");
        } catch (error: any) {
            Alert.alert("Erreur", error?.message || "Impossible de mettre à jour le profil.");
        } finally {
            setSavingProfile(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.loadingWrap, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.tint} />
            </View>
        );
    }

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: theme.background }]}
            contentContainerStyle={styles.content}
        >
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color={theme.textSecondary} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: theme.text }]}>Paramètres utilisateur</Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                    Gère tes foyers, ton pseudo, ton email et ton mot de passe.
                </Text>
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Mes foyers</Text>

                {households.length === 0 ? (
                    <Text style={[styles.sectionText, { color: theme.textSecondary }]}>Aucun foyer associé.</Text>
                ) : (
                    households.map((household) => {
                        const isSaving = savingNicknameFor === household.id;

                        return (
                            <View
                                key={household.id}
                                style={[styles.householdItem, { borderColor: theme.icon }]}
                            >
                                <View style={styles.householdMetaRow}>
                                    <Text style={[styles.householdName, { color: theme.text }]}>{household.name}</Text>
                                    <Text style={[styles.householdRole, { color: theme.textSecondary }]}>
                                        Role: {getHouseholdRole(household)}
                                    </Text>
                                </View>

                                <TextInput
                                    style={[
                                        styles.input,
                                        {
                                            backgroundColor: theme.background,
                                            color: theme.text,
                                            borderColor: theme.icon,
                                        },
                                    ]}
                                    placeholder="Pseudo dans ce foyer"
                                    placeholderTextColor={theme.textSecondary}
                                    value={householdNicknames[household.id] ?? ""}
                                    onChangeText={(value) => {
                                        setHouseholdNicknames((prev) => ({
                                            ...prev,
                                            [household.id]: value,
                                        }));
                                    }}
                                />

                                <TouchableOpacity
                                    style={[styles.inlineButton, { backgroundColor: theme.tint }]}
                                    onPress={() => {
                                        void onSaveNickname(household.id);
                                    }}
                                    disabled={isSaving}
                                >
                                    <Text style={styles.inlineButtonText}>
                                        {isSaving ? "Enregistrement..." : "Mettre à jour le pseudo"}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        );
                    })
                )}
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Compte</Text>

                <Text style={[styles.label, { color: theme.text }]}>Adresse email</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                    placeholder="email@exemple.com"
                    placeholderTextColor={theme.textSecondary}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                />

                <Text style={[styles.label, { color: theme.text }]}>Mot de passe actuel</Text>
                <View style={styles.passwordFieldContainer}>
                    <TextInput
                        style={[styles.input, styles.passwordInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                        placeholder="Obligatoire pour valider"
                        placeholderTextColor={theme.textSecondary}
                        secureTextEntry={!showCurrentPassword}
                        value={currentPassword}
                        onChangeText={setCurrentPassword}
                    />

                    <TouchableOpacity
                        onPress={() => setShowCurrentPassword((prev) => !prev)}
                        style={styles.eyeButton}
                        accessibilityLabel={showCurrentPassword ? "Masquer le mot de passe actuel" : "Afficher le mot de passe actuel"}
                    >
                        <MaterialCommunityIcons
                            name={showCurrentPassword ? "eye-off-outline" : "eye-outline"}
                            size={20}
                            color={theme.textSecondary}
                        />
                    </TouchableOpacity>
                </View>

                <Text style={[styles.label, { color: theme.text }]}>Nouveau mot de passe (optionnel)</Text>
                <View style={styles.passwordFieldContainer}>
                    <TextInput
                        style={[styles.input, styles.passwordInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                        placeholder="Laisse vide si tu changes seulement l'email"
                        placeholderTextColor={theme.textSecondary}
                        secureTextEntry={!showNewPassword}
                        value={newPassword}
                        onChangeText={setNewPassword}
                    />

                    <TouchableOpacity
                        onPress={() => setShowNewPassword((prev) => !prev)}
                        style={styles.eyeButton}
                        accessibilityLabel={showNewPassword ? "Masquer le nouveau mot de passe" : "Afficher le nouveau mot de passe"}
                    >
                        <MaterialCommunityIcons
                            name={showNewPassword ? "eye-off-outline" : "eye-outline"}
                            size={20}
                            color={theme.textSecondary}
                        />
                    </TouchableOpacity>
                </View>

                <Text style={[styles.label, { color: theme.text }]}>Confirmation nouveau mot de passe</Text>
                <View style={styles.passwordFieldContainer}>
                    <TextInput
                        style={[styles.input, styles.passwordInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                        placeholder="Retape le nouveau mot de passe"
                        placeholderTextColor={theme.textSecondary}
                        secureTextEntry={!showConfirmPassword}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                    />

                    <TouchableOpacity
                        onPress={() => setShowConfirmPassword((prev) => !prev)}
                        style={styles.eyeButton}
                        accessibilityLabel={showConfirmPassword ? "Masquer la confirmation" : "Afficher la confirmation"}
                    >
                        <MaterialCommunityIcons
                            name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                            size={20}
                            color={theme.textSecondary}
                        />
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={[styles.primaryButton, { backgroundColor: theme.tint }]}
                    onPress={() => {
                        void onSaveProfile();
                    }}
                    disabled={savingProfile}
                >
                    <Text style={styles.primaryButtonText}>
                        {savingProfile ? "Mise à jour..." : "Mettre à jour le profil"}
                    </Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    loadingWrap: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    container: {
        flex: 1,
    },
    content: {
        paddingHorizontal: 20,
        paddingTop: 58,
        paddingBottom: 36,
        gap: 16,
    },
    header: {
        marginBottom: 4,
    },
    backButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 8,
    },
    title: {
        fontSize: 28,
        fontWeight: "700",
        marginBottom: 6,
    },
    subtitle: {
        fontSize: 14,
        lineHeight: 20,
    },
    card: {
        borderRadius: 16,
        padding: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: "700",
        marginBottom: 12,
    },
    sectionText: {
        fontSize: 14,
        lineHeight: 20,
    },
    householdItem: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
    },
    householdMetaRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        marginBottom: 10,
    },
    householdName: {
        fontSize: 15,
        fontWeight: "700",
        flex: 1,
    },
    householdRole: {
        fontSize: 12,
        fontWeight: "600",
    },
    label: {
        fontSize: 13,
        fontWeight: "600",
        marginBottom: 6,
        marginTop: 2,
    },
    input: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        marginBottom: 12,
    },
    passwordFieldContainer: {
        position: "relative",
        marginBottom: 12,
    },
    passwordInput: {
        marginBottom: 0,
        paddingRight: 48,
    },
    eyeButton: {
        position: "absolute",
        right: 12,
        top: 0,
        bottom: 0,
        justifyContent: "center",
        alignItems: "center",
    },
    inlineButton: {
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    inlineButtonText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "600",
    },
    primaryButton: {
        borderRadius: 12,
        paddingVertical: 13,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 6,
    },
    primaryButtonText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 15,
    },
});
