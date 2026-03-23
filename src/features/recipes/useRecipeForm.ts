import { useCallback, useState } from "react";

export type IngredientForm = {
    name: string;
    quantity: string;
    unit: string;
};

type RecipeFormState = {
    title: string;
    type: string;
    description: string;
    baseServings: string;
    instructions: string[];
    ingredients: IngredientForm[];
};

type BuildPayloadArgs = {
    householdId: number | null;
};

const INITIAL_STATE: RecipeFormState = {
    title: "",
    type: "plat principal",
    description: "",
    baseServings: "1",
    instructions: [""],
    ingredients: [{ name: "", quantity: "", unit: "g" }],
};

const parseBaseServings = (value: string): number | null => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 30) {
        return null;
    }

    return parsed;
};

export const useRecipeForm = () => {
    const [form, setForm] = useState<RecipeFormState>(INITIAL_STATE);

    const setTitle = useCallback((title: string) => {
        setForm((prev) => ({ ...prev, title }));
    }, []);

    const setType = useCallback((type: string) => {
        setForm((prev) => ({ ...prev, type }));
    }, []);

    const setDescription = useCallback((description: string) => {
        setForm((prev) => ({ ...prev, description }));
    }, []);

    const setBaseServings = useCallback((baseServings: string) => {
        setForm((prev) => ({ ...prev, baseServings: baseServings.replace(/[^0-9]/g, "") }));
    }, []);

    const updateIngredient = useCallback((index: number, patch: Partial<IngredientForm>) => {
        setForm((prev) => ({
            ...prev,
            ingredients: prev.ingredients.map((ingredient, ingredientIndex) =>
                ingredientIndex === index ? { ...ingredient, ...patch } : ingredient
            ),
        }));
    }, []);

    const addIngredient = useCallback(() => {
        setForm((prev) => ({
            ...prev,
            ingredients: [...prev.ingredients, { name: "", quantity: "", unit: "g" }],
        }));
    }, []);

    const removeIngredient = useCallback((index: number) => {
        setForm((prev) => {
            if (prev.ingredients.length <= 1) {
                return prev;
            }

            return {
                ...prev,
                ingredients: prev.ingredients.filter((_, ingredientIndex) => ingredientIndex !== index),
            };
        });
    }, []);

    const updateInstruction = useCallback((index: number, value: string) => {
        setForm((prev) => ({
            ...prev,
            instructions: prev.instructions.map((step, stepIndex) =>
                stepIndex === index ? value : step
            ),
        }));
    }, []);

    const addInstruction = useCallback(() => {
        setForm((prev) => ({
            ...prev,
            instructions: [...prev.instructions, ""],
        }));
    }, []);

    const removeInstruction = useCallback((index: number) => {
        setForm((prev) => {
            if (prev.instructions.length <= 1) {
                return prev;
            }

            return {
                ...prev,
                instructions: prev.instructions.filter((_, stepIndex) => stepIndex !== index),
            };
        });
    }, []);

    const resetForm = useCallback(() => {
        setForm(INITIAL_STATE);
    }, []);

    const buildPayload = useCallback(({ householdId }: BuildPayloadArgs): Record<string, unknown> => {
        if (!form.title.trim()) {
            throw new Error("Le titre de la recette est obligatoire.");
        }

        const parsedBaseServings = parseBaseServings(form.baseServings);
        if (!parsedBaseServings) {
            throw new Error("Le nombre de portions doit être entre 1 et 30.");
        }

        if (!householdId) {
            throw new Error("Aucun foyer actif trouvé pour enregistrer la recette.");
        }

        const formattedInstructions = form.instructions
            .map((step) => step.trim())
            .filter((step) => step.length > 0)
            .map((step, index) => `Étape ${index + 1} : ${step}`)
            .join("\n\n");

        return {
            title: form.title.trim(),
            type: form.type || "plat principal",
            description: form.description.trim(),
            base_servings: parsedBaseServings,
            instructions: formattedInstructions,
            household_id: householdId,
            ingredients: form.ingredients.map((ingredient) => ({
                name: ingredient.name.trim(),
                quantity: Number.parseFloat(ingredient.quantity) || 0,
                unit: ingredient.unit.trim() || "unité",
            })),
        };
    }, [form]);

    return {
        form,
        setTitle,
        setType,
        setDescription,
        setBaseServings,
        updateIngredient,
        addIngredient,
        removeIngredient,
        updateInstruction,
        addInstruction,
        removeInstruction,
        resetForm,
        buildPayload,
    };
};
