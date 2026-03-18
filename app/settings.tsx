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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/theme";
import { apiFetch } from "@/src/api/client";
import {
    clearStoredUser,
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

type BlockingHouseholdPayload = {
    household?: {
        id?: number;
        name?: string;
    };
    candidate_members?: {
        id?: number;
        name?: string;
        role?: string;
    }[];
};

const getHouseholdRole = (household: HouseholdMembership): string => {
    return household.pivot?.role ?? household.role ?? "enfant";
};

const getHouseholdNickname = (household: HouseholdMembership): string => {
    return household.pivot?.nickname ?? household.nickname ?? "";
};

export default function SettingsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];

    const [loading, setLoading] = useState(true);
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingNicknameFor, setSavingNicknameFor] = useState<number | null>(null);
    const [switchingHouseholdFor, setSwitchingHouseholdFor] = useState<number | null>(null);
    const [leavingHouseholdFor, setLeavingHouseholdFor] = useState<number | null>(null);
    const [requestingDeletionFor, setRequestingDeletionFor] = useState<number | null>(null);
    const [deletingAccount, setDeletingAccount] = useState(false);

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

    const onCreateNewHousehold = () => {
        router.push("/householdSetup?mode=create");
    };

    const openHouseholdManagement = async (householdId: number) => {
        if (!Number.isFinite(householdId) || householdId <= 0) {
            return;
        }

        try {
            if (householdId !== activeHouseholdId) {
                await switchStoredHousehold(householdId);
                await loadProfile(householdId);
            }
            router.push("/householdSetup?mode=edit");
        } catch (error: any) {
            Alert.alert("Erreur", error?.message || "Impossible d'ouvrir la gestion des membres.");
        }
    };

    const onRequestHouseholdDeletion = async (householdId: number) => {
        if (!Number.isFinite(householdId) || householdId <= 0) {
            Alert.alert("Erreur", "Foyer invalide.");
            return;
        }

        if (requestingDeletionFor !== null) {
            return;
        }

        const previousHouseholdId = activeHouseholdId;
        const targetHouseholdId = Number(householdId);
        let switchedTemporarily = false;

        setRequestingDeletionFor(targetHouseholdId);
        try {
            if (targetHouseholdId !== activeHouseholdId) {
                await switchStoredHousehold(targetHouseholdId);
                switchedTemporarily = true;
            }

            const response = await apiFetch("/households/delete-request", { method: "POST" });
            await loadProfile(targetHouseholdId);
            Alert.alert(
                "Suppression du foyer",
                String(response?.message ?? "La demande de suppression a été enregistrée.")
            );
        } catch (error: any) {
            if (switchedTemporarily && previousHouseholdId && previousHouseholdId > 0) {
                try {
                    await switchStoredHousehold(previousHouseholdId);
                } catch {
                    // no-op: keep original API error for UX clarity
                }
            }
            Alert.alert("Erreur", error?.message || "Impossible de lancer la suppression du foyer.");
        } finally {
            setRequestingDeletionFor(null);
        }
    };

    const openBlockedParentFlow = (
        title: string,
        message: string,
        fallbackHousehold: HouseholdMembership,
        blocker?: BlockingHouseholdPayload
    ) => {
        const blockedHouseholdId = Number(blocker?.household?.id ?? fallbackHousehold.id);

        Alert.alert(
            title,
            message,
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Gérer les membres",
                    onPress: () => {
                        void openHouseholdManagement(blockedHouseholdId);
                    },
                },
                {
                    text: "Supprimer le foyer",
                    style: "destructive",
                    onPress: () => {
                        void onRequestHouseholdDeletion(blockedHouseholdId);
                    },
                },
            ]
        );
    };

    const onConfirmLeaveHousehold = async (household: HouseholdMembership) => {
        if (leavingHouseholdFor !== null) {
            return;
        }

        const previousHouseholdId = activeHouseholdId;
        const targetHouseholdId = Number(household.id);
        let switchedTemporarily = false;

        setLeavingHouseholdFor(targetHouseholdId);
        try {
            if (targetHouseholdId !== activeHouseholdId) {
                await switchStoredHousehold(targetHouseholdId);
                switchedTemporarily = true;
            }

            const response = await apiFetch("/households/leave", { method: "POST" });
            const updatedUser = response?.user as ApiUser | undefined;

            if (!updatedUser) {
                await loadProfile(previousHouseholdId);
                Alert.alert("Foyer", "Vous avez quitté ce foyer.");
                return;
            }

            const hasRemainingHouseholds = Array.isArray(updatedUser.households)
                && updatedUser.households.length > 0;
            const sanitizedUser: ApiUser = {
                ...updatedUser,
                household_id: hasRemainingHouseholds
                    ? updatedUser.household_id ?? null
                    : null,
            };

            const storedState = await persistStoredUser(sanitizedUser as StoredUser);
            const normalizedUser = storedState.user as ApiUser | null;
            if (normalizedUser) {
                hydrateFromUser(normalizedUser);
            } else {
                await loadProfile(null);
            }

            Alert.alert("Foyer", "Vous avez quitté ce foyer.");
        } catch (error: any) {
            if (switchedTemporarily && previousHouseholdId && previousHouseholdId > 0) {
                try {
                    await switchStoredHousehold(previousHouseholdId);
                } catch {
                    // no-op: keep original API error for UX clarity
                }
            }
            const requiredAction = String(error?.data?.required_action ?? "");
            if (Number(error?.status) === 422 && requiredAction === "define_new_parent_or_delete_household") {
                const blocker = (error?.data ?? {}) as BlockingHouseholdPayload;
                openBlockedParentFlow(
                    "Parent requis",
                    String(
                        error?.message
                        ?? "Ce foyer a besoin d'un parent gestionnaire. Désigne un nouveau parent ou supprime ce foyer."
                    ),
                    household,
                    blocker
                );
            } else {
                Alert.alert("Erreur", error?.message || "Impossible de quitter ce foyer.");
            }
        } finally {
            setLeavingHouseholdFor(null);
        }
    };

    const onLeaveHousehold = (household: HouseholdMembership) => {
        Alert.alert(
            "Quitter ce foyer",
            `Tu vas quitter le foyer "${household.name}". Cette action ne peut pas être annulée.`,
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Quitter",
                    style: "destructive",
                    onPress: () => {
                        void onConfirmLeaveHousehold(household);
                    },
                },
            ]
        );
    };

    const onConfirmDeleteAccount = async () => {
        if (deletingAccount) {
            return;
        }

        if (!currentPassword.trim()) {
            Alert.alert("Compte", "Le mot de passe actuel est requis pour supprimer le compte.");
            return;
        }

        setDeletingAccount(true);
        try {
            await apiFetch("/auth/account", {
                method: "DELETE",
                body: JSON.stringify({
                    current_password: currentPassword,
                }),
            });

            await SecureStore.deleteItemAsync("authToken");
            await clearStoredUser();
            Alert.alert("Compte", "Votre compte a été supprimé définitivement.");
            router.replace("/");
        } catch (error: any) {
            const requiredAction = String(error?.data?.required_action ?? "");
            const blocked = Array.isArray(error?.data?.blocked_households)
                ? (error.data.blocked_households as BlockingHouseholdPayload[])
                : [];

            if (Number(error?.status) === 422 && requiredAction === "define_new_parent_or_delete_household" && blocked.length > 0) {
                const firstBlocked = blocked[0];
                const householdId = Number(firstBlocked?.household?.id ?? 0);
                const householdName = String(firstBlocked?.household?.name ?? "ce foyer");
                const suffix = blocked.length > 1
                    ? `\n\n${blocked.length} foyers sont bloqués au total.`
                    : "";

                Alert.alert(
                    "Suppression du compte bloquée",
                    `${error?.message || "Action impossible pour l'instant."}\n\nFoyer concerné : ${householdName}.${suffix}`,
                    [
                        { text: "Annuler", style: "cancel" },
                        {
                            text: "Gérer les membres",
                            onPress: () => {
                                void openHouseholdManagement(householdId);
                            },
                        },
                        {
                            text: "Supprimer le foyer",
                            style: "destructive",
                            onPress: () => {
                                void onRequestHouseholdDeletion(householdId);
                            },
                        },
                    ]
                );
            } else {
                Alert.alert("Erreur", error?.message || "Impossible de supprimer le compte.");
            }
        } finally {
            setDeletingAccount(false);
        }
    };

    const onDeleteAccount = () => {
        Alert.alert(
            "Supprimer le compte",
            "Cette action est définitive. Ton compte sera supprimé, et tu seras déconnecté immédiatement.",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Supprimer",
                    style: "destructive",
                    onPress: () => {
                        void onConfirmDeleteAccount();
                    },
                },
            ]
        );
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
        <ScrollView keyboardShouldPersistTaps="handled"
            stickyHeaderIndices={[0]}
            style={[styles.container, { backgroundColor: theme.background }]}
            contentContainerStyle={styles.content}
        >
            <View style={[styles.header, { borderBottomColor: theme.icon, paddingTop: Math.max(insets.top, 12), backgroundColor: theme.background }]}>
                <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { borderColor: theme.icon }]}>
                    <MaterialCommunityIcons name="arrow-left" size={20} color={theme.tint} />
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
                        const isLeaving = leavingHouseholdFor === household.id;
                        const isRequestingDeletion = requestingDeletionFor === household.id;
                        const canLeaveHousehold = getHouseholdRole(household) === "parent";

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
                                {canLeaveHousehold ? (
                                    <TouchableOpacity
                                        style={[styles.dangerInlineButton, { borderColor: theme.accentWarm }]}
                                        onPress={() => {
                                            onLeaveHousehold(household);
                                        }}
                                        disabled={isLeaving || leavingHouseholdFor !== null || isRequestingDeletion}
                                    >
                                        <Text style={[styles.dangerInlineButtonText, { color: theme.accentWarm }]}>
                                            {isLeaving ? "Sortie en cours..." : "Quitter ce foyer"}
                                        </Text>
                                    </TouchableOpacity>
                                ) : (
                                    <Text style={[styles.leaveHintText, { color: theme.textSecondary }]}>
                                        Seul un parent peut quitter ce foyer.
                                    </Text>
                                )}
                            </View>
                        );
                    })
                )}

                <TouchableOpacity
                    style={[styles.createHouseholdButton, { borderColor: theme.tint, backgroundColor: `${theme.tint}12` }]}
                    onPress={onCreateNewHousehold}
                >
                    <MaterialCommunityIcons name="home-plus-outline" size={18} color={theme.tint} />
                    <Text style={[styles.createHouseholdButtonText, { color: theme.tint }]}>Créer un nouveau foyer</Text>
                </TouchableOpacity>
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
                <View style={[styles.accountDangerWrap, { borderTopColor: theme.icon }]}> 
                    <Text style={[styles.accountDangerText, { color: theme.textSecondary }]}> 
                        Supprime ton compte uniquement si tu as finalisé la gestion de tes foyers.
                    </Text>
                    <TouchableOpacity
                        style={[styles.accountDangerButton, { borderColor: theme.accentWarm }]}
                        onPress={() => {
                            void onDeleteAccount();
                        }}
                        disabled={deletingAccount}
                    >
                        <Text style={[styles.accountDangerButtonText, { color: theme.accentWarm }]}> 
                            {deletingAccount ? "Suppression du compte..." : "Supprimer mon compte"}
                        </Text>
                    </TouchableOpacity>
                </View>
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
        paddingTop: 0,
        paddingBottom: 36,
        gap: 16,
    },
    header: {
        borderBottomWidth: 1,
        paddingBottom: 12,
        marginBottom: 4,
    },
    backButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 8,
        marginTop: 2,
    },
    title: {
        fontSize: 18,
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
    createHouseholdButton: {
        borderRadius: 10,
        borderWidth: 1,
        paddingVertical: 10,
        paddingHorizontal: 12,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
    },
    createHouseholdButtonText: {
        fontSize: 14,
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
    dangerInlineButton: {
        marginTop: 8,
        borderRadius: 10,
        borderWidth: 1,
        paddingVertical: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    dangerInlineButtonText: {
        fontSize: 14,
        fontWeight: "700",
    },
    leaveHintText: {
        marginTop: 8,
        fontSize: 12,
        fontWeight: "500",
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
    accountDangerWrap: {
        borderTopWidth: 1,
        marginTop: 16,
        paddingTop: 12,
    },
    accountDangerText: {
        fontSize: 12,
        lineHeight: 18,
        marginBottom: 8,
    },
    accountDangerButton: {
        borderRadius: 10,
        borderWidth: 1,
        paddingVertical: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    accountDangerButtonText: {
        fontSize: 14,
        fontWeight: "700",
    },
});
