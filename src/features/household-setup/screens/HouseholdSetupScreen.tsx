import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "@/src/components/ui/AppButton";
import { AppTextInput } from "@/src/components/ui/AppTextInput";
import { StepChildren } from "@/src/features/household-setup/components/StepChildren";
import { StepModules } from "@/src/features/household-setup/components/StepModules";
import { StepName } from "@/src/features/household-setup/components/StepName";
import {
  WHEEL_CONTAINER_HEIGHT,
  WHEEL_ITEM_HEIGHT,
  WHEEL_VERTICAL_PADDING,
} from "@/src/features/household-setup/utils/householdSetup.constants";
import { normalizeCustodyWeekStartDate } from "@/src/features/household-setup/utils/householdSetup.helpers";
import { useSetupHouseholdScreen } from "@/src/features/household-setup/hooks/useSetupHouseholdScreen";

export default function HouseholdSetupScreen() {
  const insets = useSafeAreaInsets();

  const {
    theme,
    constants,
    ui,
    wizard,
    form,
    data,
    asyncState,
    refs,
    helpers,
    actions,
  } = useSetupHouseholdScreen();

  const memberItemBackground = `${theme.tint}12`;

  if (ui.initialLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  if (!ui.isEditMode && data.createdMembersForShare.length > 0) {
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

          <Text style={[styles.headerTitle, { color: theme.text }]}>Comptes créés</Text>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Envoyer les accès</Text>
            <Text style={[styles.memberMeta, { color: theme.textSecondary, marginBottom: 10 }]}>
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
                  <View key={memberKey} style={[styles.memberCard, { backgroundColor: theme.card }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.memberName, { color: theme.text }]}>
                        {member.name || "Membre"}
                      </Text>
                      <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                        {member.generated_email || "Email généré"}
                      </Text>
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
            paddingTop: Math.max(insets.top, 12) + ui.householdEditHeaderOffset,
          },
        ]}
      >
        <AppButton
          onPress={actions.goBack}
          style={[styles.headerActionBtn, { borderColor: theme.icon }]}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.tint} />
        </AppButton>

        <Text style={[styles.headerTitle, { color: theme.text }]}>{ui.headerTitle}</Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {!ui.isModuleScope && wizard.isNameStepActive && (
          wizard.shouldUseSetupWizard ? (
            <StepName
              stepIndex={wizard.nameStepIndex}
              totalSteps={wizard.setupFlow.totalSteps}
              footer={(
                <View style={styles.wizardActionsRow}>
                  <AppButton
                    style={[styles.wizardPrimaryBtn, { backgroundColor: theme.tint }]}
                    onPress={wizard.goToNextSetupStep}
                  >
                    <Text style={styles.wizardPrimaryBtnText}>Continuer</Text>
                  </AppButton>
                </View>
              )}
            >
              <View style={styles.section}>
                <View
                  style={[
                    styles.collapsibleSectionCard,
                    { backgroundColor: theme.card, borderColor: theme.icon },
                  ]}
                >
                  <View style={styles.collapsibleSectionHeader}>
                    <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                      Nom du foyer
                    </Text>
                  </View>

                  <View style={styles.collapsibleSectionBody}>
                    <AppTextInput
                      style={[styles.input, styles.inputNoMargin]}
                      value={form.houseName}
                      onChangeText={form.setHouseName}
                      placeholder="Ex: La Tribu"
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>
                </View>
              </View>
            </StepName>
          ) : (
            <View style={styles.section}>
              <View
                style={[
                  styles.collapsibleSectionCard,
                  { backgroundColor: theme.card, borderColor: theme.icon },
                ]}
              >
                <View style={styles.collapsibleSectionHeader}>
                  <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                    Nom du foyer
                  </Text>
                </View>

                <View style={styles.collapsibleSectionBody}>
                  <AppTextInput
                    style={[styles.input, styles.inputNoMargin]}
                    value={form.houseName}
                    onChangeText={form.setHouseName}
                    placeholder="Ex: La Tribu"
                    placeholderTextColor={theme.textSecondary}
                  />
                </View>
              </View>
            </View>
          )
        )}

        {!ui.isModuleScope && wizard.isChildrenStepActive && (
          <>
            {wizard.shouldUseSetupWizard ? (
              <StepChildren
                stepIndex={wizard.childrenStepIndex}
                totalSteps={wizard.setupFlow.totalSteps}
                footer={(
                  <View style={styles.wizardActionsRow}>
                    <AppButton
                      style={[
                        styles.wizardSecondaryBtn,
                        { borderColor: theme.icon, backgroundColor: theme.card },
                      ]}
                      onPress={wizard.goToPreviousSetupStep}
                    >
                      <Text style={[styles.wizardSecondaryBtnText, { color: theme.text }]}>
                        Retour
                      </Text>
                    </AppButton>
                  </View>
                )}
              >
                <></>
              </StepChildren>
            ) : null}

            <View style={styles.section}>
              <View
                style={[
                  styles.collapsibleSectionCard,
                  { backgroundColor: theme.card, borderColor: theme.icon },
                ]}
              >
                <AppButton
                  style={styles.collapsibleSectionHeader}
                  onPress={() => form.setMembersExpanded((prev) => !prev)}
                >
                  <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                    Membres du foyer
                  </Text>
                  <MaterialCommunityIcons
                    name={form.membersExpanded ? "chevron-down" : "chevron-right"}
                    size={24}
                    color={theme.textSecondary}
                  />
                </AppButton>

                {form.membersExpanded ? (
                  <View style={styles.collapsibleSectionBody}>
                    {!ui.isEditMode && (
                      <>
                        <View style={[styles.activeUserCard, { backgroundColor: memberItemBackground }]}>
                          <Text style={[styles.activeUserLabel, { color: theme.textSecondary }]}>
                            Utilisateur actif (Parent)
                          </Text>
                          <Text style={[styles.activeUserName, { color: theme.text }]}>
                            {data.activeUser?.name || "Parent"}
                          </Text>
                          {data.activeUser?.email ? (
                            <Text style={[styles.activeUserEmail, { color: theme.textSecondary }]}>
                              {data.activeUser.email}
                            </Text>
                          ) : null}
                        </View>

                        {data.sortedDraftMembers.length > 0 && (
                          <View style={{ marginTop: 10, marginBottom: 10, gap: 8 }}>
                            {data.sortedDraftMembers.map(({ member, index }) => (
                              <View
                                key={`${member.name}-${index}`}
                                style={[styles.memberCard, { backgroundColor: memberItemBackground }]}
                              >
                                <View style={{ flex: 1 }}>
                                  <View style={styles.memberTitleRow}>
                                    <Text style={[styles.memberName, { color: theme.text }]}>
                                      {member.name}
                                    </Text>

                                    <AppButton
                                      style={[
                                        styles.memberRoleBadge,
                                        member.role === "parent"
                                          ? { borderColor: theme.tint, backgroundColor: `${theme.tint}22` }
                                          : { borderColor: theme.icon, backgroundColor: `${theme.icon}22` },
                                      ]}
                                      onPress={() => actions.toggleDraftMemberRoleAtIndex(index)}
                                    >
                                      <Text
                                        style={[
                                          styles.memberRoleBadgeText,
                                          {
                                            color:
                                              member.role === "parent"
                                                ? theme.tint
                                                : theme.textSecondary,
                                          },
                                        ]}
                                      >
                                        {member.role === "parent" ? "Parent" : "Enfant"}
                                      </Text>
                                    </AppButton>
                                  </View>

                                  {member.email ? (
                                    <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                                      {member.email}
                                    </Text>
                                  ) : null}
                                </View>

                                <AppButton onPress={() => actions.removeMember(index)}>
                                  <MaterialCommunityIcons
                                    name="trash-can-outline"
                                    size={22}
                                    color={theme.textSecondary}
                                  />
                                </AppButton>
                              </View>
                            ))}
                          </View>
                        )}
                      </>
                    )}

                    {ui.isEditMode ? (
                      asyncState.membersLoading ? (
                        <ActivityIndicator size="small" color={theme.tint} />
                      ) : (
                        <View style={{ gap: 8, marginBottom: 12 }}>
                          {data.orderedManagedMembers.map((member) => {
                            const nextRole = data.managedRoleDrafts[member.id] ?? member.role;
                            const isUpdating = asyncState.updatingManagedMemberId === member.id;
                            const isDeleting = asyncState.deletingManagedMemberId === member.id;
                            const shareKey = `managed-${member.id}`;
                            const isSharing = asyncState.sendingMemberKey === shareKey;

                            return (
                              <View
                                key={member.id}
                                style={[styles.memberCard, { backgroundColor: memberItemBackground }]}
                              >
                                <View style={{ flex: 1 }}>
                                  <View style={styles.memberTitleRow}>
                                    <Text style={[styles.memberName, { color: theme.text }]}>
                                      {member.name}
                                    </Text>

                                    <AppButton
                                      style={[
                                        styles.memberRoleBadge,
                                        nextRole === "parent"
                                          ? { borderColor: theme.tint, backgroundColor: `${theme.tint}22` }
                                          : { borderColor: theme.icon, backgroundColor: `${theme.icon}22` },
                                      ]}
                                      onPress={() => actions.confirmManagedMemberRoleToggle(member)}
                                      disabled={!ui.canManageMembers || isUpdating || isDeleting}
                                    >
                                      <Text
                                        style={[
                                          styles.memberRoleBadgeText,
                                          {
                                            color:
                                              nextRole === "parent"
                                                ? theme.tint
                                                : theme.textSecondary,
                                          },
                                        ]}
                                      >
                                        {nextRole === "parent" ? "Parent" : "Enfant"}
                                      </Text>
                                    </AppButton>
                                  </View>

                                  <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                                    {member.email || "E-mail non défini"}
                                  </Text>

                                  <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                                    {member.must_change_password
                                      ? "Mot de passe temporaire à modifier"
                                      : "Accès actif"}
                                  </Text>

                                  {ui.canManageMembers ? (
                                    <View style={styles.memberActionRow}>
                                      <AppButton
                                        onPress={() => actions.onDeleteManagedMember(member)}
                                        style={[
                                          styles.memberActionBtn,
                                          {
                                            backgroundColor: theme.background,
                                            borderColor: theme.icon,
                                            borderWidth: 1,
                                          },
                                        ]}
                                        disabled={isUpdating || isDeleting}
                                      >
                                        <Text style={[styles.memberActionBtnText, { color: theme.text }]}>
                                          {isDeleting ? "Supp..." : "Supprimer"}
                                        </Text>
                                      </AppButton>

                                      {member.must_change_password && (
                                        <AppButton
                                          onPress={() => {
                                            void actions.onShareManagedMemberAccess(member);
                                          }}
                                          style={[
                                            styles.memberActionBtn,
                                            {
                                              backgroundColor: theme.background,
                                              borderColor: theme.tint,
                                              borderWidth: 1,
                                            },
                                          ]}
                                          disabled={isSharing || isUpdating || isDeleting}
                                        >
                                          <Text
                                            style={[styles.memberActionBtnText, { color: theme.tint }]}
                                          >
                                            {isSharing ? "Partage..." : "Partager"}
                                          </Text>
                                        </AppButton>
                                      )}
                                    </View>
                                  ) : null}
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )
                    ) : null}

                    {!ui.isEditMode || ui.canManageMembers ? (
                      <View style={[styles.memberEditor, { backgroundColor: memberItemBackground }]}>
                        <AppTextInput
                          style={[styles.input, styles.inputWithBottomSpacing]}
                          placeholder="Nom du membre"
                          placeholderTextColor={theme.textSecondary}
                          value={form.memberName}
                          onChangeText={form.setMemberName}
                        />

                        <AppTextInput
                          style={[styles.input, styles.inputWithBottomSpacing]}
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
                            style={[
                              styles.roleChip,
                              { borderColor: theme.icon, backgroundColor: theme.background },
                              form.memberRole === "parent" && {
                                borderColor: theme.tint,
                                backgroundColor: `${theme.tint}20`,
                              },
                            ]}
                          >
                            <Text style={[styles.roleChipText, { color: theme.text }]}>Parent</Text>
                          </AppButton>

                          <AppButton
                            onPress={() => form.setMemberRole("enfant")}
                            style={[
                              styles.roleChip,
                              { borderColor: theme.icon, backgroundColor: theme.background },
                              form.memberRole === "enfant" && {
                                borderColor: theme.tint,
                                backgroundColor: `${theme.tint}20`,
                              },
                            ]}
                          >
                            <Text style={[styles.roleChipText, { color: theme.text }]}>Enfant</Text>
                          </AppButton>
                        </View>

                        <AppButton
                          onPress={() => {
                            if (ui.isEditMode) {
                              void actions.onAddManagedMember();
                            } else {
                              actions.addMember();
                            }
                          }}
                          style={[styles.addButton, { backgroundColor: theme.background }]}
                          disabled={ui.isEditMode && asyncState.addingManagedMember}
                        >
                          <MaterialCommunityIcons name="plus" size={20} color={theme.tint} />
                          <Text style={[styles.addButtonText, { color: theme.tint }]}>
                            {ui.isEditMode && asyncState.addingManagedMember
                              ? "Ajout..."
                              : "Ajouter ce membre"}
                          </Text>
                        </AppButton>
                      </View>
                    ) : (
                      <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                        Seul un parent peut gérer les membres du foyer.
                      </Text>
                    )}
                  </View>
                ) : null}
              </View>
            </View>
          </>
        )}

        {!ui.isModuleScope && ui.isEditMode && (
          <View style={styles.section}>
            <View
              style={[
                styles.collapsibleSectionCard,
                { backgroundColor: theme.card, borderColor: theme.icon },
              ]}
            >
              <AppButton
                style={styles.collapsibleSectionHeader}
                onPress={() => form.setConnectedHouseholdExpanded((prev) => !prev)}
              >
                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                  Foyer connecté
                </Text>
                <MaterialCommunityIcons
                  name={form.connectedHouseholdExpanded ? "chevron-down" : "chevron-right"}
                  size={24}
                  color={theme.textSecondary}
                />
              </AppButton>

              {form.connectedHouseholdExpanded ? (
                <View style={styles.collapsibleSectionBody}>
                  {asyncState.connectionLoading ? (
                    <ActivityIndicator size="small" color={theme.tint} />
                  ) : !data.connectionPermissions.can_manage_connection ? (
                    <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                      Seul un parent peut gérer la liaison entre foyers.
                    </Text>
                  ) : data.connectionState.is_connected && data.connectionState.linked_household ? (
                    <View style={[styles.connectedHouseholdCard, { backgroundColor: memberItemBackground }]}>
                      <Text style={[styles.connectedHouseholdLabel, { color: theme.textSecondary }]}>
                        Liaison active
                      </Text>
                      <Text style={[styles.connectedHouseholdName, { color: theme.text }]}>
                        {data.connectionState.linked_household.name}
                      </Text>

                      <AppButton
                        style={[styles.connectedHouseholdDangerBtn, { borderColor: theme.accentWarm }]}
                        onPress={actions.onUnlinkConnectedHousehold}
                        disabled={
                          asyncState.connectionActionLoading === "unlink"
                          || !data.connectionPermissions.can_unlink
                        }
                      >
                        {asyncState.connectionActionLoading === "unlink" ? (
                          <ActivityIndicator size="small" color={theme.accentWarm} />
                        ) : (
                          <Text style={[styles.connectedHouseholdDangerText, { color: theme.accentWarm }]}>
                            Rompre la liaison
                          </Text>
                        )}
                      </AppButton>
                    </View>
                  ) : data.connectionState.pending_request ? (
                    <View style={[styles.connectedHouseholdCard, { backgroundColor: memberItemBackground }]}>
                      <Text style={[styles.connectedHouseholdLabel, { color: theme.textSecondary }]}>
                        Demande en attente
                      </Text>
                      <Text style={[styles.connectedHouseholdName, { color: theme.text }]}>
                        {data.connectionState.pending_request.other_household?.name ?? "Autre foyer"}
                      </Text>
                      <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                        {data.connectionState.pending_request.direction === "incoming"
                          ? "Ce foyer a demandé à se connecter au vôtre. Vérifie les notifications pour accepter ou refuser."
                          : "Votre demande a été envoyée. Vous serez notifié dès qu'une réponse sera donnée."}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.connectedHouseholdCard, { backgroundColor: memberItemBackground }]}>
                      <Text style={[styles.memberMeta, { color: theme.textSecondary, marginBottom: 8 }]}>
                        Aucun foyer n’est connecté pour le moment.
                      </Text>

                      <AppButton
                        style={[styles.connectedHouseholdPrimaryBtn, { backgroundColor: theme.tint }]}
                        onPress={() => {
                          void actions.onShareHouseholdConnectionCode();
                        }}
                        disabled={
                          asyncState.connectionActionLoading === "share"
                          || !data.connectionPermissions.can_generate_code
                        }
                      >
                        {asyncState.connectionActionLoading === "share" ? (
                          <ActivityIndicator size="small" color="white" />
                        ) : (
                          <Text style={styles.connectedHouseholdPrimaryText}>
                            Partager un code de liaison
                          </Text>
                        )}
                      </AppButton>

                      {data.connectionState.active_code?.code ? (
                        <View
                          style={[
                            styles.connectedCodeInfo,
                            { borderColor: theme.icon, backgroundColor: theme.background },
                          ]}
                        >
                          <Text style={[styles.connectedCodeLabel, { color: theme.textSecondary }]}>
                            Code actuel
                          </Text>
                          <Text style={[styles.connectedCodeValue, { color: theme.text }]}>
                            {data.connectionState.active_code.code}
                          </Text>
                          {data.connectionCodeExpiryLabel ? (
                            <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                              Expire le {data.connectionCodeExpiryLabel}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}

                      <Text style={[styles.label, { color: theme.text, marginBottom: 6, marginTop: 12 }]}>
                        Connecter un foyer avec un code
                      </Text>

                      <AppTextInput
                        style={[styles.input, styles.inputWithSmallBottomSpacing]}
                        value={form.connectionCodeInput}
                        onChangeText={(value) =>
                          form.setConnectionCodeInput(value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                        }
                        autoCapitalize="characters"
                        placeholder="Ex: AB12CD34"
                        placeholderTextColor={theme.textSecondary}
                      />

                      <AppButton
                        style={[
                          styles.connectedHouseholdSecondaryBtn,
                          { borderColor: theme.tint, backgroundColor: `${theme.tint}14` },
                        ]}
                        onPress={() => {
                          void actions.onConnectHouseholdWithCode();
                        }}
                        disabled={
                          asyncState.connectionActionLoading === "connect"
                          || !data.connectionPermissions.can_connect_with_code
                        }
                      >
                        {asyncState.connectionActionLoading === "connect" ? (
                          <ActivityIndicator size="small" color={theme.tint} />
                        ) : (
                          <Text style={[styles.connectedHouseholdSecondaryText, { color: theme.tint }]}>
                            Envoyer la demande de liaison
                          </Text>
                        )}
                      </AppButton>
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          </View>
        )}

        {(!wizard.shouldUseSetupWizard || wizard.isModulesStepActive) && (
          <>
            {wizard.shouldUseSetupWizard ? (
              <StepModules
                stepIndex={wizard.modulesStepIndex}
                totalSteps={wizard.setupFlow.totalSteps}
                footer={(
                  <View style={styles.wizardActionsRow}>
                    <AppButton
                      style={[
                        styles.wizardSecondaryBtn,
                        { borderColor: theme.icon, backgroundColor: theme.card },
                      ]}
                      onPress={wizard.goToPreviousSetupStep}
                    >
                      <Text style={[styles.wizardSecondaryBtnText, { color: theme.text }]}>
                        Retour
                      </Text>
                    </AppButton>

                    <AppButton
                      style={[styles.wizardPrimaryBtn, { backgroundColor: theme.tint }]}
                      onPress={wizard.goToNextSetupStep}
                    >
                      <Text style={styles.wizardPrimaryBtnText}>Continuer</Text>
                    </AppButton>
                  </View>
                )}
              >
                <></>
              </StepModules>
            ) : null}

            <View style={styles.section}>
              <View
                style={[
                  styles.collapsibleSectionCard,
                  { backgroundColor: theme.card, borderColor: theme.icon },
                ]}
              >
                <AppButton
                  style={styles.collapsibleSectionHeader}
                  onPress={() => form.setModulesExpanded((prev) => !prev)}
                >
                  <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                    {ui.isMealsScope
                      ? "Repas & courses"
                      : ui.isTasksScope
                        ? "Tâches ménagères"
                        : ui.isBudgetScope
                          ? "Budget"
                          : ui.isCalendarScope
                            ? "Calendrier"
                            : "Configuration des modules"}
                  </Text>

                  <MaterialCommunityIcons
                    name={form.modulesExpanded ? "chevron-down" : "chevron-right"}
                    size={24}
                    color={theme.textSecondary}
                  />
                </AppButton>

                {form.modulesExpanded ? (
                  <View style={styles.collapsibleSectionBody}>
                    {data.visibleModules.map((module) => {
                      const canExpandModulePanel = ui.showScopedModuleDetails || module.id === "meals";

                      return (
                        <View
                          key={module.id}
                          style={[styles.moduleContainer, { backgroundColor: theme.background }]}
                        >
                          <View style={styles.moduleCard}>
                            <View style={[styles.moduleIcon, { backgroundColor: theme.background }]}>
                              <MaterialCommunityIcons
                                name={module.icon as any}
                                size={24}
                                color={theme.tint}
                              />
                            </View>

                            <AppButton
                              style={{ flex: 1 }}
                              onPress={() => {
                                if (!canExpandModulePanel) {
                                  return;
                                }
                                actions.toggleModulePanel(module.id);
                              }}
                              disabled={!canExpandModulePanel}
                            >
                              <Text style={[styles.moduleLabel, { color: theme.text }]}>
                                {module.label}
                              </Text>
                              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                                {module.desc}
                              </Text>
                            </AppButton>

                            <Switch
                              value={!!form.activeModules[module.id]}
                              onValueChange={() => actions.toggleModule(module.id)}
                              trackColor={{ false: theme.icon, true: theme.tint }}
                            />

                            {canExpandModulePanel ? (
                              <AppButton
                                onPress={() => actions.toggleModulePanel(module.id)}
                                style={{ marginLeft: 8, padding: 4 }}
                                disabled={!form.activeModules[module.id]}
                              >
                                <MaterialCommunityIcons
                                  name={form.expandedModules[module.id] ? "chevron-up" : "chevron-down"}
                                  size={22}
                                  color={form.activeModules[module.id] ? theme.text : theme.icon}
                                />
                              </AppButton>
                            ) : (
                              <View style={styles.mealChevronSpacer} />
                            )}
                          </View>

                          {form.activeModules[module.id]
                            && form.expandedModules[module.id]
                            && module.id === "meals" && (
                              <View style={styles.subConfigBox}>
                                <View style={styles.mealFeatureRow}>
                                  <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>
                                    Recettes
                                  </Text>

                                  <View style={styles.mealFeatureControls}>
                                    <Switch
                                      value={form.mealOptions.recipes}
                                      onValueChange={(value) => actions.updateMealOption("recipes", value)}
                                      trackColor={{ false: theme.icon, true: theme.tint }}
                                    />

                                    {ui.showScopedModuleDetails ? (
                                      <AppButton
                                        onPress={() => actions.toggleMealSection("recipes")}
                                        style={{ marginLeft: 8, padding: 4 }}
                                        disabled={!form.mealOptions.recipes}
                                      >
                                        <MaterialCommunityIcons
                                          name={data.mealExpandedSections.recipes ? "chevron-up" : "chevron-down"}
                                          size={20}
                                          color={form.mealOptions.recipes ? theme.text : theme.icon}
                                        />
                                      </AppButton>
                                    ) : (
                                      <View style={styles.mealChevronSpacer} />
                                    )}
                                  </View>
                                </View>

                                {ui.showScopedModuleDetails
                                  && form.mealOptions.recipes
                                  && data.mealExpandedSections.recipes && (
                                    <View style={[styles.mealSectionBox, { backgroundColor: theme.background }]}>
                                      <Text style={[styles.label, { color: theme.text, marginTop: 4 }]}>
                                        Portions par défaut du foyer
                                      </Text>

                                      <AppTextInput
                                        style={[styles.input, styles.inputNoMargin]}
                                        value={form.defaultServings}
                                        onChangeText={form.setDefaultServings}
                                        keyboardType="numeric"
                                        placeholder="4"
                                        placeholderTextColor={theme.textSecondary}
                                      />

                                      <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>
                                        Tags alimentaires
                                      </Text>

                                      <View style={styles.categoryFilterWrap}>
                                        {Object.keys(constants.DIETARY_TYPE_LABELS).map((type) => {
                                          const typedType = type as keyof typeof constants.DIETARY_TYPE_LABELS;
                                          return (
                                            <AppButton
                                              key={typedType}
                                              onPress={() => {
                                                if (form.selectedDietaryTypeFilter === typedType) {
                                                  return;
                                                }
                                                form.setSelectedDietaryTypeFilter(typedType);
                                                form.setDietaryTagSearch("");
                                                void actions.loadDietaryTags(typedType);
                                              }}
                                              style={[
                                                styles.categoryFilterChip,
                                                { borderColor: theme.icon, backgroundColor: theme.background },
                                                form.selectedDietaryTypeFilter === typedType && {
                                                  borderColor: theme.tint,
                                                  backgroundColor: `${theme.tint}20`,
                                                },
                                              ]}
                                            >
                                              <Text
                                                style={{
                                                  color:
                                                    form.selectedDietaryTypeFilter === typedType
                                                      ? theme.tint
                                                      : theme.text,
                                                  fontSize: 12,
                                                  fontWeight: "600",
                                                }}
                                              >
                                                {constants.DIETARY_TYPE_LABELS[typedType]}
                                              </Text>
                                            </AppButton>
                                          );
                                        })}
                                      </View>

                                      {data.selectedTagsForCurrentType.length > 0 && (
                                        <View style={{ marginBottom: 10 }}>
                                          <Text style={[styles.selectedHint, { color: theme.textSecondary }]}>
                                            Sélection dans {constants.DIETARY_TYPE_LABELS[form.selectedDietaryTypeFilter]}:
                                          </Text>
                                          <Text style={[styles.selectedValues, { color: theme.text }]}>
                                            {data.selectedTagsForCurrentType.map((tag) => tag.label).join(", ")}
                                          </Text>
                                        </View>
                                      )}

                                      <AppTextInput
                                        style={[styles.input, styles.inputWithSmallBottomSpacing]}
                                        value={form.dietaryTagSearch}
                                        onChangeText={form.setDietaryTagSearch}
                                        placeholder={`Rechercher un tag (${constants.DIETARY_TYPE_LABELS[form.selectedDietaryTypeFilter]})...`}
                                        placeholderTextColor={theme.textSecondary}
                                        autoCapitalize="none"
                                      />

                                      {asyncState.dietaryTagsLoading ? (
                                        <View style={styles.tagsLoadingRow}>
                                          <ActivityIndicator size="small" color={theme.tint} />
                                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                                            Chargement des tags...
                                          </Text>
                                        </View>
                                      ) : data.filteredDietaryTags.length === 0 ? (
                                        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                                          Aucun tag ne correspond à la recherche.
                                        </Text>
                                      ) : (
                                        <View style={styles.tagsWrap}>
                                          {data.filteredDietaryTags.map((tag) => {
                                            const isSelected = data.selectedMealDietaryTags.includes(tag.key);
                                            return (
                                              <AppButton
                                                key={tag.id}
                                                onPress={() => actions.toggleMealDietaryTag(tag.key)}
                                                style={[
                                                  styles.tagChip,
                                                  { borderColor: theme.icon, backgroundColor: theme.card },
                                                  isSelected && {
                                                    borderColor: theme.tint,
                                                    backgroundColor: `${theme.tint}25`,
                                                  },
                                                ]}
                                              >
                                                <Text
                                                  style={[
                                                    styles.tagChipText,
                                                    { color: theme.text },
                                                    isSelected && { color: theme.tint },
                                                  ]}
                                                >
                                                  {tag.label}
                                                </Text>
                                                <Text style={[styles.tagChipType, { color: theme.textSecondary }]}>
                                                  {constants.DIETARY_TYPE_LABELS[tag.type]}
                                                </Text>
                                              </AppButton>
                                            );
                                          })}
                                        </View>
                                      )}

                                      {data.canSuggestCreateDietaryTag && (
                                        <View
                                          style={[
                                            styles.createTagBox,
                                            { borderColor: theme.icon, backgroundColor: theme.card },
                                          ]}
                                        >
                                          <Text style={[styles.createTagTitle, { color: theme.text }]}>
                                            Ajouter "{form.dietaryTagSearch.trim()}" ?
                                          </Text>
                                          <Text
                                            style={[styles.createTagTypeText, { color: theme.textSecondary }]}
                                          >
                                            Catégorie: {constants.DIETARY_TYPE_LABELS[form.selectedDietaryTypeFilter]}
                                          </Text>

                                          <AppButton
                                            onPress={actions.createDietaryTag}
                                            disabled={asyncState.creatingDietaryTag}
                                            style={[styles.createTagBtn, { backgroundColor: theme.tint }]}
                                          >
                                            {asyncState.creatingDietaryTag ? (
                                              <ActivityIndicator size="small" color="white" />
                                            ) : (
                                              <Text style={styles.createTagBtnText}>Ajouter ce tag</Text>
                                            )}
                                          </AppButton>
                                        </View>
                                      )}
                                    </View>
                                  )}

                                <View style={styles.mealFeatureRow}>
                                  <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>
                                    Sondages
                                  </Text>

                                  <View style={styles.mealFeatureControls}>
                                    <Switch
                                      value={form.mealOptions.polls}
                                      onValueChange={(value) => actions.updateMealOption("polls", value)}
                                      trackColor={{ false: theme.icon, true: theme.tint }}
                                    />

                                    {ui.showScopedModuleDetails ? (
                                      <AppButton
                                        onPress={() => actions.toggleMealSection("polls")}
                                        style={{ marginLeft: 8, padding: 4 }}
                                        disabled={!form.mealOptions.polls}
                                      >
                                        <MaterialCommunityIcons
                                          name={data.mealExpandedSections.polls ? "chevron-up" : "chevron-down"}
                                          size={20}
                                          color={form.mealOptions.polls ? theme.text : theme.icon}
                                        />
                                      </AppButton>
                                    ) : (
                                      <View style={styles.mealChevronSpacer} />
                                    )}
                                  </View>
                                </View>

                                {ui.showScopedModuleDetails
                                  && form.mealOptions.polls
                                  && data.mealExpandedSections.polls && (
                                    <View style={[styles.mealSectionBox, { backgroundColor: theme.background }]}>
                                      <Text style={[styles.label, { color: theme.text, marginTop: 6 }]}>
                                        Jour du sondage
                                      </Text>

                                      <View style={styles.daysContainer}>
                                        {constants.DAYS.map((day) => (
                                          <AppButton
                                            key={day.value}
                                            onPress={() => form.setPollDay(day.value)}
                                            style={[
                                              styles.dayChip,
                                              { backgroundColor: theme.background, borderColor: theme.icon },
                                              form.pollDay === day.value && {
                                                backgroundColor: theme.tint,
                                                borderColor: theme.tint,
                                              },
                                            ]}
                                          >
                                            <Text
                                              style={{
                                                color: form.pollDay === day.value ? "white" : theme.text,
                                                fontSize: 12,
                                              }}
                                            >
                                              {day.label}
                                            </Text>
                                          </AppButton>
                                        ))}
                                      </View>

                                      <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
                                        <View style={{ flex: 1 }}>
                                          <Text style={[styles.label, { color: theme.text }]}>Heure</Text>
                                          <AppTextInput
                                            style={[styles.input, styles.inputCentered, styles.inputNoMargin]}
                                            value={form.pollTime}
                                            onChangeText={form.setPollTime}
                                            placeholder="10:00"
                                            placeholderTextColor={theme.textSecondary}
                                          />
                                        </View>

                                        <View style={{ flex: 1 }}>
                                          <Text style={[styles.label, { color: theme.text }]}>Durée</Text>
                                          <View style={{ flexDirection: "row", gap: 6 }}>
                                            {constants.DURATION_CHOICES.map((value) => (
                                              <AppButton
                                                key={value}
                                                onPress={() => form.setPollDuration(value)}
                                                style={[
                                                  styles.durationBtn,
                                                  { backgroundColor: theme.card },
                                                  form.pollDuration === value && {
                                                    backgroundColor: theme.tint,
                                                  },
                                                ]}
                                              >
                                                <Text
                                                  style={{
                                                    color: form.pollDuration === value ? "white" : theme.text,
                                                  }}
                                                >
                                                  {value}h
                                                </Text>
                                              </AppButton>
                                            ))}
                                          </View>
                                        </View>
                                      </View>

                                      <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>
                                        Max votes par utilisateur
                                      </Text>

                                      <AppTextInput
                                        style={[styles.input, styles.inputNoMargin]}
                                        value={form.maxVotesPerUser}
                                        onChangeText={form.setMaxVotesPerUser}
                                        keyboardType="numeric"
                                        placeholder="3"
                                        placeholderTextColor={theme.textSecondary}
                                      />
                                    </View>
                                  )}

                                <View style={styles.mealFeatureRow}>
                                  <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>
                                    Liste de courses
                                  </Text>
                                  <View style={styles.mealFeatureControls}>
                                    <Switch
                                      value={form.mealOptions.shopping_list}
                                      onValueChange={(value) => actions.updateMealOption("shopping_list", value)}
                                      trackColor={{ false: theme.icon, true: theme.tint }}
                                    />
                                    <View style={styles.mealChevronSpacer} />
                                  </View>
                                </View>
                              </View>
                            )}

                          {ui.showScopedModuleDetails
                            && form.activeModules[module.id]
                            && form.expandedModules[module.id]
                            && module.id === "tasks" && (
                              <View style={styles.subConfigBox}>
                                <View style={styles.switchRow}>
                                  <Text style={[styles.label, { color: theme.text }]}>Rappels actifs</Text>
                                  <Switch
                                    value={form.tasksSettings.reminders_enabled}
                                    onValueChange={(value) =>
                                      form.setTasksSettings((prev) => ({
                                        ...prev,
                                        reminders_enabled: value,
                                      }))
                                    }
                                    trackColor={{ false: theme.icon, true: theme.tint }}
                                  />
                                </View>

                                <View style={styles.switchRow}>
                                  <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>
                                    Garde alternée
                                  </Text>
                                  <Switch
                                    value={form.tasksSettings.alternating_custody_enabled}
                                    onValueChange={(value) =>
                                      form.setTasksSettings((prev) => ({
                                        ...prev,
                                        alternating_custody_enabled: value,
                                      }))
                                    }
                                    trackColor={{ false: theme.icon, true: theme.tint }}
                                  />
                                </View>

                                {form.tasksSettings.alternating_custody_enabled ? (
                                  <>
                                    <Text style={[styles.label, { color: theme.text, marginTop: 6 }]}>
                                      Jour de bascule
                                    </Text>

                                    <View style={styles.daysContainer}>
                                      {constants.DAYS.map((day) => (
                                        <AppButton
                                          key={`custody-day-${day.value}`}
                                          onPress={() =>
                                            form.setTasksSettings((prev) => ({
                                              ...prev,
                                              custody_change_day: day.value,
                                              custody_home_week_start: normalizeCustodyWeekStartDate(
                                                prev.custody_home_week_start,
                                                day.value
                                              ),
                                            }))
                                          }
                                          style={[
                                            styles.dayChip,
                                            { borderColor: theme.icon, backgroundColor: theme.card },
                                            form.tasksSettings.custody_change_day === day.value && {
                                              backgroundColor: theme.tint,
                                              borderColor: theme.tint,
                                            },
                                          ]}
                                        >
                                          <Text
                                            style={{
                                              color:
                                                form.tasksSettings.custody_change_day === day.value
                                                  ? "white"
                                                  : theme.text,
                                              fontSize: 12,
                                            }}
                                          >
                                            {day.label}
                                          </Text>
                                        </AppButton>
                                      ))}
                                    </View>

                                    <Text style={[styles.label, { color: theme.text }]}>
                                      Début d&apos;une semaine à la maison
                                    </Text>

                                    <AppButton
                                      onPress={actions.openCustodyDateWheel}
                                      style={[
                                        styles.pickerFieldBtn,
                                        { borderColor: theme.icon, backgroundColor: theme.background },
                                      ]}
                                    >
                                      <MaterialCommunityIcons
                                        name="calendar-month-outline"
                                        size={16}
                                        color={theme.textSecondary}
                                      />
                                      <Text style={[styles.pickerFieldText, { color: theme.text }]}>
                                        {form.tasksSettings.custody_home_week_start}
                                      </Text>
                                    </AppButton>

                                    {data.custodyDateWheelVisible ? (
                                      <View
                                        style={[
                                          styles.inlineWheelPanel,
                                          { borderColor: theme.icon, backgroundColor: theme.background },
                                        ]}
                                      >
                                        <Text style={[styles.label, { color: theme.text }]}>
                                          Choisir la semaine de référence
                                        </Text>

                                        <View style={styles.wheelRow}>
                                          <View style={styles.wheelColumn}>
                                            <ScrollView
                                              keyboardShouldPersistTaps="handled"
                                              ref={refs.custodyDayWheelRef}
                                              nestedScrollEnabled
                                              showsVerticalScrollIndicator={false}
                                              snapToInterval={WHEEL_ITEM_HEIGHT}
                                              decelerationRate="fast"
                                              scrollEventThrottle={32}
                                              contentContainerStyle={styles.wheelContentContainer}
                                              onScroll={(event) => {
                                                const index = helpers.wheelIndexFromOffset(
                                                  event.nativeEvent.contentOffset.y,
                                                  data.custodyDayOptions.length
                                                );
                                                if (index === refs.custodyDateDayIndexRef.current) {
                                                  return;
                                                }
                                                refs.custodyDateDayIndexRef.current = index;
                                              }}
                                            >
                                              {data.custodyDayOptions.map((value) => (
                                                <View
                                                  key={`custody-wheel-day-${value}`}
                                                  style={styles.wheelItem}
                                                >
                                                  <Text
                                                    style={[
                                                      styles.wheelItemText,
                                                      {
                                                        color:
                                                          data.custodyDateWheelDay === value
                                                            ? theme.text
                                                            : theme.textSecondary,
                                                      },
                                                      data.custodyDateWheelDay === value
                                                        && styles.wheelItemTextSelected,
                                                    ]}
                                                  >
                                                    {`${helpers.weekDayShortLabel(
                                                      data.custodyDateWheelYear,
                                                      data.custodyDateWheelMonth,
                                                      value
                                                    )} ${helpers.pad2(value)}`}
                                                  </Text>
                                                </View>
                                              ))}
                                            </ScrollView>

                                            <View
                                              pointerEvents="none"
                                              style={[
                                                styles.wheelSelectionOverlay,
                                                {
                                                  borderColor: theme.icon,
                                                  backgroundColor: `${theme.tint}14`,
                                                },
                                              ]}
                                            />
                                          </View>

                                          <View style={styles.wheelColumn}>
                                            <ScrollView
                                              keyboardShouldPersistTaps="handled"
                                              ref={refs.custodyMonthWheelRef}
                                              nestedScrollEnabled
                                              showsVerticalScrollIndicator={false}
                                              snapToInterval={WHEEL_ITEM_HEIGHT}
                                              decelerationRate="fast"
                                              scrollEventThrottle={32}
                                              contentContainerStyle={styles.wheelContentContainer}
                                              onScroll={(event) => {
                                                const index = helpers.wheelIndexFromOffset(
                                                  event.nativeEvent.contentOffset.y,
                                                  data.custodyMonthOptions.length
                                                );
                                                if (index === refs.custodyDateMonthIndexRef.current) {
                                                  return;
                                                }
                                                refs.custodyDateMonthIndexRef.current = index;
                                              }}
                                            >
                                              {data.custodyMonthOptions.map((value) => (
                                                <View
                                                  key={`custody-wheel-month-${value}`}
                                                  style={styles.wheelItem}
                                                >
                                                  <Text
                                                    style={[
                                                      styles.wheelItemText,
                                                      {
                                                        color:
                                                          data.custodyDateWheelMonth === value
                                                            ? theme.text
                                                            : theme.textSecondary,
                                                      },
                                                      data.custodyDateWheelMonth === value
                                                        && styles.wheelItemTextSelected,
                                                    ]}
                                                  >
                                                    {constants.MONTH_LABELS[value - 1]}
                                                  </Text>
                                                </View>
                                              ))}
                                            </ScrollView>

                                            <View
                                              pointerEvents="none"
                                              style={[
                                                styles.wheelSelectionOverlay,
                                                {
                                                  borderColor: theme.icon,
                                                  backgroundColor: `${theme.tint}14`,
                                                },
                                              ]}
                                            />
                                          </View>

                                          <View style={styles.wheelColumn}>
                                            <ScrollView
                                              keyboardShouldPersistTaps="handled"
                                              ref={refs.custodyYearWheelRef}
                                              nestedScrollEnabled
                                              showsVerticalScrollIndicator={false}
                                              snapToInterval={WHEEL_ITEM_HEIGHT}
                                              decelerationRate="fast"
                                              scrollEventThrottle={32}
                                              contentContainerStyle={styles.wheelContentContainer}
                                              onScroll={(event) => {
                                                const index = helpers.wheelIndexFromOffset(
                                                  event.nativeEvent.contentOffset.y,
                                                  data.custodyYearOptions.length
                                                );
                                                if (index === refs.custodyDateYearIndexRef.current) {
                                                  return;
                                                }
                                                refs.custodyDateYearIndexRef.current = index;
                                              }}
                                            >
                                              {data.custodyYearOptions.map((value) => (
                                                <View
                                                  key={`custody-wheel-year-${value}`}
                                                  style={styles.wheelItem}
                                                >
                                                  <Text
                                                    style={[
                                                      styles.wheelItemText,
                                                      {
                                                        color:
                                                          data.custodyDateWheelYear === value
                                                            ? theme.text
                                                            : theme.textSecondary,
                                                      },
                                                      data.custodyDateWheelYear === value
                                                        && styles.wheelItemTextSelected,
                                                    ]}
                                                  >
                                                    {value}
                                                  </Text>
                                                </View>
                                              ))}
                                            </ScrollView>

                                            <View
                                              pointerEvents="none"
                                              style={[
                                                styles.wheelSelectionOverlay,
                                                {
                                                  borderColor: theme.icon,
                                                  backgroundColor: `${theme.tint}14`,
                                                },
                                              ]}
                                            />
                                          </View>
                                        </View>
                                      </View>
                                    ) : null}

                                    <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                                      Les tâches récurrentes des enfants seront planifiées une semaine sur deux,
                                      à partir de cette semaine.
                                    </Text>
                                  </>
                                ) : (
                                  <Text
                                    style={[
                                      styles.memberMeta,
                                      { color: theme.textSecondary, marginTop: 4 },
                                    ]}
                                  >
                                    Active la garde alternée pour limiter les routines enfants aux semaines
                                    à la maison.
                                  </Text>
                                )}
                              </View>
                            )}

                          {ui.showScopedModuleDetails
                            && form.activeModules[module.id]
                            && form.expandedModules[module.id]
                            && module.id === "calendar" && (
                              <View style={styles.subConfigBox}>
                                <View style={styles.switchRow}>
                                  <Text style={[styles.label, { color: theme.text }]}>Vue partagée</Text>
                                  <Switch
                                    value={form.calendarSettings.shared_view_enabled}
                                    onValueChange={(value) =>
                                      form.setCalendarSettings((prev) => ({
                                        ...prev,
                                        shared_view_enabled: value,
                                      }))
                                    }
                                    trackColor={{ false: theme.icon, true: theme.tint }}
                                  />
                                </View>

                                <View style={styles.switchRow}>
                                  <Text style={[styles.label, { color: theme.text }]}>
                                    Suivi des absences
                                  </Text>
                                  <Switch
                                    value={form.calendarSettings.absence_tracking_enabled}
                                    onValueChange={(value) =>
                                      form.setCalendarSettings((prev) => ({
                                        ...prev,
                                        absence_tracking_enabled: value,
                                      }))
                                    }
                                    trackColor={{ false: theme.icon, true: theme.tint }}
                                  />
                                </View>
                              </View>
                            )}

                          {ui.showScopedModuleDetails
                            && form.activeModules[module.id]
                            && form.expandedModules[module.id]
                            && module.id === "budget" && (
                              <View style={styles.subConfigBox}>
                                {ui.isEditMode ? (
                                  <>
                                    <Text style={[styles.label, { color: theme.text }]}>
                                      Paramètres par enfant
                                    </Text>
                                    <Text
                                      style={[
                                        styles.memberMeta,
                                        { color: theme.textSecondary, marginBottom: 8 },
                                      ]}
                                    >
                                      Définis ici le montant de base, la récurrence, le jour de
                                      réinitialisation et les règles d&apos;avance.
                                    </Text>

                                    {asyncState.budgetSettingsLoading ? (
                                      <ActivityIndicator size="small" color={theme.tint} />
                                    ) : asyncState.budgetSettingsError ? (
                                      <Text style={[styles.memberMeta, { color: theme.accentWarm }]}>
                                        {asyncState.budgetSettingsError}
                                      </Text>
                                    ) : data.budgetChildDrafts.length === 0 ? (
                                      <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                                        Aucun enfant trouvé pour ce foyer.
                                      </Text>
                                    ) : (
                                      <View style={{ gap: 10 }}>
                                        {data.budgetChildDrafts.map((draft) => (
                                          <View
                                            key={`budget-child-${draft.childId}`}
                                            style={[
                                              styles.budgetChildCard,
                                              { backgroundColor: theme.background, borderColor: theme.icon },
                                            ]}
                                          >
                                            <Text style={[styles.memberName, { color: theme.text }]}>
                                              {draft.childName}
                                            </Text>

                                            <Text style={[styles.label, { color: theme.text, marginBottom: 4 }]}>
                                              Montant de base
                                            </Text>
                                            <AppTextInput
                                              style={styles.budgetCompactInput}
                                              keyboardType="decimal-pad"
                                              value={draft.baseAmountInput}
                                              onChangeText={(value) =>
                                                actions.updateBudgetChildDraft(draft.childId, {
                                                  baseAmountInput: value,
                                                })
                                              }
                                              placeholder="Ex: 12,00"
                                              placeholderTextColor={theme.textSecondary}
                                            />

                                            <Text style={[styles.label, { color: theme.text, marginBottom: 4 }]}>
                                              Récurrence
                                            </Text>
                                            <View style={styles.budgetRecurrenceRow}>
                                              <AppButton
                                                onPress={() =>
                                                  actions.updateBudgetChildDraft(draft.childId, {
                                                    recurrence: "weekly",
                                                  })
                                                }
                                                style={[
                                                  styles.budgetChoiceBtn,
                                                  draft.recurrence === "weekly"
                                                    ? { backgroundColor: theme.tint, borderColor: theme.tint }
                                                    : {
                                                        borderColor: theme.icon,
                                                        backgroundColor: theme.card,
                                                      },
                                                ]}
                                              >
                                                <Text
                                                  style={[
                                                    styles.budgetChoiceText,
                                                    {
                                                      color:
                                                        draft.recurrence === "weekly"
                                                          ? "#FFFFFF"
                                                          : theme.text,
                                                    },
                                                  ]}
                                                >
                                                  Hebdomadaire
                                                </Text>
                                              </AppButton>

                                              <AppButton
                                                onPress={() =>
                                                  actions.updateBudgetChildDraft(draft.childId, {
                                                    recurrence: "monthly",
                                                  })
                                                }
                                                style={[
                                                  styles.budgetChoiceBtn,
                                                  draft.recurrence === "monthly"
                                                    ? { backgroundColor: theme.tint, borderColor: theme.tint }
                                                    : {
                                                        borderColor: theme.icon,
                                                        backgroundColor: theme.card,
                                                      },
                                                ]}
                                              >
                                                <Text
                                                  style={[
                                                    styles.budgetChoiceText,
                                                    {
                                                      color:
                                                        draft.recurrence === "monthly"
                                                          ? "#FFFFFF"
                                                          : theme.text,
                                                    },
                                                  ]}
                                                >
                                                  Mensuelle
                                                </Text>
                                              </AppButton>
                                            </View>

                                            <Text style={[styles.label, { color: theme.text, marginBottom: 4 }]}>
                                              {draft.recurrence === "weekly"
                                                ? "Jour de réinitialisation (1 à 7)"
                                                : "Jour de réinitialisation (1 à 31)"}
                                            </Text>

                                            <AppTextInput
                                              style={styles.budgetCompactInput}
                                              keyboardType="number-pad"
                                              value={draft.resetDayInput}
                                              onChangeText={(value) =>
                                                actions.updateBudgetChildDraft(draft.childId, {
                                                  resetDayInput: value,
                                                })
                                              }
                                              placeholder={draft.recurrence === "weekly" ? "1 à 7" : "1 à 31"}
                                              placeholderTextColor={theme.textSecondary}
                                            />

                                            <View style={styles.switchRow}>
                                              <Text
                                                style={[
                                                  styles.label,
                                                  { color: theme.text, marginBottom: 0 },
                                                ]}
                                              >
                                                Autoriser les avances
                                              </Text>
                                              <Switch
                                                value={draft.allowAdvances}
                                                onValueChange={(value) =>
                                                  actions.updateBudgetChildDraft(draft.childId, {
                                                    allowAdvances: value,
                                                  })
                                                }
                                                trackColor={{ false: theme.icon, true: theme.tint }}
                                              />
                                            </View>

                                            <Text style={[styles.label, { color: theme.text, marginBottom: 4 }]}>
                                              Plafond d&apos;avance
                                            </Text>

                                            <AppTextInput
                                              style={[
                                                styles.budgetCompactInput,
                                                !draft.allowAdvances && styles.inputDisabled,
                                              ]}
                                              keyboardType="decimal-pad"
                                              value={draft.maxAdvanceInput}
                                              editable={draft.allowAdvances}
                                              onChangeText={(value) =>
                                                actions.updateBudgetChildDraft(draft.childId, {
                                                  maxAdvanceInput: value,
                                                })
                                              }
                                              placeholder="Ex: 15,00"
                                              placeholderTextColor={theme.textSecondary}
                                            />

                                            <AppButton
                                              onPress={() => {
                                                void actions.saveBudgetChildDraft(draft);
                                              }}
                                              style={[
                                                styles.budgetSaveBtn,
                                                {
                                                  backgroundColor: theme.tint,
                                                  opacity:
                                                    asyncState.savingBudgetChildId === draft.childId ? 0.8 : 1,
                                                },
                                              ]}
                                              disabled={asyncState.savingBudgetChildId === draft.childId}
                                            >
                                              {asyncState.savingBudgetChildId === draft.childId ? (
                                                <ActivityIndicator size="small" color="white" />
                                              ) : (
                                                <Text style={styles.budgetSaveBtnText}>
                                                  Enregistrer pour {draft.childName}
                                                </Text>
                                              )}
                                            </AppButton>
                                          </View>
                                        ))}
                                      </View>
                                    )}
                                  </>
                                ) : (
                                  <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
                                    Les paramètres détaillés par enfant seront disponibles dès que le
                                    foyer sera créé.
                                  </Text>
                                )}
                              </View>
                            )}
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </View>
          </>
        )}

        {(!wizard.shouldUseSetupWizard || wizard.isChildrenStepActive) && (
          <AppButton
            style={[styles.submitButton, { backgroundColor: theme.tint, opacity: ui.loading ? 0.7 : 1 }]}
            onPress={actions.handleSave}
            disabled={ui.loading}
          >
            {ui.loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.submitButtonText}>
                {ui.isEditMode ? "Enregistrer la configuration" : "Créer le foyer"}
              </Text>
            )}
          </AppButton>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  lockCard: { width: "100%", borderRadius: 16, padding: 20, alignItems: "center" },
  lockTitle: { fontSize: 20, fontWeight: "700", marginTop: 10 },
  lockText: { fontSize: 14, marginTop: 6 },
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
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  input: { height: 50, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, marginBottom: 16 },
  inputNoMargin: { marginBottom: 0 },
  inputWithBottomSpacing: { marginBottom: 12 },
  inputWithSmallBottomSpacing: { marginBottom: 10 },
  inputCentered: { textAlign: "center" },
  inputDisabled: { opacity: 0.65 },
  pickerFieldBtn: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pickerFieldText: {
    fontSize: 14,
    fontWeight: "600",
  },
  inlineWheelPanel: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  wheelRow: {
    flexDirection: "row",
    gap: 8,
  },
  wheelColumn: {
    flex: 1,
    height: WHEEL_CONTAINER_HEIGHT,
    position: "relative",
  },
  wheelContentContainer: {
    paddingVertical: WHEEL_VERTICAL_PADDING,
  },
  wheelItem: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  wheelItemText: {
    fontSize: 16,
    fontWeight: "500",
  },
  wheelItemTextSelected: {
    fontWeight: "700",
  },
  wheelSelectionOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: WHEEL_VERTICAL_PADDING,
    height: WHEEL_ITEM_HEIGHT,
    borderWidth: 1,
    borderRadius: 10,
  },

  activeUserCard: {
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  activeUserLabel: { fontSize: 11, fontWeight: "600" },
  activeUserName: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  activeUserEmail: { fontSize: 11, marginTop: 1 },
  collapsibleSectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  collapsibleSectionHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  collapsibleSectionBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 10,
  },
  memberActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  memberActionBtn: {
    minHeight: 30,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  memberActionBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },

  memberEditor: { borderRadius: 12, padding: 10 },
  roleRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  roleChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  roleChipText: { fontSize: 12, fontWeight: "600" },

  tagsLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  categoryFilterWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  categoryFilterChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  selectedHint: {
    fontSize: 12,
  },
  selectedValues: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 120,
  },
  tagChipText: {
    fontSize: 13,
    fontWeight: "700",
  },
  tagChipType: {
    fontSize: 11,
    marginTop: 2,
  },
  createTagBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
  },
  createTagTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
  },
  createTagTypeText: {
    fontSize: 12,
    marginBottom: 10,
  },
  createTagBtn: {
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  createTagBtnText: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },

  addButton: {
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  addButtonText: { fontSize: 14, fontWeight: "700" },
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

  memberCard: {
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  memberTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  memberRoleBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  memberRoleBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  memberName: { fontSize: 14, fontWeight: "700" },
  memberMeta: { fontSize: 11, marginTop: 2 },
  connectedHouseholdCard: {
    borderRadius: 12,
    padding: 10,
  },
  connectedHouseholdLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  connectedHouseholdName: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  connectedHouseholdPrimaryBtn: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  connectedHouseholdPrimaryText: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },
  connectedHouseholdSecondaryBtn: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  connectedHouseholdSecondaryText: {
    fontSize: 14,
    fontWeight: "700",
  },
  connectedHouseholdDangerBtn: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    alignSelf: "flex-start",
  },
  connectedHouseholdDangerText: {
    fontSize: 13,
    fontWeight: "700",
  },
  connectedCodeInfo: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  connectedCodeLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 2,
  },
  connectedCodeValue: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 4,
  },

  moduleContainer: {
    borderRadius: 12,
    marginBottom: 10,
    overflow: "hidden",
  },
  moduleCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  moduleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  moduleLabel: { fontSize: 15, fontWeight: "600" },

  subConfigBox: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 2,
  },
  budgetChildCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
  },
  budgetCompactInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 6,
    fontSize: 14,
  },
  budgetRecurrenceRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
  },
  budgetChoiceBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  budgetChoiceText: {
    fontSize: 12,
    fontWeight: "700",
  },
  budgetSaveBtn: {
    minHeight: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  budgetSaveBtnText: {
    color: "white",
    fontSize: 13,
    fontWeight: "700",
  },
  mealFeatureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  mealFeatureControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  mealChevronSpacer: {
    width: 28,
    marginLeft: 8,
  },
  mealSectionBox: {
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  daysContainer: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  dayChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  durationBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  wizardActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  wizardPrimaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  wizardPrimaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  wizardSecondaryBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  wizardSecondaryBtnText: {
    fontSize: 15,
    fontWeight: "600",
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