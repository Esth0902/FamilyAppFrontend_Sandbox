import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";

export type DashboardTheme = typeof Colors.light;

export type DashboardRoute =
  | "/dashboard/sondages"
  | "/dashboard/budget"
  | "/dashboard/tasks"
  | "/dashboard/calendar";

export type DashboardCardItem = {
  id: string;
  title: string;
  description: string;
  extraDescription?: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accentColor: string;
  iconBackgroundColor: string;
  route: DashboardRoute;
};
