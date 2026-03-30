import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { apiFetch } from "@/src/api/client";
import { logoutAuth } from "@/src/store/useAuthStore";
import {
    clearStoredUser,
    normalizeStoredUser,
    persistStoredUser,
    switchStoredHousehold,
    useStoredUserState,
    type StoredUser,
} from "@/src/session/user-cache";

// --- TYPES & HELPERS ---
export type HouseholdPivot = { role?: string; nickname?: string | null };
export type HouseholdMembership = { id: number; name: string; role?: string; nickname?: string | null; pivot?: HouseholdPivot };
export type ApiUser = { id: number; name: string; email: string; household_id?: number | null; households?: HouseholdMembership[] };
export type BlockingHouseholdPayload = { household?: { id?: number; name?: string }; candidate_members?: { id?: number; name?: string; role?: string }[] };

export const getHouseholdRole = (household: HouseholdMembership): string => household.pivot?.role ?? household.role ?? "enfant";
export const getHouseholdNickname = (household: HouseholdMembership): string => household.pivot?.nickname ?? household.nickname ?? "";

// --- HOOK CUSTOM ---
export function useSettings() {
    const router = useRouter();
    const { user: cachedUser } = useStoredUserState();

    // États de chargement
    const [loading, setLoading] = useState(true);
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingNicknameFor, setSavingNicknameFor] = useState<number | null>(null);
    const [switchingHouseholdFor, setSwitchingHouseholdFor] = useState<number | null>(null);
    const [leavingHouseholdFor, setLeavingHouseholdFor] = useState<number | null>(null);
    const [requestingDeletionFor, setRequestingDeletionFor] = useState<number | null>(null);
    const [deletingAccount, setDeletingAccount] = useState(false);

    // États du formulaire
    const [user, setUser] = useState<ApiUser | null>(null);
    const [email, setEmail] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [householdNicknames, setHouseholdNicknames] = useState<Record<number, string>>({});

    // --- LOGIQUE INTERNE ---
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
        if (Number.isFinite(explicit) && explicit > 0) return explicit;
        const firstHouseholdId = Number(households[0]?.id ?? 0);
        return Number.isFinite(firstHouseholdId) && firstHouseholdId > 0 ? firstHouseholdId : null;
    }, [households, user?.household_id]);

    const persistUserCache = useCallback(async (apiUser: ApiUser, preferredHouseholdId?: number | null) => {
        const parsedCachedHouseholdId = Number(cachedUser?.household_id ?? 0);
        const cachedHouseholdId = Number.isFinite(parsedCachedHouseholdId) && parsedCachedHouseholdId > 0 ? Math.trunc(parsedCachedHouseholdId) : null;
        const resolvedPreferredHouseholdId = preferredHouseholdId ?? activeHouseholdId ?? cachedHouseholdId;

        const normalizedUser = normalizeStoredUser(apiUser as StoredUser, resolvedPreferredHouseholdId) as ApiUser | null;
        if (!normalizedUser) return null;

        await persistStoredUser(normalizedUser as StoredUser);
        return normalizedUser;
    }, [activeHouseholdId, cachedUser?.household_id]);

    const loadProfile = useCallback(async (preferredHouseholdId?: number | null) => {
        try {
            const response = await apiFetch("/me");
            const apiUser = response?.user as ApiUser | undefined;
            if (!apiUser) throw new Error("Profil introuvable.");

            const normalizedUser = await persistUserCache(apiUser, preferredHouseholdId);
            hydrateFromUser(normalizedUser ?? apiUser);
        } catch (error: any) {
            Alert.alert("Erreur", error?.message || "Impossible de charger le profil.");
        } finally {
            setLoading(false);
        }
    }, [hydrateFromUser, persistUserCache]);

    useEffect(() => {
        void loadProfile();
    }, [loadProfile]);

    // --- ACTIONS EXPOSÉES ---
    const onSaveNickname = async (householdId: number) => {
        const nickname = (householdNicknames[householdId] ?? "").trim();
        if (!nickname) return Alert.alert("Pseudo", "Le pseudo ne peut pas être vide.");

        setSavingNicknameFor(householdId);
        try {
            await apiFetch(`/auth/households/${householdId}/nickname`, { method: "PATCH", body: JSON.stringify({ nickname }) });
            await loadProfile(activeHouseholdId);
            Alert.alert("Pseudo", "Pseudo du foyer mis à jour.");
        } catch (error: any) {
            Alert.alert("Erreur", error?.message || "Impossible de mettre à jour le pseudo.");
        } finally {
            setSavingNicknameFor(null);
        }
    };

    const onSwitchHousehold = async (householdId: number) => {
        if (householdId === activeHouseholdId) return;
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

    const onCreateNewHousehold = () => router.push("/householdSetup?mode=create");

    const openHouseholdManagement = async (householdId: number) => {
        if (!Number.isFinite(householdId) || householdId <= 0) return;
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
        if (!Number.isFinite(householdId) || householdId <= 0) return Alert.alert("Erreur", "Foyer invalide.");
        if (requestingDeletionFor !== null) return;

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
            Alert.alert("Suppression du foyer", String(response?.message ?? "La demande de suppression a été enregistrée."));
        } catch (error: any) {
            if (switchedTemporarily && previousHouseholdId && previousHouseholdId > 0) {
                try { await switchStoredHousehold(previousHouseholdId); } catch {}
            }
            Alert.alert("Erreur", error?.message || "Impossible de lancer la suppression du foyer.");
        } finally {
            setRequestingDeletionFor(null);
        }
    };

    const openBlockedParentFlow = (title: string, message: string, fallbackHousehold: HouseholdMembership, blocker?: BlockingHouseholdPayload) => {
        const blockedHouseholdId = Number(blocker?.household?.id ?? fallbackHousehold.id);
        Alert.alert(title, message, [
            { text: "Annuler", style: "cancel" },
            { text: "Gérer les membres", onPress: () => void openHouseholdManagement(blockedHouseholdId) },
            { text: "Supprimer le foyer", style: "destructive", onPress: () => void onRequestHouseholdDeletion(blockedHouseholdId) },
        ]);
    };

    const onConfirmLeaveHousehold = async (household: HouseholdMembership) => {
        if (leavingHouseholdFor !== null) return;

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
                return Alert.alert("Foyer", "Vous avez quitté ce foyer.");
            }

            const hasRemainingHouseholds = Array.isArray(updatedUser.households) && updatedUser.households.length > 0;
            const sanitizedUser: ApiUser = { ...updatedUser, household_id: hasRemainingHouseholds ? updatedUser.household_id ?? null : null };

            const storedState = await persistStoredUser(sanitizedUser as StoredUser);
            if (storedState.user) hydrateFromUser(storedState.user as ApiUser);
            else await loadProfile(null);

            Alert.alert("Foyer", "Vous avez quitté ce foyer.");
        } catch (error: any) {
            if (switchedTemporarily && previousHouseholdId && previousHouseholdId > 0) {
                try { await switchStoredHousehold(previousHouseholdId); } catch {}
            }
            if (Number(error?.status) === 422 && error?.data?.required_action === "define_new_parent_or_delete_household") {
                openBlockedParentFlow("Parent requis", error?.message ?? "Ce foyer a besoin d'un parent gestionnaire.", household, error?.data);
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
                { text: "Quitter", style: "destructive", onPress: () => void onConfirmLeaveHousehold(household) },
            ]
        );
    };

    const onConfirmDeleteAccount = async () => {
        if (deletingAccount) return;
        if (!currentPassword.trim()) return Alert.alert("Compte", "Le mot de passe actuel est requis.");

        setDeletingAccount(true);
        try {
            await apiFetch("/auth/account", { method: "DELETE", body: JSON.stringify({ current_password: currentPassword }) });
            await clearStoredUser();
            await logoutAuth();
            Alert.alert("Compte", "Votre compte a été supprimé définitivement.");
        } catch (error: any) {
            const blocked = Array.isArray(error?.data?.blocked_households) ? error.data.blocked_households : [];
            if (Number(error?.status) === 422 && error?.data?.required_action === "define_new_parent_or_delete_household" && blocked.length > 0) {
                const householdId = Number(blocked[0]?.household?.id ?? 0);
                Alert.alert(
                    "Suppression bloquée",
                    `${error?.message || "Action impossible."}\nFoyer concerné : ${blocked[0]?.household?.name}`,
                    [
                        { text: "Annuler", style: "cancel" },
                        { text: "Gérer les membres", onPress: () => void openHouseholdManagement(householdId) },
                        { text: "Supprimer le foyer", style: "destructive", onPress: () => void onRequestHouseholdDeletion(householdId) },
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
        Alert.alert("Supprimer le compte", "Cette action est définitive.", [
            { text: "Annuler", style: "cancel" },
            { text: "Supprimer", style: "destructive", onPress: () => void onConfirmDeleteAccount() },
        ]);
    };

    const onSaveProfile = async () => {
        if (!user) return;
        const trimmedEmail = email.trim();
        const emailChanged = trimmedEmail !== user.email;
        const passwordChanged = newPassword.trim().length > 0;

        if (!emailChanged && !passwordChanged) return Alert.alert("Profil", "Aucune modification detectée.");
        if (!currentPassword) return Alert.alert("Profil", "Le mot de passe actuel est requis.");
        if (passwordChanged && newPassword !== confirmPassword) return Alert.alert("Profil", "Confirmation du mot de passe invalide.");

        const payload: any = { current_password: currentPassword };
        if (emailChanged) payload.email = trimmedEmail;
        if (passwordChanged) {
            payload.password = newPassword;
            payload.password_confirmation = confirmPassword;
        }

        setSavingProfile(true);
        try {
            const response = await apiFetch("/auth/profile", { method: "PATCH", body: JSON.stringify(payload) });
            if (response?.user) {
                const normalizedUser = await persistUserCache(response.user, activeHouseholdId);
                hydrateFromUser(normalizedUser ?? response.user);
            }
            setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
            Alert.alert("Profil", "Informations mises à jour.");
        } catch (error: any) {
            Alert.alert("Erreur", error?.message || "Impossible de mettre à jour le profil.");
        } finally {
            setSavingProfile(false);
        }
    };

    return {
        state: {
            loading, savingProfile, savingNicknameFor, switchingHouseholdFor, leavingHouseholdFor, requestingDeletionFor, deletingAccount,
            email, currentPassword, newPassword, confirmPassword, showCurrentPassword, showNewPassword, showConfirmPassword, householdNicknames
        },
        computed: { households, activeHouseholdId },
        setters: {
            setEmail, setCurrentPassword, setNewPassword, setConfirmPassword, setShowCurrentPassword, setShowNewPassword, setShowConfirmPassword, setHouseholdNicknames
        },
        actions: {
            onSaveNickname, onSwitchHousehold, onCreateNewHousehold, onLeaveHousehold, onDeleteAccount, onSaveProfile
        }
    };
}
