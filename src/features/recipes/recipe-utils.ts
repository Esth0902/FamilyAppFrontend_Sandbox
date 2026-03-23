type RecipeWithId = {
  id: number;
};

export const mergeUniqueRecipes = <T extends RecipeWithId>(current: T[], incoming: T[]): T[] => {
  const merged = new Map<number, T>();

  current.forEach((recipe) => {
    if (Number.isInteger(recipe.id) && recipe.id > 0) {
      merged.set(recipe.id, recipe);
    }
  });

  incoming.forEach((recipe) => {
    if (Number.isInteger(recipe.id) && recipe.id > 0) {
      merged.set(recipe.id, recipe);
    }
  });

  return Array.from(merged.values());
};
