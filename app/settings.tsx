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
import {
    normalizeStoredUser,
    persistStoredUser,
    switchStoredHousehold,
    type StoredUser,
} from "@/src/session/user-cache";

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
    household_id?: number | null;
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
    const [switchingHouseholdFor, setSwitchingHouseholdFor] = useState<number | null>(null);

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

    const households = useMemo(() => user?.households ?? [], [user?.households]);
    const activeHouseholdId = useMemo(() => {
        const explicit = Number(user?.household_id ?? 0);
        if (Number.isFinite(explicit) && explicit > 0) {
            return explicit;
        }

        const firstHouseholdId = Number(households[0]?.id ?? 0);
        return Number.isFinite(firstHouseholdId) && firstHouseholdId > 0 ? firstHouseholdId : null;
    }, [households, user?.household_id]);

    const resolveCachedHouseholdId = useCallback(async (): Promise<number | null> => {
        try {
            const rawUser = await SecureStore.getItemAsync("user");
            if (!rawUser) {
                return null;
            }

            const parsedUser = JSON.parse(rawUser) as { household_id?: number | string };
            const parsedId = Number(parsedUser?.household_id ?? 0);
            return Number.isFinite(parsedId) && parsedId > 0 ? Math.trunc(parsedId) : null;
        } catch {
            return null;
        }
    }, []);

    const persistUserCache = useCallback(async (apiUser: ApiUser, preferredHouseholdId?: number | null) => {
        const cachedHouseholdId = await resolveCachedHouseholdId();
        const resolvedPreferredHouseholdId = preferredHouseholdId ?? activeHouseholdId ?? cachedHouseholdId;

        const normalizedUser = normalizeStoredUser(
            apiUser as StoredUser,
            resolvedPreferredHouseholdId
        ) as ApiUser | null;

        if (!normalizedUser) {
            return null;
        }

        await persistStoredUser(normalizedUser as StoredUser);
        return normalizedUser;
    }, [activeHouseholdId, resolveCachedHouseholdId]);

    const loadProfile = useCallback(async (preferredHouseholdId?: number | null) => {
        try {
            const response = await apiFetch("/me");
            const apiUser = response?.user as ApiUser | undefined;

            if (!apiUser) {
                throw new Error("Profil introuvable.");
            }

            const normalizedUser = await persistUserCache(apiUser, preferredHouseholdId);
            hydrateFromUser(normalizedUser ?? apiUser);
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

            await loadProfile(activeHouseholdId);
            Alert.alert("Pseudo", "Pseudo du foyer mis à jour.");
        } catch (error: any) {
            Alert.alert("Erreur", error?.message || "Impossible de mettre à jour le pseudo.");
        } finally {
            setSavingNicknameFor(null);
        }
    };

    const onSwitchHousehold = async (householdId: number) => {
        if (householdId === activeHouseholdId) {
            return;
        }

        setSwitchingHouseholdFor(householdId);
        try {
            await switchStoredHousehold(householdId);
            await loadProfile(householdId);
            Alert.alert("Foyer", "Foyer actif mis à jour.");
        } catch (error: any) {
            Alert.alert("Erreur", error?.message || "Impossible de changer de foyer.");
        } finally {
            setSwitchingHouseholdFor(null);
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
                const normalizedUser = await persistUserCache(updatedUser, activeHouseholdId);
                hydrateFromUser(normalizedUser ?? updatedUser);
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
                    Gère tes foyers, ton pseudo, ton e-mail et ton mot de passe.
                </Text>
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Mes foyers</Text>

                {households.length === 0 ? (
                    <Text style={[styles.sectionText, { color: theme.textSecondary }]}>Aucun foyer associé.</Text>
                ) : (
                    households.map((household) => {
                        const isSaving = savingNicknameFor === household.id;
                        const isActiveHousehold = household.id === activeHouseholdId;
                        const canSwitchHousehold = households.length > 1;
                        const isSwitching = switchingHouseholdFor === household.id;

                        return (
                            <View
                                key={household.id}
                                style={[styles.householdItem, { borderColor: theme.icon }]}
                            >
                                <View style={styles.householdMetaRow}>
                                    <Text style={[styles.householdName, { color: theme.text }]}>{household.name}</Text>
                                    <Text style={[styles.householdRole, { color: theme.textSecondary }]}>
                                        Rôle : {getHouseholdRole(household)}
                                    </Text>
                                </View>

                                {canSwitchHousehold ? (
                                    <View style={styles.householdSwitchRow}>
                                        <Text style={[styles.householdSwitchHint, { color: theme.textSecondary }]}>
                                            {isActiveHousehold ? "Foyer actif" : "Foyer disponible"}
                                        </Text>
                                        {isActiveHousehold ? (
                                            <View style={[styles.activeBadge, { backgroundColor: `${theme.tint}22` }]}>
                                                <Text style={[styles.activeBadgeText, { color: theme.tint }]}>Actif</Text>
                                            </View>
                                        ) : (
                                            <TouchableOpacity
                                                style={[styles.secondaryInlineButton, { borderColor: theme.tint }]}
                                                onPress={() => {
                                                    void onSwitchHousehold(household.id);
                                                }}
                                                disabled={isSwitching}
                                            >
                                                <Text style={[styles.secondaryInlineButtonText, { color: theme.tint }]}>
                                                    {isSwitching ? "Changement..." : "Utiliser ce foyer"}
                                                </Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                ) : null}

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
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Mon compte</Text>

                <Text style={[styles.label, { color: theme.text }]}>Adresse e-mail</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
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

                <Text style={[styles.label, { color: theme.text }]}>Confirmation du nouveau mot de passe</Text>
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
    householdSwitchRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
        gap: 8,
    },
    householdSwitchHint: {
        fontSize: 12,
        fontWeight: "500",
    },
    activeBadge: {
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    activeBadgeText: {
        fontSize: 12,
        fontWeight: "700",
    },
    secondaryInlineButton: {
        borderRadius: 10,
        borderWidth: 1,
        paddingVertical: 8,
        paddingHorizontal: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    secondaryInlineButtonText: {
        fontSize: 13,
        fontWeight: "700",
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
