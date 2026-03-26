import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AppButton } from "@/src/components/ui/AppButton";
import { AppTextInput } from "@/src/components/ui/AppTextInput";
import { StepChildren } from "@/src/features/household-setup/components/StepChildren";

export function HouseholdMembersSection(state: any) {
  const { theme, ui, wizard, form, data, asyncState, actions } = state;

  if (ui.isModuleScope || !wizard.isChildrenStepActive) return null;

  const memberItemBackground = `${theme.tint}12`;

  const renderContent = () => (
    <View style={styles.section}>
      <View style={[styles.collapsibleSectionCard, { backgroundColor: theme.card, borderColor: theme.icon }]}>
        <AppButton
          style={styles.collapsibleSectionHeader}
          onPress={() => form.setMembersExpanded((prev: boolean) => !prev)}
        >
          <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Membres du foyer</Text>
          <MaterialCommunityIcons name={form.membersExpanded ? "chevron-down" : "chevron-right"} size={24} color={theme.textSecondary} />
        </AppButton>

        {form.membersExpanded && (
          <View style={styles.collapsibleSectionBody}>
            {!ui.isEditMode && (
              <>
                <View style={[styles.activeUserCard, { backgroundColor: memberItemBackground }]}>
                  <Text style={[styles.activeUserLabel, { color: theme.textSecondary }]}>Utilisateur actif (Parent)</Text>
                  <Text style={[styles.activeUserName, { color: theme.text }]}>{data.activeUser?.name || "Parent"}</Text>
                  {data.activeUser?.email && <Text style={[styles.activeUserEmail, { color: theme.textSecondary }]}>{data.activeUser.email}</Text>}
                </View>

                {data.sortedDraftMembers.length > 0 && (
                  <View style={{ marginTop: 10, marginBottom: 10, gap: 8 }}>
                    {data.sortedDraftMembers.map(({ member, index }: any) => (
                      <View key={`${member.name}-${index}`} style={[styles.memberCard, { backgroundColor: memberItemBackground }]}>
                        <View style={{ flex: 1 }}>
                          <View style={styles.memberTitleRow}>
                            <Text style={[styles.memberName, { color: theme.text }]}>{member.name}</Text>
                            <AppButton
                              style={[
                                styles.memberRoleBadge,
                                member.role === "parent" ? { borderColor: theme.tint, backgroundColor: `${theme.tint}22` } : { borderColor: theme.icon, backgroundColor: `${theme.icon}22` },
                              ]}
                              onPress={() => actions.toggleDraftMemberRoleAtIndex(index)}
                            >
                              <Text style={[styles.memberRoleBadgeText, { color: member.role === "parent" ? theme.tint : theme.textSecondary }]}>
                                {member.role === "parent" ? "Parent" : "Enfant"}
                              </Text>
                            </AppButton>
                          </View>
                          {member.email && <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>{member.email}</Text>}
                        </View>
                        <AppButton onPress={() => actions.removeMember(index)}>
                          <MaterialCommunityIcons name="trash-can-outline" size={22} color={theme.textSecondary} />
                        </AppButton>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            {ui.isEditMode && (
              asyncState.membersLoading ? (
                <ActivityIndicator size="small" color={theme.tint} />
              ) : (
                <View style={{ gap: 8, marginBottom: 12 }}>
                  {data.orderedManagedMembers.map((member: any) => {
                    const nextRole = data.managedRoleDrafts[member.id] ?? member.role;
                    const isUpdating = asyncState.updatingManagedMemberId === member.id;
                    const isDeleting = asyncState.deletingManagedMemberId === member.id;
                    const shareKey = `managed-${member.id}`;
                    const isSharing = asyncState.sendingMemberKey === shareKey;

                    return (
                      <View key={member.id} style={[styles.memberCard, { backgroundColor: memberItemBackground }]}>
                        <View style={{ flex: 1 }}>
                          <View style={styles.memberTitleRow}>
                            <Text style={[styles.memberName, { color: theme.text }]}>{member.name}</Text>
                            <AppButton
                              style={[
                                styles.memberRoleBadge,
                                nextRole === "parent" ? { borderColor: theme.tint, backgroundColor: `${theme.tint}22` } : { borderColor: theme.icon, backgroundColor: `${theme.icon}22` },
                              ]}
                              onPress={() => actions.confirmManagedMemberRoleToggle(member)}
                              disabled={!ui.canManageMembers || isUpdating || isDeleting}
                            >
                              <Text style={[styles.memberRoleBadgeText, { color: nextRole === "parent" ? theme.tint : theme.textSecondary }]}>
                                {nextRole === "parent" ? "Parent" : "Enfant"}
                              </Text>
                            </AppButton>
                          </View>
                          <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>{member.email || "E-mail non défini"}</Text>
                          <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                            {member.must_change_password ? "Mot de passe temporaire à modifier" : "Accès actif"}
                          </Text>

                          {ui.canManageMembers && (
                            <View style={styles.memberActionRow}>
                              <AppButton
                                onPress={() => actions.onDeleteManagedMember(member)}
                                style={[styles.memberActionBtn, { backgroundColor: theme.background, borderColor: theme.icon, borderWidth: 1 }]}
                                disabled={isUpdating || isDeleting}
                              >
                                <Text style={[styles.memberActionBtnText, { color: theme.text }]}>{isDeleting ? "Supp..." : "Supprimer"}</Text>
                              </AppButton>

                              {member.must_change_password && (
                                <AppButton
                                  onPress={() => { void actions.onShareManagedMemberAccess(member); }}
                                  style={[styles.memberActionBtn, { backgroundColor: theme.background, borderColor: theme.tint, borderWidth: 1 }]}
                                  disabled={isSharing || isUpdating || isDeleting}
                                >
                                  <Text style={[styles.memberActionBtnText, { color: theme.tint }]}>{isSharing ? "Partage..." : "Partager"}</Text>
                                </AppButton>
                              )}
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )
            )}

            {!ui.isEditMode || ui.canManageMembers ? (
              <View style={[styles.memberEditor, { backgroundColor: memberItemBackground }]}>
                <AppTextInput
                  containerStyle={{ marginBottom: 12 }}
                  placeholder="Nom du membre"
                  placeholderTextColor={theme.textSecondary}
                  value={form.memberName}
                  onChangeText={form.setMemberName}
                />
                <AppTextInput
                  containerStyle={{ marginBottom: 12 }}
                  placeholder="Email (optionnel)"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={form.memberEmail}
                  onChangeText={form.setMemberEmail}
                />
                <View style={styles.roleRow}>
                  <AppButton
                    onPress={() => form.setMemberRole("parent")}
                    style={[styles.roleChip, { borderColor: theme.icon, backgroundColor: theme.background }, form.memberRole === "parent" && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` }]}
                  >
                    <Text style={[styles.roleChipText, { color: theme.text }]}>Parent</Text>
                  </AppButton>
                  <AppButton
                    onPress={() => form.setMemberRole("enfant")}
                    style={[styles.roleChip, { borderColor: theme.icon, backgroundColor: theme.background }, form.memberRole === "enfant" && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` }]}
                  >
                    <Text style={[styles.roleChipText, { color: theme.text }]}>Enfant</Text>
                  </AppButton>
                </View>

                <AppButton
                  onPress={() => { ui.isEditMode ? void actions.onAddManagedMember() : actions.addMember(); }}
                  style={[styles.addButton, { backgroundColor: theme.background }]}
                  disabled={ui.isEditMode && asyncState.addingManagedMember}
                >
                  <MaterialCommunityIcons name="plus" size={20} color={theme.tint} />
                  <Text style={[styles.addButtonText, { color: theme.tint }]}>
                    {ui.isEditMode && asyncState.addingManagedMember ? "Ajout..." : "Ajouter ce membre"}
                  </Text>
                </AppButton>
              </View>
            ) : (
              <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>Seul un parent peut gérer les membres du foyer.</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
return (
    <>
      {wizard.shouldUseSetupWizard && (
        <StepChildren
          stepIndex={wizard.childrenStepIndex}
          totalSteps={wizard.setupFlow.totalSteps}
          footer={(
            <View style={styles.wizardActionsRow}>
              <AppButton
                style={[styles.wizardSecondaryBtn, { borderColor: theme.icon, backgroundColor: theme.card }]}
                onPress={wizard.goToPreviousSetupStep}
              >
                <Text style={[styles.wizardSecondaryBtnText, { color: theme.text }]}>Retour</Text>
              </AppButton>
            </View>
          )}
        >
          <></>
        </StepChildren>
      )}
      {renderContent()}
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  collapsibleSectionCard: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  collapsibleSectionHeader: { paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  collapsibleSectionBody: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 10 },
  activeUserCard: { borderRadius: 12, padding: 10, marginBottom: 8 },
  activeUserLabel: { fontSize: 11, fontWeight: "600" },
  activeUserName: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  activeUserEmail: { fontSize: 11, marginTop: 1 },
  memberCard: { borderRadius: 12, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  memberTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  memberRoleBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  memberRoleBadgeText: { fontSize: 10, fontWeight: "700" },
  memberName: { fontSize: 14, fontWeight: "700" },
  memberMeta: { fontSize: 11, marginTop: 2 },
  memberActionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  memberActionBtn: { minHeight: 30, paddingHorizontal: 8, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  memberActionBtnText: { fontSize: 11, fontWeight: "700" },
  memberEditor: { borderRadius: 12, padding: 10 },
  input: { height: 50, borderRadius: 12, paddingHorizontal: 16, fontSize: 16 },
  inputWithBottomSpacing: { marginBottom: 12 },
  roleRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  roleChip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  roleChipText: { fontSize: 12, fontWeight: "600" },
  addButton: { height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 4 },
  addButtonText: { fontSize: 14, fontWeight: "700" },
  wizardActionsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  wizardSecondaryBtn: { minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  wizardSecondaryBtnText: { fontSize: 15, fontWeight: "600" },
});