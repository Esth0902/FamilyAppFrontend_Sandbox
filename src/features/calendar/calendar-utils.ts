import { filterRecipesByTitleQuery } from "../recipes/recipe-search";
import { isValidIsoDate as isValidIsoDateShared } from "../../utils/date";

export type CalendarRecipeOption = {
  id: number;
  title: string;
  type?: string | null;
};

const stripDiacritics = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const isValidIsoDate = (value: string) => isValidIsoDateShared(value);

export const isValidTime = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);

export const isTaskStatus = (value: string, expected: string) => {
  const normalized = stripDiacritics(value);
  const target = stripDiacritics(expected);
  return normalized === target || normalized.includes(target);
};

export const filterRecipesByQuery = (recipes: CalendarRecipeOption[], query: string) => {
  return filterRecipesByTitleQuery(recipes, query);
};

export const parseEventDateTimeRange = (
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string
): { startAt: Date; endAt: Date } | null => {
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate) || !isValidTime(startTime) || !isValidTime(endTime)) {
    return null;
  }

  const startAt = new Date(`${startDate}T${startTime}:00`);
  const endAt = new Date(`${endDate}T${endTime}:00`);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return null;
  }

  return { startAt, endAt };
};
