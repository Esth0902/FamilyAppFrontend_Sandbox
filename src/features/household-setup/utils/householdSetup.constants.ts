import type {
  DietaryTagOption,
  HouseholdConnectionPermissions,
  HouseholdConnectionState,
  ModuleKey,
} from "./householdSetup.types";

export const MODULES: { id: ModuleKey; label: string; desc: string; icon: string }[] = [
  { id: "meals", label: "Repas & Courses", desc: "Menus et liste partagée.", icon: "food-apple-outline" },
  { id: "tasks", label: "Tâches Ménagères", desc: "Suivi des corvées.", icon: "broom" },
  { id: "budget", label: "Budget & Argent", desc: "Argent de poche par enfant.", icon: "piggy-bank-outline" },
  { id: "calendar", label: "Agenda Familial", desc: "Planning partagé.", icon: "calendar-clock" },
];

export const DAYS = [
  { label: "Lun", value: 1 },
  { label: "Mar", value: 2 },
  { label: "Mer", value: 3 },
  { label: "Jeu", value: 4 },
  { label: "Ven", value: 5 },
  { label: "Sam", value: 6 },
  { label: "Dim", value: 7 },
] as const;

export const DURATION_CHOICES = [12, 24, 48] as const;
export const MONTH_LABELS = ["jan", "fév", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "dec"];
export const WEEK_DAY_SHORT = ["di", "lu", "ma", "me", "je", "ve", "sa"] as const;

export const WHEEL_ITEM_HEIGHT = 40;
export const WHEEL_VISIBLE_ROWS = 5;
export const WHEEL_CONTAINER_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS;
export const WHEEL_VERTICAL_PADDING = (WHEEL_CONTAINER_HEIGHT - WHEEL_ITEM_HEIGHT) / 2;

export const DIETARY_TYPE_LABELS: Record<DietaryTagOption["type"], string> = {
  diet: "Régimes",
  allergen: "Allergènes",
  dislike: "À éviter",
  restriction: "Restrictions",
  cuisine_rule: "Cuisine",
};

export const ALLOWED_DIETARY_TYPES: DietaryTagOption["type"][] = [
  "diet",
  "allergen",
  "dislike",
  "restriction",
  "cuisine_rule",
];

export const DIETARY_TYPE_ORDER: DietaryTagOption["type"][] = [
  "diet",
  "allergen",
  "restriction",
  "dislike",
  "cuisine_rule",
];

export const INITIAL_HOUSEHOLD_CONNECTION: HouseholdConnectionState = {
  is_connected: false,
  linked_household: null,
  pending_request: null,
  active_code: null,
};

export const INITIAL_HOUSEHOLD_CONNECTION_PERMISSIONS: HouseholdConnectionPermissions = {
  can_manage_connection: false,
  can_generate_code: false,
  can_connect_with_code: false,
  can_unlink: false,
};