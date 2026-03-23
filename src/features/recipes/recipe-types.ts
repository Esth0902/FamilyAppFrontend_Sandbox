export type RecipeTab = "mine" | "all";

export const RECIPE_TYPE_FILTERS = [
    { label: "Toutes", value: "all", icon: "shape-outline" },
    { label: "Petit-déjeuner", value: "petit-déjeuner", icon: "coffee-outline" },
    { label: "Entrée", value: "entrée", icon: "food-apple-outline" },
    { label: "Plat", value: "plat principal", icon: "silverware-fork-knife" },
    { label: "Dessert", value: "dessert", icon: "cupcake" },
    { label: "Collation", value: "collation", icon: "food-croissant" },
    { label: "Boisson", value: "boisson", icon: "cup-water" },
    { label: "Autre", value: "autre", icon: "dots-horizontal-circle-outline" },
] as const;

const RECIPE_TYPE_ALIASES: Record<string, string> = {
    "petit-déjeuner": "petit-déjeuner",
    "petit-dejeuner": "petit-déjeuner",
    "petit-d?jeuner": "petit-déjeuner",
    "entrée": "entrée",
    entree: "entrée",
    "entr?e": "entrée",
    "plat principal": "plat principal",
    dessert: "dessert",
    collation: "collation",
    boisson: "boisson",
    autre: "autre",
};

export const normalizeRecipeTypeValue = (value: unknown): string => {
    const raw = String(value ?? "autre").trim().toLowerCase();
    if (raw.length === 0) {
        return "autre";
    }

    return RECIPE_TYPE_ALIASES[raw] ?? raw;
};
