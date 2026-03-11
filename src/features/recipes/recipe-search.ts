type RecipeLike = {
  title: string;
};

const normalizeForSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export const filterRecipesByTitleQuery = <T extends RecipeLike>(recipes: T[], query: string): T[] => {
  const normalizedQuery = normalizeForSearch(query.trim());
  if (normalizedQuery.length === 0) {
    return recipes;
  }

  return recipes.filter((recipe) => normalizeForSearch(recipe.title).includes(normalizedQuery));
};
