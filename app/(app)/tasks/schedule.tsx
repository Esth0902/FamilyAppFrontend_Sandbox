import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getApiErrorMessage } from "@/src/api/client";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { WheelDatePicker } from "@/src/components/ui/WheelDatePicker";
import { useTasksBoard } from "@/src/features/tasks/hooks/useTasksBoard";
import { tasksManageStyles as styles } from "@/src/features/tasks/tasks-manage.styles";
import { useStoredUserState } from "@/src/session/user-cache";
import { createTaskInstance } from "@/src/services/tasksService";
import { isValidIsoDate, toIsoDate } from "@/src/utils/date";

export default function ScheduleTaskScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId } = useStoredUserState();
  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const {
    loading,
    error,
    refreshBoard,
    invalidateTaskCaches,
    tasksEnabled,
    canManageInstances,
    members,
    currentUserId,
    currentUserRole,
  } = useTasksBoard({
    householdId,
    weekAnchor: new Date(),
    rangeMode: "standard",
  });

  useFocusEffect(
    useCallback(() => {
      void refreshBoard();
    }, [refreshBoard])
  );

  useEffect(() => {
    if (!error) {
      return;
    }
    Alert.alert("Tâches", getApiErrorMessage(error, "Impossible de charger les tâches."));
  }, [error]);

  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<number[]>([]);
  const [manualTitle, setManualTitle] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualDate, setManualDate] = useState(todayIso);
  const [manualEndDate, setManualEndDate] = useState(todayIso);
  const [manualDateWheelVisible, setManualDateWheelVisible] = useState(false);
  const [manualDateWheelTarget, setManualDateWheelTarget] = useState<"start" | "end">("start");

  useEffect(() => {
    if (currentUserRole !== "parent") {
      if (currentUserId !== null) {
        setSelectedAssigneeIds([currentUserId]);
      }
      return;
    }

    setSelectedAssigneeIds((prev) => prev.filter((id) => members.some((member) => member.id === id)));
  }, [currentUserId, currentUserRole, members]);

  const assignableMembers = useMemo(() => {
    if (currentUserRole === "parent") {
      return members;
    }
    if (currentUserId === null) {
      return [];
    }
    return members.filter((member) => member.id === currentUserId);
  }, [currentUserId, currentUserRole, members]);

  const createManualTaskMutation = useMutation({
    mutationFn: async (payload: { name: string; description: string | null; due_date: string; end_date: string; user_ids: number[] }) => {
      await createTaskInstance(payload);
    },
    onSuccess: () => {
      invalidateTaskCaches();
    },
  });

  const saving = createManualTaskMutation.isPending;

  const toggleManualAssignee = useCallback((memberId: number) => {
    setSelectedAssigneeIds((prev) => {
      if (prev.includes(memberId)) {
        return prev.filter((id) => id !== memberId);
      }
      return [...prev, memberId];
    });
  }, []);

  const openManualDateWheel = (target: "start" | "end") => {
    if (manualDateWheelVisible && manualDateWheelTarget === target) {
      setManualDateWheelVisible(false);
      return;
    }
    setManualDateWheelTarget(target);
    setManualDateWheelVisible(true);
  };

  const handleManualDateWheelChange = useCallback((nextIsoDate: string) => {
    if (!isValidIsoDate(nextIsoDate)) {
      return;
    }

    if (manualDateWheelTarget === "start") {
      setManualDate(nextIsoDate);
      setManualEndDate(nextIsoDate);
      return;
    }

    setManualEndDate((prev) => {
      const bounded = nextIsoDate < manualDate ? manualDate : nextIsoDate;
      return prev === bounded ? prev : bounded;
    });
  }, [manualDate, manualDateWheelTarget]);

  const manualDateWheelValue = useMemo(
    () => (manualDateWheelTarget === "start" ? manualDate : manualEndDate),
    [manualDate, manualDateWheelTarget, manualEndDate]
  );

  const manualDateWheelTitle = useMemo(
    () => (manualDateWheelTarget === "start" ? "Choisir la date de début" : "Choisir la date de fin"),
    [manualDateWheelTarget]
  );

  const createManualTask = async () => {
    const cleanTitle = manualTitle.trim();
    if (cleanTitle.length < 2) {
      Alert.alert("Tâches", "Le nom de la tâche est obligatoire.");
      return;
    }
    if (!isValidIsoDate(manualDate)) {
      Alert.alert("Tâches", "La date de la tâche est invalide (YYYY-MM-DD).");
      return;
    }
    if (!isValidIsoDate(manualEndDate)) {
      Alert.alert("Tâches", "La date de fin est invalide (YYYY-MM-DD).");
      return;
    }
    if (manualEndDate < manualDate) {
      Alert.alert("Tâches", "La date de fin doit être postérieure ou égale à la date de début.");
      return;
    }

    const assigneeIds = currentUserRole === "parent"
      ? Array.from(new Set(selectedAssigneeIds.filter((id) => Number.isInteger(id) && id > 0)))
      : (currentUserId !== null ? [currentUserId] : []);
    if (assigneeIds.length === 0) {
      Alert.alert("Tâches", "Choisis au moins un membre du foyer.");
      return;
    }

    try {
      await createManualTaskMutation.mutateAsync({
        name: cleanTitle,
        description: manualDescription.trim() || null,
        due_date: manualDate,
        end_date: manualEndDate,
        user_ids: assigneeIds,
      });
      setManualTitle("");
      setManualDescription("");
      setManualDate(todayIso);
      setManualEndDate(todayIso);
      setManualDateWheelVisible(false);
      if (currentUserRole === "parent") {
        setSelectedAssigneeIds([]);
      } else if (currentUserId !== null) {
        setSelectedAssigneeIds([currentUserId]);
      }
      await refreshBoard();
    } catch (mutationError: any) {
      Alert.alert("Tâches", getApiErrorMessage(mutationError, "Impossible de créer cette tâche."));
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <View style={{ backgroundColor: theme.background, paddingHorizontal: 16 }}>
        <ScreenHeader
          title="Planifier une tâche ponctuelle"
          subtitle="Crée une tâche ponctuelle et attribue-la à un membre du foyer."
          withBackButton
          backHref="/(app)/(tabs)/tasks"
          showBorder
          safeTop
          bottomSpacing={14}
          containerStyle={{ paddingHorizontal: 0 }}
          contentStyle={{ minHeight: 0 }}
          rightSlot={currentUserRole === "parent" ? (
            <TouchableOpacity
              onPress={() => router.push("/householdSetup?mode=edit&scope=tasks")}
              style={[styles.settingsBtn, { borderColor: theme.icon }]}
            >
              <MaterialCommunityIcons name="cog-outline" size={20} color={theme.tint} />
            </TouchableOpacity>
          ) : null}
        />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        contentContainerStyle={styles.content}
      >
        {!tasksEnabled ? (
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Module désactivé</Text>
            <Text style={{ color: theme.textSecondary, lineHeight: 20 }}>
              Active le module tâches dans la configuration du foyer pour commencer.
            </Text>
            {currentUserRole === "parent" ? (
              <TouchableOpacity
                onPress={() => router.push("/householdSetup?mode=edit&scope=tasks")}
                style={[styles.primaryBtn, { backgroundColor: theme.tint }]}
              >
                <Text style={styles.primaryBtnText}>Configurer le foyer</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : !canManageInstances ? (
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Planifier une tâche ponctuelle</Text>
            <Text style={{ color: theme.textSecondary, lineHeight: 20 }}>
              Cette section est réservée aux membres autorisés.
            </Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Planifier une tâche ponctuelle</Text>

            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
              value={manualTitle}
              onChangeText={setManualTitle}
              placeholder="Nom de la tâche"
              placeholderTextColor={theme.textSecondary}
            />
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
              value={manualDescription}
              onChangeText={setManualDescription}
              placeholder="Description (optionnel)"
              placeholderTextColor={theme.textSecondary}
            />

            <Text style={[styles.label, { color: theme.text }]}>Date de début</Text>
            <TouchableOpacity
              onPress={() => openManualDateWheel("start")}
              style={[styles.pickerFieldBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
              disabled={saving}
            >
              <MaterialCommunityIcons name="calendar-month-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.pickerFieldText, { color: theme.text }]}>{manualDate}</Text>
            </TouchableOpacity>

            <Text style={[styles.label, { color: theme.text }]}>Date de fin</Text>
            <TouchableOpacity
              onPress={() => openManualDateWheel("end")}
              style={[styles.pickerFieldBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
              disabled={saving}
            >
              <MaterialCommunityIcons name="calendar-month-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.pickerFieldText, { color: theme.text }]}>{manualEndDate}</Text>
            </TouchableOpacity>

            <WheelDatePicker
              visible={manualDateWheelVisible}
              title={manualDateWheelTitle}
              value={manualDateWheelValue}
              minValue={manualDateWheelTarget === "end" ? manualDate : undefined}
              onChange={handleManualDateWheelChange}
              theme={theme}
            />

            <Text style={[styles.label, { color: theme.text }]}>Attribuer à</Text>
            {assignableMembers.length > 0 ? (
              <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberRow}>
                {assignableMembers.map((member) => (
                  <TouchableOpacity
                    key={`manual-assign-${member.id}`}
                    onPress={() => toggleManualAssignee(member.id)}
                    style={[
                      styles.memberChip,
                      { borderColor: theme.icon, backgroundColor: theme.background },
                      selectedAssigneeIds.includes(member.id) && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                    ]}
                    disabled={saving}
                  >
                    <Text style={{ color: theme.text }}>{member.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <Text style={{ color: theme.textSecondary, marginBottom: 8 }}>
                Aucun membre disponible pour l&apos;attribution.
              </Text>
            )}

            <TouchableOpacity
              onPress={() => void createManualTask()}
              style={[styles.primaryBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
              disabled={saving}
            >
              {saving ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.primaryBtnText}>Ajouter la tâche</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
