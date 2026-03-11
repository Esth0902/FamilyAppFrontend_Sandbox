import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";

type DashboardPoll = {
  id: number;
};

type DashboardTaskSummary = {
  enabled: boolean;
  range?: {
    from: string;
    to: string;
  };
  todo_count?: number;
  done_count?: number;
  validated_count?: number;
};

type DashboardResponse = {
  polls_open?: DashboardPoll[];
  polls_closed?: DashboardPoll[];
  polls?: DashboardPoll[];
  tasks_summary?: DashboardTaskSummary;
};

export default function DashboardScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardResponse | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch("/dashboard");
      setData(response ?? null);
    } catch (error: any) {
      Alert.alert("Dashboard", error?.message || "Impossible de charger le dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
    }, [loadDashboard])
  );

  const pollsOpenCount = data?.polls_open?.length ?? 0;
  const pollsClosedCount = data?.polls_closed?.length ?? 0;
  const pollsTotalCount = data?.polls?.length ?? 0;
  const tasksSummary = data?.tasks_summary;
  const tasksTodoCount = tasksSummary?.todo_count ?? 0;
  const tasksDoneCount = tasksSummary?.done_count ?? 0;
  const tasksValidatedCount = tasksSummary?.validated_count ?? 0;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: theme.icon }]}>
        <TouchableOpacity onPress={() => router.replace("/(tabs)/home")}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Dashboard</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.menuGrid}>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: colorScheme === "dark" ? "#1E1E1E" : "#FFF" }]}
            onPress={() => router.push("/dashboard/sondages")}
            activeOpacity={0.7}
          >
            <View style={[styles.cardAccent, { backgroundColor: theme.tint }]} />
            <View style={styles.cardContent}>
              <View style={[styles.iconContainer, { backgroundColor: `${theme.tint}15` }]}>
                <MaterialCommunityIcons name="vote" size={28} color={theme.tint} />
              </View>
              <View style={styles.textContainer}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Mes sondages</Text>
                <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>
                  Ouverts : {pollsOpenCount} | Cloturés : {pollsClosedCount} | Total : {pollsTotalCount}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.card, { backgroundColor: colorScheme === "dark" ? "#1E1E1E" : "#FFF", marginTop: 10 }]}
            onPress={() => router.push("/(tabs)/tasks")}
            activeOpacity={0.7}
          >
            <View style={[styles.cardAccent, { backgroundColor: "#50BFA5" }]} />
            <View style={styles.cardContent}>
              <View style={[styles.iconContainer, { backgroundColor: "rgba(80, 191, 165, 0.12)" }]}>
                <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={28} color="#50BFA5" />
              </View>
              <View style={styles.textContainer}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Mes tâches</Text>
                <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>
                  {tasksSummary?.enabled
                    ? `À faire : ${tasksTodoCount} | Réalisées : ${tasksDoneCount} | Validées : ${tasksValidatedCount}`
                    : "Module tâches désactivé"}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: { flex: 1 },
  header: {
    minHeight: 60,
    marginTop: 28,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  menuGrid: {
    marginBottom: 2,
  },
  card: {
    borderRadius: 15,
    overflow: "hidden",
    flexDirection: "row",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardAccent: {
    width: 6,
    height: "100%",
  },
  cardContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  textContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 2,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
});
