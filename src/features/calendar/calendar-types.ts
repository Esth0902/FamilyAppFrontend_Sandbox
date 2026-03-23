export type MealType = "matin" | "midi" | "soir";

export const MEAL_TYPES: { label: string; value: MealType }[] = [
  { label: "Matin", value: "matin" },
  { label: "Midi", value: "midi" },
  { label: "Soir", value: "soir" },
];

export const MEAL_TYPE_SORT: Record<MealType, number> = {
  matin: 0,
  midi: 1,
  soir: 2,
};

export const mealTypeLabel = (value: string) => {
  if (value === "matin") return "Matin";
  if (value === "midi") return "Midi";
  if (value === "soir") return "Soir";
  return value;
};

export const mealTypeColor = (value: string) => {
  if (value === "matin") return "#F5A623";
  if (value === "midi") return "#4A90E2";
  if (value === "soir") return "#50BFA5";
  return "#7B8794";
};
