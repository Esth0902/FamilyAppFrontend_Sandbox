import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AppButton } from "@/src/components/ui/AppButton";
import { AppTextInput } from "@/src/components/ui/AppTextInput";

export function ConnectedHouseholdSection(state: any) {
  const { theme, ui, form, data, asyncState, actions } = state;

  if (ui.isModuleScope || !ui.isEditMode) return null;
  const memberItemBackground = `${theme.tint}12`;

  return (
    <View style={styles.section}>
      <View style={[styles.collapsibleSectionCard, { backgroundColor: theme.card, borderColor: theme.icon }]}>
        <AppButton style={styles.collapsibleSectionHeader} onPress={() => form.setConnectedHouseholdExpanded((prev: boolean) => !prev)}>
          <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Foyer connecté</Text>
          <MaterialCommunityIcons name={form.connectedHouseholdExpanded ? "chevron-down" : "chevron-right"} size={24} color={theme.textSecondary} />
        </AppButton>

        {form.connectedHouseholdExpanded && (
          <View style={styles.collapsibleSectionBody}>
            {asyncState.connectionLoading ? (
              <ActivityIndicator size="small" color={theme.tint} />
            ) : !data.connectionPermissions.can_manage_connection ? (
              <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>Seul un parent peut gérer la liaison entre foyers.</Text>
            ) : data.connectionState.is_connected && data.connectionState.linked_household ? (
              <View style={[styles.connectedHouseholdCard, { backgroundColor: memberItemBackground }]}>
                <Text style={[styles.connectedHouseholdLabel, { color: theme.textSecondary }]}>Liaison active</Text>
                <Text style={[styles.connectedHouseholdName, { color: theme.text }]}>{data.connectionState.linked_household.name}</Text>
                <AppButton
                  style={[styles.connectedHouseholdDangerBtn, { borderColor: theme.accentWarm }]}
                  onPress={actions.onUnlinkConnectedHousehold}
                  disabled={asyncState.connectionActionLoading === "unlink" || !data.connectionPermissions.can_unlink}
                >
                  {asyncState.connectionActionLoading === "unlink" ? (
                    <ActivityIndicator size="small" color={theme.accentWarm} />
                  ) : (
                    <Text style={[styles.connectedHouseholdDangerText, { color: theme.accentWarm }]}>Rompre la liaison</Text>
                  )}
                </AppButton>
              </View>
            ) : data.connectionState.pending_request ? (
              <View style={[styles.connectedHouseholdCard, { backgroundColor: memberItemBackground }]}>
                <Text style={[styles.connectedHouseholdLabel, { color: theme.textSecondary }]}>Demande en attente</Text>
                <Text style={[styles.connectedHouseholdName, { color: theme.text }]}>{data.connectionState.pending_request.other_household?.name ?? "Autre foyer"}</Text>
                <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                  {data.connectionState.pending_request.direction === "incoming"
                    ? "Ce foyer a demandé à se connecter au vôtre."
                    : "Votre demande a été envoyée."}
                </Text>
              </View>
            ) : (
              <View style={[styles.connectedHouseholdCard, { backgroundColor: memberItemBackground }]}>
                <Text style={[styles.memberMeta, { color: theme.textSecondary, marginBottom: 8 }]}>Aucun foyer n’est connecté pour le moment.</Text>
                <AppButton
                  style={[styles.connectedHouseholdPrimaryBtn, { backgroundColor: theme.tint }]}
                  onPress={() => { void actions.onShareHouseholdConnectionCode(); }}
                  disabled={asyncState.connectionActionLoading === "share" || !data.connectionPermissions.can_generate_code}
                >
                  {asyncState.connectionActionLoading === "share" ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text style={styles.connectedHouseholdPrimaryText}>Partager un code de liaison</Text>
                  )}
                </AppButton>

                {data.connectionState.active_code?.code && (
                  <View style={[styles.connectedCodeInfo, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                    <Text style={[styles.connectedCodeLabel, { color: theme.textSecondary }]}>Code actuel</Text>
                    <Text style={[styles.connectedCodeValue, { color: theme.text }]}>{data.connectionState.active_code.code}</Text>
                  </View>
                )}

                <Text style={[styles.label, { color: theme.text, marginBottom: 6, marginTop: 12 }]}>Connecter un foyer avec un code</Text>
                <AppTextInput
                  containerStyle={{ marginBottom: 12 }}
                  value={form.connectionCodeInput}
                  onChangeText={(value: string) => form.setConnectionCodeInput(value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  autoCapitalize="characters"
                  placeholder="Ex: AB12CD34"
                  placeholderTextColor={theme.textSecondary}
                />
                <AppTextInput
                  containerStyle={{ marginBottom: 12, justifyContent: "center", alignItems: "center", paddingHorizontal: 0 }}
                  onPress={() => {
                    if (asyncState.connectionActionLoading === "connect") return;
                    void actions.onConnectHouseholdWithCode();
                  }}
                  style={{ opacity: asyncState.connectionActionLoading === "connect" ? 0.5 : 1 }}>
                    {asyncState.connectionActionLoading === "connect" ? (
                      <ActivityIndicator size="small" color={theme.tint} />
                    ) : (
                    <Text style={[
                      styles.connectedHouseholdSecondaryText, 
                      { color: theme.tint, textAlign: 'center', width: '100%' }
                    ]}>
                      Envoyer la demande
                    </Text>
                  )}
                  </AppTextInput>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  collapsibleSectionCard: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  collapsibleSectionHeader: { paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  collapsibleSectionBody: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 10 },
  memberMeta: { fontSize: 11, marginTop: 2 },
  connectedHouseholdCard: { borderRadius: 12, padding: 10 },
  connectedHouseholdLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 },
  connectedHouseholdName: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  connectedHouseholdPrimaryBtn: { minHeight: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  connectedHouseholdPrimaryText: { color: "white", fontSize: 14, fontWeight: "700" },
  connectedHouseholdSecondaryBtn: { minHeight: 44, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  connectedHouseholdSecondaryText: { fontSize: 14, fontWeight: "700" },
  connectedHouseholdDangerBtn: { minHeight: 40, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, alignSelf: "flex-start" },
  connectedHouseholdDangerText: { fontSize: 13, fontWeight: "700" },
  connectedCodeInfo: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 10 },
  connectedCodeLabel: { fontSize: 12, fontWeight: "700", marginBottom: 2 },
  connectedCodeValue: { fontSize: 20, fontWeight: "800", letterSpacing: 1, marginBottom: 4 },
  input: { height: 50, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, marginBottom: 16 },
  inputWithSmallBottomSpacing: { marginBottom: 10 },
});