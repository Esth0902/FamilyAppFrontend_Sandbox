import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AppButton } from "@/src/components/ui/AppButton";
import { HouseholdSetupHeader } from "./HouseholdSetupHeader";

export function HouseholdSetupShareAccountsView(state: any) {
  const { theme, ui, data, asyncState, actions } = state;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <HouseholdSetupHeader
        title="Comptes créés"
        subtitle="Envoie les identifiants temporaires à chaque membre."
        backgroundColor={theme.background}
        onBackPress={actions.goBack}
      />

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Envoyer les accès</Text>
          <Text style={[styles.memberMeta, { color: theme.textSecondary, marginBottom: 10 }]}>
            Envoie les identifiants temporaires à chaque membre.
          </Text>

          <View style={{ gap: 8 }}>
            {data.createdMembersForShare.map((member: any, index: number) => {
              const memberKey = typeof member.id === "number"
                ? `member-${member.id}`
                : `member-${index}-${member.generated_email ?? member.name ?? "unknown"}`;
              const isSending = asyncState.sendingMemberKey === memberKey;

              return (
                <View key={memberKey} style={[styles.memberCard, { backgroundColor: theme.card }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.memberName, { color: theme.text }]}>{member.name || "Membre"}</Text>
                    <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>{member.generated_email || "Email généré"}</Text>
                  </View>

                  <AppButton
                    onPress={() => actions.shareMemberCredentials(member, memberKey)}
                    style={[styles.sendCredentialBtn, { backgroundColor: theme.tint }]}
                    disabled={isSending}
                  >
                    {isSending ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="send" size={16} color="white" />
                        <Text style={styles.sendCredentialBtnText}>Envoyer</Text>
                      </>
                    )}
                  </AppButton>
                </View>
              );
            })}
          </View>
        </View>

        <AppButton
          style={[styles.submitButton, { backgroundColor: theme.tint, opacity: ui.loading ? 0.7 : 1 }]}
          onPress={actions.handleSave}
          disabled={ui.loading}
        >
          <Text style={styles.submitButtonText}>Terminer</Text>
        </AppButton>
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  memberCard: { borderRadius: 12, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  memberName: { fontSize: 14, fontWeight: "700" },
  memberMeta: { fontSize: 11, marginTop: 2 },
  sendCredentialBtn: { minWidth: 104, height: 38, borderRadius: 10, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  sendCredentialBtnText: { color: "white", fontSize: 13, fontWeight: "700" },
  submitButton: { height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 10 },
  submitButtonText: { color: "white", fontSize: 18, fontWeight: "bold" },
});
