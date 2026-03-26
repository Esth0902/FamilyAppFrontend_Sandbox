import React from "react";
import { View, Text, StyleSheet, Switch, ScrollView, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AppButton } from "@/src/components/ui/AppButton";
import { AppTextInput } from "@/src/components/ui/AppTextInput";
import { StepModules } from "@/src/features/household-setup/components/StepModules";
import { WHEEL_CONTAINER_HEIGHT, WHEEL_ITEM_HEIGHT, WHEEL_VERTICAL_PADDING } from "@/src/features/household-setup/utils/householdSetup.constants";
import { normalizeCustodyWeekStartDate } from "@/src/features/household-setup/utils/householdSetup.helpers";

export function HouseholdModulesSection(state: any) {
  const { theme, constants, ui, wizard, form, data, asyncState, refs, helpers, actions } = state;

  if (wizard.shouldUseSetupWizard && !wizard.isModulesStepActive) return null;

  const renderContent = () => (
    <View style={styles.section}>
      <View style={[styles.collapsibleSectionCard, { backgroundColor: theme.card, borderColor: theme.icon }]}>
        <AppButton style={styles.collapsibleSectionHeader} onPress={() => form.setModulesExpanded((prev: boolean) => !prev)}>
          <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
            {ui.isMealsScope ? "Repas & courses" : ui.isTasksScope ? "Tâches ménagères" : ui.isBudgetScope ? "Budget" : ui.isCalendarScope ? "Calendrier" : "Configuration des modules"}
          </Text>
          <MaterialCommunityIcons name={form.modulesExpanded ? "chevron-down" : "chevron-right"} size={24} color={theme.textSecondary} />
        </AppButton>

        {form.modulesExpanded && (
          <View style={styles.collapsibleSectionBody}>
            {data.visibleModules.map((module: any) => {
              const canExpandModulePanel = ui.showScopedModuleDetails || module.id === "meals";

              return (
                <View key={module.id} style={[styles.moduleContainer, { backgroundColor: theme.background }]}>
                  <View style={styles.moduleCard}>
                    <View style={[styles.moduleIcon, { backgroundColor: theme.background }]}>
                      <MaterialCommunityIcons name={module.icon as any} size={24} color={theme.tint} />
                    </View>

                    <AppButton
                      style={{ flex: 1 }}
                      onPress={() => {
                        if (!canExpandModulePanel) return;
                        actions.toggleModulePanel(module.id);
                      }}
                      disabled={!canExpandModulePanel}
                    >
                      <Text style={[styles.moduleLabel, { color: theme.text }]}>{module.label}</Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{module.desc}</Text>
                    </AppButton>

                    <Switch
                      value={!!form.activeModules[module.id]}
                      onValueChange={() => actions.toggleModule(module.id)}
                      trackColor={{ false: theme.icon, true: theme.tint }}
                    />

                    {canExpandModulePanel ? (
                      <AppButton onPress={() => actions.toggleModulePanel(module.id)} style={{ marginLeft: 8, padding: 4 }} disabled={!form.activeModules[module.id]}>
                        <MaterialCommunityIcons name={form.expandedModules[module.id] ? "chevron-up" : "chevron-down"} size={22} color={form.activeModules[module.id] ? theme.text : theme.icon} />
                      </AppButton>
                    ) : (
                      <View style={styles.mealChevronSpacer} />
                    )}
                  </View>

                  {/* CONFIG REPAS */}
                  {form.activeModules[module.id] && form.expandedModules[module.id] && module.id === "meals" && (
                    <View style={styles.subConfigBox}>
                      <View style={styles.mealFeatureRow}>
                        <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Recettes</Text>
                        <View style={styles.mealFeatureControls}>
                          <Switch value={form.mealOptions.recipes} onValueChange={(value) => actions.updateMealOption("recipes", value)} trackColor={{ false: theme.icon, true: theme.tint }} />
                          {ui.showScopedModuleDetails ? (
                            <AppButton onPress={() => actions.toggleMealSection("recipes")} style={{ marginLeft: 8, padding: 4 }} disabled={!form.mealOptions.recipes}>
                              <MaterialCommunityIcons name={data.mealExpandedSections.recipes ? "chevron-up" : "chevron-down"} size={20} color={form.mealOptions.recipes ? theme.text : theme.icon} />
                            </AppButton>
                          ) : <View style={styles.mealChevronSpacer} />}
                        </View>
                      </View>

                      {ui.showScopedModuleDetails && form.mealOptions.recipes && data.mealExpandedSections.recipes && (
                        <View style={[styles.mealSectionBox, { backgroundColor: theme.background }]}>
                          <Text style={[styles.label, { color: theme.text, marginTop: 4 }]}>Portions par défaut du foyer</Text>
                          <AppTextInput style={[styles.input, styles.inputNoMargin]} value={form.defaultServings} onChangeText={form.setDefaultServings} keyboardType="numeric" placeholder="4" placeholderTextColor={theme.textSecondary} />

                          <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>Tags alimentaires</Text>
                          <View style={styles.categoryFilterWrap}>
                            {Object.keys(constants.DIETARY_TYPE_LABELS).map((type) => {
                              const typedType = type as keyof typeof constants.DIETARY_TYPE_LABELS;
                              return (
                                <AppButton
                                  key={String(typedType)}
                                  onPress={() => {
                                    if (form.selectedDietaryTypeFilter === typedType) return;
                                    form.setSelectedDietaryTypeFilter(typedType);
                                    form.setDietaryTagSearch("");
                                    void actions.loadDietaryTags(typedType);
                                  }}
                                  style={[styles.categoryFilterChip, { borderColor: theme.icon, backgroundColor: theme.background }, form.selectedDietaryTypeFilter === typedType && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` }]}
                                >
                                  <Text style={{ color: form.selectedDietaryTypeFilter === typedType ? theme.tint : theme.text, fontSize: 12, fontWeight: "600" }}>{constants.DIETARY_TYPE_LABELS[typedType]}</Text>
                                </AppButton>
                              );
                            })}
                          </View>

                          {data.selectedTagsForCurrentType.length > 0 && (
                            <View style={{ marginBottom: 10 }}>
                              <Text style={[styles.selectedHint, { color: theme.textSecondary }]}>Sélection :</Text>
                              <Text style={[styles.selectedValues, { color: theme.text }]}>{data.selectedTagsForCurrentType.map((tag: any) => tag.label).join(", ")}</Text>
                            </View>
                          )}

                          <AppTextInput
                            style={[styles.input, styles.inputWithSmallBottomSpacing]}
                            value={form.dietaryTagSearch}
                            onChangeText={form.setDietaryTagSearch}
                            placeholder="Rechercher un tag..."
                            placeholderTextColor={theme.textSecondary}
                            autoCapitalize="none"
                          />

                          {asyncState.dietaryTagsLoading ? (
                            <View style={styles.tagsLoadingRow}><ActivityIndicator size="small" color={theme.tint} /><Text style={{ color: theme.textSecondary, fontSize: 12 }}>Chargement...</Text></View>
                          ) : data.filteredDietaryTags.length === 0 ? (
                            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Aucun tag ne correspond.</Text>
                          ) : (
                            <View style={styles.tagsWrap}>
                              {data.filteredDietaryTags.map((tag: any) => {
                                const isSelected = data.selectedMealDietaryTags.includes(tag.key);
                                return (
                                  <AppButton key={tag.id} onPress={() => actions.toggleMealDietaryTag(tag.key)} style={[styles.tagChip, { borderColor: theme.icon, backgroundColor: theme.card }, isSelected && { borderColor: theme.tint, backgroundColor: `${theme.tint}25` }]}>
                                    <Text style={[styles.tagChipText, { color: theme.text }, isSelected && { color: theme.tint }]}>{tag.label}</Text>
                                    <Text style={[styles.tagChipType, { color: theme.textSecondary }]}>{constants.DIETARY_TYPE_LABELS[tag.type]}</Text>
                                  </AppButton>
                                );
                              })}
                            </View>
                          )}

                          {data.canSuggestCreateDietaryTag && (
                            <View style={[styles.createTagBox, { borderColor: theme.icon, backgroundColor: theme.card }]}>
                              <Text style={[styles.createTagTitle, { color: theme.text }]}>
                                Ajouter &quot;{form.dietaryTagSearch.trim()}&quot; ?
                              </Text>
                              <AppButton onPress={actions.createDietaryTag} disabled={asyncState.creatingDietaryTag} style={[styles.createTagBtn, { backgroundColor: theme.tint }]}>
                                {asyncState.creatingDietaryTag ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.createTagBtnText}>Ajouter ce tag</Text>}
                              </AppButton>
                            </View>
                          )}
                        </View>
                      )}

                      {/* SONDAGES */}
                      <View style={styles.mealFeatureRow}>
                        <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Sondages</Text>
                        <View style={styles.mealFeatureControls}>
                          <Switch value={form.mealOptions.polls} onValueChange={(value) => actions.updateMealOption("polls", value)} trackColor={{ false: theme.icon, true: theme.tint }} />
                          {ui.showScopedModuleDetails ? (
                            <AppButton onPress={() => actions.toggleMealSection("polls")} style={{ marginLeft: 8, padding: 4 }} disabled={!form.mealOptions.polls}>
                              <MaterialCommunityIcons name={data.mealExpandedSections.polls ? "chevron-up" : "chevron-down"} size={20} color={form.mealOptions.polls ? theme.text : theme.icon} />
                            </AppButton>
                          ) : <View style={styles.mealChevronSpacer} />}
                        </View>
                      </View>

                      {ui.showScopedModuleDetails && form.mealOptions.polls && data.mealExpandedSections.polls && (
                        <View style={[styles.mealSectionBox, { backgroundColor: theme.background }]}>
                          <Text style={[styles.label, { color: theme.text, marginTop: 6 }]}>Jour du sondage</Text>
                          <View style={styles.daysContainer}>
                            {constants.DAYS.map((day: any) => (
                              <AppButton key={day.value} onPress={() => form.setPollDay(day.value)} style={[styles.dayChip, { backgroundColor: theme.background, borderColor: theme.icon }, form.pollDay === day.value && { backgroundColor: theme.tint, borderColor: theme.tint }]}>
                                <Text style={{ color: form.pollDay === day.value ? "white" : theme.text, fontSize: 12 }}>{day.label}</Text>
                              </AppButton>
                            ))}
                          </View>

                          <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.label, { color: theme.text }]}>Heure</Text>
                              <AppTextInput style={[styles.input, styles.inputCentered, styles.inputNoMargin]} value={form.pollTime} onChangeText={form.setPollTime} placeholder="10:00" placeholderTextColor={theme.textSecondary} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.label, { color: theme.text }]}>Durée</Text>
                              <View style={{ flexDirection: "row", gap: 6 }}>
                                {constants.DURATION_CHOICES.map((value: any) => (
                                  <AppButton key={value} onPress={() => form.setPollDuration(value)} style={[styles.durationBtn, { backgroundColor: theme.card }, form.pollDuration === value && { backgroundColor: theme.tint }]}>
                                    <Text style={{ color: form.pollDuration === value ? "white" : theme.text }}>{value}h</Text>
                                  </AppButton>
                                ))}
                              </View>
                            </View>
                          </View>
                          <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>Max votes par utilisateur</Text>
                          <AppTextInput style={[styles.input, styles.inputNoMargin]} value={form.maxVotesPerUser} onChangeText={form.setMaxVotesPerUser} keyboardType="numeric" placeholder="3" placeholderTextColor={theme.textSecondary} />
                        </View>
                      )}

                      {/* LISTE DE COURSES */}
                      <View style={styles.mealFeatureRow}>
                        <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Liste de courses</Text>
                        <View style={styles.mealFeatureControls}>
                          <Switch value={form.mealOptions.shopping_list} onValueChange={(value) => actions.updateMealOption("shopping_list", value)} trackColor={{ false: theme.icon, true: theme.tint }} />
                          <View style={styles.mealChevronSpacer} />
                        </View>
                      </View>
                    </View>
                  )}

                  {/* CONFIG TÂCHES */}
                  {ui.showScopedModuleDetails && form.activeModules[module.id] && form.expandedModules[module.id] && module.id === "tasks" && (
                    <View style={styles.subConfigBox}>
                      <View style={styles.switchRow}>
                        <Text style={[styles.label, { color: theme.text }]}>Rappels actifs</Text>
                        <Switch value={form.tasksSettings.reminders_enabled} onValueChange={(value) => form.setTasksSettings((prev: any) => ({ ...prev, reminders_enabled: value }))} trackColor={{ false: theme.icon, true: theme.tint }} />
                      </View>

                      <View style={styles.switchRow}>
                        <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Garde alternée</Text>
                        <Switch value={form.tasksSettings.alternating_custody_enabled} onValueChange={(value) => form.setTasksSettings((prev: any) => ({ ...prev, alternating_custody_enabled: value }))} trackColor={{ false: theme.icon, true: theme.tint }} />
                      </View>

                      {form.tasksSettings.alternating_custody_enabled ? (
                        <>
                          <Text style={[styles.label, { color: theme.text, marginTop: 6 }]}>Jour de bascule</Text>
                          <View style={styles.daysContainer}>
                            {constants.DAYS.map((day: any) => (
                              <AppButton key={`custody-day-${day.value}`} onPress={() => form.setTasksSettings((prev: any) => ({ ...prev, custody_change_day: day.value, custody_home_week_start: normalizeCustodyWeekStartDate(prev.custody_home_week_start, day.value) }))} style={[styles.dayChip, { borderColor: theme.icon, backgroundColor: theme.card }, form.tasksSettings.custody_change_day === day.value && { backgroundColor: theme.tint, borderColor: theme.tint }]}>
                                <Text style={{ color: form.tasksSettings.custody_change_day === day.value ? "white" : theme.text, fontSize: 12 }}>{day.label}</Text>
                              </AppButton>
                            ))}
                          </View>

                          <Text style={[styles.label, { color: theme.text }]}>Début d&apos;une semaine à la maison</Text>
                          <AppButton onPress={actions.openCustodyDateWheel} style={[styles.pickerFieldBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                            <MaterialCommunityIcons name="calendar-month-outline" size={16} color={theme.textSecondary} />
                            <Text style={[styles.pickerFieldText, { color: theme.text }]}>{form.tasksSettings.custody_home_week_start}</Text>
                          </AppButton>

                          {data.custodyDateWheelVisible && (
                            <View style={[styles.inlineWheelPanel, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                              <Text style={[styles.label, { color: theme.text }]}>Choisir la semaine de référence</Text>
                              <View style={styles.wheelRow}>
                                <View style={styles.wheelColumn}>
                                  <ScrollView ref={refs.custodyDayWheelRef} nestedScrollEnabled showsVerticalScrollIndicator={false} snapToInterval={WHEEL_ITEM_HEIGHT} decelerationRate="fast" contentContainerStyle={styles.wheelContentContainer} onScroll={(event) => { const index = helpers.wheelIndexFromOffset(event.nativeEvent.contentOffset.y, data.custodyDayOptions.length); if (index !== refs.custodyDateDayIndexRef.current) { refs.custodyDateDayIndexRef.current = index; } }}>
                                    {data.custodyDayOptions.map((value: any) => (
                                      <View key={`custody-wheel-day-${value}`} style={styles.wheelItem}>
                                        <Text style={[styles.wheelItemText, { color: data.custodyDateWheelDay === value ? theme.text : theme.textSecondary }, data.custodyDateWheelDay === value && styles.wheelItemTextSelected]}>{`${helpers.weekDayShortLabel(data.custodyDateWheelYear, data.custodyDateWheelMonth, value)} ${helpers.pad2(value)}`}</Text>
                                      </View>
                                    ))}
                                  </ScrollView>
                                  <View pointerEvents="none" style={[styles.wheelSelectionOverlay, { borderColor: theme.icon, backgroundColor: `${theme.tint}14` }]} />
                                </View>
                                <View style={styles.wheelColumn}>
                                  <ScrollView ref={refs.custodyMonthWheelRef} nestedScrollEnabled showsVerticalScrollIndicator={false} snapToInterval={WHEEL_ITEM_HEIGHT} decelerationRate="fast" contentContainerStyle={styles.wheelContentContainer} onScroll={(event) => { const index = helpers.wheelIndexFromOffset(event.nativeEvent.contentOffset.y, data.custodyMonthOptions.length); if (index !== refs.custodyDateMonthIndexRef.current) { refs.custodyDateMonthIndexRef.current = index; } }}>
                                    {data.custodyMonthOptions.map((value: any) => (
                                      <View key={`custody-wheel-month-${value}`} style={styles.wheelItem}>
                                        <Text style={[styles.wheelItemText, { color: data.custodyDateWheelMonth === value ? theme.text : theme.textSecondary }, data.custodyDateWheelMonth === value && styles.wheelItemTextSelected]}>{constants.MONTH_LABELS[value - 1]}</Text>
                                      </View>
                                    ))}
                                  </ScrollView>
                                  <View pointerEvents="none" style={[styles.wheelSelectionOverlay, { borderColor: theme.icon, backgroundColor: `${theme.tint}14` }]} />
                                </View>
                                <View style={styles.wheelColumn}>
                                  <ScrollView ref={refs.custodyYearWheelRef} nestedScrollEnabled showsVerticalScrollIndicator={false} snapToInterval={WHEEL_ITEM_HEIGHT} decelerationRate="fast" contentContainerStyle={styles.wheelContentContainer} onScroll={(event) => { const index = helpers.wheelIndexFromOffset(event.nativeEvent.contentOffset.y, data.custodyYearOptions.length); if (index !== refs.custodyDateYearIndexRef.current) { refs.custodyDateYearIndexRef.current = index; } }}>
                                    {data.custodyYearOptions.map((value: any) => (
                                      <View key={`custody-wheel-year-${value}`} style={styles.wheelItem}>
                                        <Text style={[styles.wheelItemText, { color: data.custodyDateWheelYear === value ? theme.text : theme.textSecondary }, data.custodyDateWheelYear === value && styles.wheelItemTextSelected]}>{value}</Text>
                                      </View>
                                    ))}
                                  </ScrollView>
                                  <View pointerEvents="none" style={[styles.wheelSelectionOverlay, { borderColor: theme.icon, backgroundColor: `${theme.tint}14` }]} />
                                </View>
                              </View>
                            </View>
                          )}
                          <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>Les tâches récurrentes des enfants seront planifiées une semaine sur deux, à partir de cette semaine.</Text>
                        </>
                      ) : (
                        <Text style={[styles.memberMeta, { color: theme.textSecondary, marginTop: 4 }]}>Active la garde alternée pour limiter les routines enfants aux semaines à la maison.</Text>
                      )}
                    </View>
                  )}

                  {/* CONFIG CALENDRIER */}
                  {ui.showScopedModuleDetails && form.activeModules[module.id] && form.expandedModules[module.id] && module.id === "calendar" && (
                    <View style={styles.subConfigBox}>
                      <View style={styles.switchRow}>
                        <Text style={[styles.label, { color: theme.text }]}>Vue partagée</Text>
                        <Switch value={form.calendarSettings.shared_view_enabled} onValueChange={(value) => form.setCalendarSettings((prev: any) => ({ ...prev, shared_view_enabled: value }))} trackColor={{ false: theme.icon, true: theme.tint }} />
                      </View>
                      <View style={styles.switchRow}>
                        <Text style={[styles.label, { color: theme.text }]}>Suivi des absences</Text>
                        <Switch value={form.calendarSettings.absence_tracking_enabled} onValueChange={(value) => form.setCalendarSettings((prev: any) => ({ ...prev, absence_tracking_enabled: value }))} trackColor={{ false: theme.icon, true: theme.tint }} />
                      </View>
                    </View>
                  )}

                  {/* CONFIG BUDGET */}
                  {ui.showScopedModuleDetails && form.activeModules[module.id] && form.expandedModules[module.id] && module.id === "budget" && (
                    <View style={styles.subConfigBox}>
                      {ui.isEditMode ? (
                        <>
                          <Text style={[styles.label, { color: theme.text }]}>Paramètres par enfant</Text>
                          {asyncState.budgetSettingsLoading ? (
                            <ActivityIndicator size="small" color={theme.tint} />
                          ) : data.budgetChildDrafts.length === 0 ? (
                            <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>Aucun enfant trouvé pour ce foyer.</Text>
                          ) : (
                            <View style={{ gap: 10 }}>
                              {data.budgetChildDrafts.map((draft: any) => (
                                <View key={`budget-child-${draft.childId}`} style={[styles.budgetChildCard, { backgroundColor: theme.background, borderColor: theme.icon }]}>
                                  <Text style={[styles.memberName, { color: theme.text }]}>{draft.childName}</Text>
                                  <Text style={[styles.label, { color: theme.text, marginBottom: 4 }]}>Montant de base</Text>
                                  <AppTextInput style={styles.budgetCompactInput} keyboardType="decimal-pad" value={draft.baseAmountInput} onChangeText={(value) => actions.updateBudgetChildDraft(draft.childId, { baseAmountInput: value })} placeholder="Ex: 12,00" placeholderTextColor={theme.textSecondary} />
                                  <Text style={[styles.label, { color: theme.text, marginBottom: 4 }]}>Récurrence</Text>
                                  <View style={styles.budgetRecurrenceRow}>
                                    <AppButton onPress={() => actions.updateBudgetChildDraft(draft.childId, { recurrence: "weekly" })} style={[styles.budgetChoiceBtn, draft.recurrence === "weekly" ? { backgroundColor: theme.tint, borderColor: theme.tint } : { borderColor: theme.icon, backgroundColor: theme.card }]}>
                                      <Text style={[styles.budgetChoiceText, { color: draft.recurrence === "weekly" ? "#FFFFFF" : theme.text }]}>Hebdo</Text>
                                    </AppButton>
                                    <AppButton onPress={() => actions.updateBudgetChildDraft(draft.childId, { recurrence: "monthly" })} style={[styles.budgetChoiceBtn, draft.recurrence === "monthly" ? { backgroundColor: theme.tint, borderColor: theme.tint } : { borderColor: theme.icon, backgroundColor: theme.card }]}>
                                      <Text style={[styles.budgetChoiceText, { color: draft.recurrence === "monthly" ? "#FFFFFF" : theme.text }]}>Mensuel</Text>
                                    </AppButton>
                                  </View>
                                  <AppButton
                                    onPress={() => { void actions.saveBudgetChildDraft(draft); }}
                                    style={[styles.budgetSaveBtn, { backgroundColor: theme.tint, opacity: asyncState.savingBudgetChildId === draft.childId ? 0.8 : 1 }]}
                                    disabled={asyncState.savingBudgetChildId === draft.childId}
                                  >
                                    {asyncState.savingBudgetChildId === draft.childId ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.budgetSaveBtnText}>Enregistrer</Text>}
                                  </AppButton>
                                </View>
                              ))}
                            </View>
                          )}
                        </>
                      ) : (
                        <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>Les paramètres détaillés seront disponibles dès que le foyer sera créé.</Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );

return (
    <>
      {wizard.shouldUseSetupWizard && (
        <StepModules
          stepIndex={wizard.modulesStepIndex}
          totalSteps={wizard.setupFlow.totalSteps}
          footer={(
            <View style={styles.wizardActionsRow}>
              <AppButton style={[styles.wizardSecondaryBtn, { borderColor: theme.icon, backgroundColor: theme.card }]} onPress={wizard.goToPreviousSetupStep}>
                <Text style={[styles.wizardSecondaryBtnText, { color: theme.text }]}>Retour</Text>
              </AppButton>
              <AppButton style={[styles.wizardPrimaryBtn, { backgroundColor: theme.tint }]} onPress={wizard.goToNextSetupStep}>
                <Text style={styles.wizardPrimaryBtnText}>Continuer</Text>
              </AppButton>
            </View>
          )}
        >
          <></>
        </StepModules>
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
  moduleContainer: { borderRadius: 12, marginBottom: 10, overflow: "hidden" },
  moduleCard: { flexDirection: "row", alignItems: "center", padding: 12 },
  moduleIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 12 },
  moduleLabel: { fontSize: 15, fontWeight: "600" },
  subConfigBox: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 2 },
  mealFeatureRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  mealFeatureControls: { flexDirection: "row", alignItems: "center" },
  mealChevronSpacer: { width: 28, marginLeft: 8 },
  mealSectionBox: { borderRadius: 12, padding: 10, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  input: { height: 50, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, marginBottom: 16 },
  inputNoMargin: { marginBottom: 0 },
  inputWithSmallBottomSpacing: { marginBottom: 10 },
  inputCentered: { textAlign: "center" },
  categoryFilterWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  categoryFilterChip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  selectedHint: { fontSize: 12 },
  selectedValues: { fontSize: 13, fontWeight: "600", marginTop: 2 },
  tagsLoadingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, minWidth: 120 },
  tagChipText: { fontSize: 13, fontWeight: "700" },
  tagChipType: { fontSize: 11, marginTop: 2 },
  createTagBox: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 12 },
  createTagTitle: { fontSize: 13, fontWeight: "700", marginBottom: 4 },
  createTagBtn: { height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  createTagBtnText: { color: "white", fontSize: 14, fontWeight: "700" },
  daysContainer: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  dayChip: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  durationBtn: { flex: 1, height: 42, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  pickerFieldBtn: { borderWidth: 1, borderRadius: 10, minHeight: 44, paddingHorizontal: 12, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  pickerFieldText: { fontSize: 14, fontWeight: "600" },
  inlineWheelPanel: { borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 10 },
  wheelRow: { flexDirection: "row", gap: 8 },
  wheelColumn: { flex: 1, height: WHEEL_CONTAINER_HEIGHT, position: "relative" },
  wheelContentContainer: { paddingVertical: WHEEL_VERTICAL_PADDING },
  wheelItem: { height: WHEEL_ITEM_HEIGHT, alignItems: "center", justifyContent: "center" },
  wheelItemText: { fontSize: 16, fontWeight: "500" },
  wheelItemTextSelected: { fontWeight: "700" },
  wheelSelectionOverlay: { position: "absolute", left: 0, right: 0, top: WHEEL_VERTICAL_PADDING, height: WHEEL_ITEM_HEIGHT, borderWidth: 1, borderRadius: 10 },
  memberMeta: { fontSize: 11, color: "gray" },
  budgetChildCard: { borderWidth: 1, borderRadius: 12, padding: 8 },
  memberName: { fontSize: 14, fontWeight: "700" },
  budgetCompactInput: { height: 42, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, marginBottom: 6, fontSize: 14 },
  budgetRecurrenceRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  budgetChoiceBtn: { flex: 1, minHeight: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  budgetChoiceText: { fontSize: 12, fontWeight: "700" },
  budgetSaveBtn: { minHeight: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  budgetSaveBtnText: { color: "white", fontSize: 13, fontWeight: "700" },
  wizardActionsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  wizardPrimaryBtn: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  wizardPrimaryBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  wizardSecondaryBtn: { minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  wizardSecondaryBtnText: { fontSize: 15, fontWeight: "600" },
});
