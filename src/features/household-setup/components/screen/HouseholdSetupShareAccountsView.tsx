import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { AppButton } from "@/src/components/ui/AppButton";

type HouseholdSetupShareAccountsViewProps = {
  insets: { top: number };
  theme: {
    background: string;
    tint: string;
    text: string;
    textSecondary: string;
    card: string;
    icon: string;
  };
  ui: {
    loading: boolean;
  };
  data: {
    createdMembersForShare: Array<{
      id?: number;
      name?: string;
      generated_email?: string;
    }>;
  };
  asyncState: {
    sendingMemberKey?: string | null;
  };
  actions: {
    goBack: () => void;
    handleSave: () => void;
    shareMemberCredentials: (member: any, memberKey: string) => void | Promise<void>;
  };
};

export function HouseholdSetupShareAccountsView({
  insets,
  theme,
  ui,
  data,
  asyncState,
  actions,
}: HouseholdSetupShareAccountsViewProps) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <View
        style={[
          styles.headerBar,
          {
            borderBottomColor: theme.icon,
            paddingTop: Math.max(insets.top, 12),
          },
        ]}
      >
        <AppButton
          onPress={actions.goBack}
          style={[styles.headerActionBtn, { borderColor: theme.icon }]}
        >
          <MaterialCommunityIcons name="close" size={20} color={theme.tint} />
        </AppButton>

        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Comptes créés
        </Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Envoyer les accès
          </Text>
          <Text
            style={[
              styles.memberMeta,
              { color: theme.textSecondary, marginBottom: 10 },
            ]}
          >
            Envoie les identifiants temporaires à chaque membre.
          </Text>

          <View style={{ gap: 8 }}>
            {data.createdMembersForShare.map((member, index) => {
              const memberKey =
                typeof member.id === "number"
                  ? `member-${member.id}`
                  : `member-${index}-${member.generated_email ?? member.name ?? "unknown"}`;

              const isSending = asyncState.sendingMemberKey === memberKey;

              return (
                <View
                  key={memberKey}
                  style={[styles.memberCard, { backgroundColor: theme.card }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.memberName, { color: theme.text }]}>
                      {member.name || "Membre"}
                    </Text>
                    <Text
                      style={[styles.memberMeta, { color: theme.textSecondary }]}
                    >
                      {member.generated_email || "Email généré"}
                    </Text>
                  </View>

                  <AppButton
                    onPress={() =>
                      actions.shareMemberCredentials(member, memberKey)
                    }
                    style={[
                      styles.sendCredentialBtn,
                      { backgroundColor: theme.tint },
                    ]}
                    disabled={isSending}
                  >
                    {isSending ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <>
                        <MaterialCommunityIcons
                          name="send"
                          size={16}
                          color="white"
                        />
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
          style={[
            styles.submitButton,
            { backgroundColor: theme.tint, opacity: ui.loading ? 0.7 : 1 },
          ]}
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
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", flex: 1 },
  container: { padding: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  memberCard: {
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  memberName: { fontSize: 14, fontWeight: "700" },
  memberMeta: { fontSize: 11, marginTop: 2 },
  sendCredentialBtn: {
    minWidth: 104,
    height: 38,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  sendCredentialBtnText: {
    color: "white",
    fontSize: 13,
    fontWeight: "700",
  },
  submitButton: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  submitButtonText: { color: "white", fontSize: 18, fontWeight: "bold" },
});