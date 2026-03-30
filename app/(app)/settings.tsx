import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View, useColorScheme } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";

import { AppTextInput } from "@/src/components/ui/AppTextInput";
import { AppButton } from "@/src/components/ui/AppButton";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { useSettings, getHouseholdRole } from "@/src/hooks/useSettings";

export default function SettingsScreen() {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];
  
    const { state, computed, setters, actions } = useSettings();

    if (state.loading) {
        return (
            <View style={[styles.loadingWrap, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.tint} />
            </View>
        );
    }

    return (
        <ScrollView
            keyboardShouldPersistTaps="handled"
            stickyHeaderIndices={[0]}
            style={[styles.container, { backgroundColor: theme.background }]}
            contentContainerStyle={styles.scrollContent}
        >
            <View style={{ backgroundColor: theme.background, paddingHorizontal: 12, zIndex: 20, elevation: 20 }}>
                <ScreenHeader
                    title="Paramètres utilisateur"
                    subtitle="Gère tes foyers, ton pseudo, ton e-mail et ton mot de passe."
                    withBackButton
                    showBorder
                    safeTop
                    containerStyle={{ paddingHorizontal: 0, marginBottom: 0 }}
                    contentStyle={{ minHeight: 0 }}
                />
            </View>

            <View style={styles.cardsContainer}>
                {/* --- CARTE : MES FOYERS --- */}
                <View style={[styles.card, { backgroundColor: theme.card }]}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Mes foyers</Text>

                    {computed.households.length === 0 ? (
                        <Text style={[styles.sectionText, { color: theme.textSecondary }]}>Aucun foyer associé.</Text>
                    ) : (
                        computed.households.map((household) => {
                            const isSaving = state.savingNicknameFor === household.id;
                            const isActiveHousehold = household.id === computed.activeHouseholdId;
                            const canSwitchHousehold = computed.households.length > 1;
                            const isSwitching = state.switchingHouseholdFor === household.id;
                            const isLeaving = state.leavingHouseholdFor === household.id;
                            const isRequestingDeletion = state.requestingDeletionFor === household.id;
                            const canLeaveHousehold = getHouseholdRole(household) === "parent";

                            return (
                                <View key={household.id} style={[styles.householdItem, { borderColor: theme.icon }]}>
                                    <View style={styles.householdMetaRow}>
                                        <Text style={[styles.householdName, { color: theme.text }]}>{household.name}</Text>
                                        <View style={[styles.roleBadge, { backgroundColor: `${theme.icon}40` }]}>
                                            <Text style={[styles.roleText, { color: theme.textSecondary }]}>
                                                {getHouseholdRole(household)}
                                            </Text>
                                        </View>
                                    </View>

                                    {canSwitchHousehold && (
                                        <View style={styles.householdSwitchRow}>
                                            <Text style={[styles.householdSwitchHint, { color: theme.textSecondary }]}>
                                                {isActiveHousehold ? "Foyer actif" : "Foyer disponible"}
                                            </Text>
                                            {isActiveHousehold ? (
                                                <View style={[styles.activeBadge, { backgroundColor: `${theme.tint}22` }]}>
                                                    <Text style={[styles.activeBadgeText, { color: theme.tint }]}>Actif</Text>
                                                </View>
                                            ) : (
                                                <AppButton
                                                    title="Utiliser ce foyer"
                                                    variant="ghost"
                                                    onPress={() => actions.onSwitchHousehold(household.id)}
                                                    loading={isSwitching}
                                                    style={styles.inlineButton}
                                                    textStyle={{ fontSize: 13, color: theme.tint }}
                                                />
                                            )}
                                        </View>
                                    )}

                                    <AppTextInput
                                        placeholder="Pseudo dans ce foyer"
                                        value={state.householdNicknames[household.id] ?? ""}
                                        onChangeText={(val) => setters.setHouseholdNicknames((prev) => ({ ...prev, [household.id]: val }))}
                                        containerStyle={{ marginBottom: 12 }}
                                    />

                                    <AppButton
                                        title="Mettre à jour le pseudo"
                                        variant="primary"
                                        onPress={() => actions.onSaveNickname(household.id)}
                                        loading={isSaving}
                                        style={styles.inlineButton}
                                    />

                                    {canLeaveHousehold ? (
                                        <AppButton
                                            title="Quitter ce foyer"
                                            variant="ghost"
                                            onPress={() => actions.onLeaveHousehold(household)}
                                            loading={isLeaving}
                                            disabled={state.leavingHouseholdFor !== null || isRequestingDeletion}
                                            style={[styles.inlineButton, { borderColor: theme.accentWarm, borderWidth: 1}]}
                                            textStyle={{ color: theme.accentWarm }}
                                        />
                                    ) : (
                                        <Text style={[styles.leaveHintText, { color: theme.textSecondary }]}>
                                            Seul un parent peut quitter ce foyer.
                                        </Text>
                                    )}
                                </View>
                            );
                        })
                    )}

                    <AppButton
                        variant="ghost"
                        onPress={actions.onCreateNewHousehold}
                        style={{
                            borderWidth: 1, 
                            borderColor: theme.tint, 
                            backgroundColor: `${theme.tint}12`,
                            flexDirection: "row",
                            gap: 8,
                            minHeight: 40,
                        }}
>
                        <MaterialCommunityIcons name="home-plus-outline" size={20} color={theme.tint} />
                        <Text style={{ color: theme.tint, fontSize: 16, fontWeight: "700" }}>
                        Créer un nouveau foyer
                        </Text>
                    </AppButton>
                </View>

                {/* --- CARTE : MON COMPTE --- */}
                <View style={[styles.card, { backgroundColor: theme.card }]}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Mon compte</Text>

                    <AppTextInput
                        label="Adresse e-mail"
                        containerStyle={{ marginBottom: 16 }}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        value={state.email}
                        onChangeText={setters.setEmail}
                    />

                    <AppTextInput
                        label="Mot de passe actuel"
                        containerStyle={{ marginBottom: 16 }}
                        secureTextEntry={!state.showCurrentPassword}
                        autoCapitalize="none"
                        value={state.currentPassword}
                        onChangeText={setters.setCurrentPassword}
                        rightSlot={
                            <TouchableOpacity onPress={() => setters.setShowCurrentPassword((p) => !p)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <MaterialCommunityIcons name={state.showCurrentPassword ? "eye-off-outline" : "eye-outline"} size={20} color={theme.textSecondary} />
                            </TouchableOpacity>
                        }
                    />

                    <AppTextInput
                        label="Nouveau mot de passe (optionnel)"
                        containerStyle={{ marginBottom: 16 }}
                        secureTextEntry={!state.showNewPassword}
                        autoCapitalize="none"
                        value={state.newPassword}
                        onChangeText={setters.setNewPassword}
                        rightSlot={
                            <TouchableOpacity onPress={() => setters.setShowNewPassword((p) => !p)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <MaterialCommunityIcons name={state.showNewPassword ? "eye-off-outline" : "eye-outline"} size={20} color={theme.textSecondary} />
                            </TouchableOpacity>
                        }
                    />

                    <AppTextInput
                        label="Confirmation"
                        containerStyle={{ marginBottom: 20 }}
                        placeholder="Retape le nouveau mot de passe"
                        secureTextEntry={!state.showConfirmPassword}
                        autoCapitalize="none"
                        value={state.confirmPassword}
                        onChangeText={setters.setConfirmPassword}
                        rightSlot={
                            <TouchableOpacity onPress={() => setters.setShowConfirmPassword((p) => !p)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <MaterialCommunityIcons name={state.showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color={theme.textSecondary} />
                            </TouchableOpacity>
                        }
                    />

                    <AppButton
                        title="Mettre à jour le profil"
                        variant="primary"
                        onPress={actions.onSaveProfile}
                        loading={state.savingProfile}
                        style={styles.inlineButton}
                    />
                                                
                    <View style={[styles.accountDangerWrap, { borderTopColor: theme.icon }]}>
                        <Text style={[styles.accountDangerText, { color: theme.textSecondary }]}>
                            Supprime ton compte uniquement si tu as finalisé la gestion de tes foyers.
                        </Text>
                        
                        <AppButton
                            title="Supprimer mon compte"
                            variant="ghost"
                            onPress={actions.onDeleteAccount}
                            loading={state.deletingAccount}
                            style={[styles.inlineButton, { borderColor: theme.accentWarm, borderWidth: 1}]}
                            textStyle={{ color: theme.accentWarm }}
                        />
                    </View>
                </View>
            </View>
        </ScrollView>
    );
}


const styles = StyleSheet.create({
    loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
    container: { flex: 1 },
    scrollContent: { paddingBottom: 40 },
    cardsContainer: { paddingHorizontal: 12, paddingTop: 16, gap: 20 },
    card: { borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
    sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
    sectionText: { fontSize: 14, lineHeight: 20 },
    householdItem: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 16 },
    householdMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 },
    householdName: { fontSize: 16, fontWeight: "700", flex: 1 },
    roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    roleText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
    householdSwitchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 8 },
    householdSwitchHint: { fontSize: 13, fontWeight: "500" },
    activeBadge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
    activeBadgeText: { fontSize: 12, fontWeight: "700" },
    leaveHintText: { marginTop: 8, fontSize: 12, fontWeight: "500", textAlign: "center" },
    accountDangerWrap: { borderTopWidth: 1, marginTop: 24, paddingTop: 16 },
    accountDangerText: { fontSize: 12, lineHeight: 18, marginBottom: 6, textAlign: "center" },
    inlineButton: {

        borderRadius: 10,
        paddingVertical: 10,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 6,

    },
});
