"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEventDateTimeRange = exports.filterRecipesByQuery = exports.isTaskStatus = exports.isValidTime = exports.isValidIsoDate = void 0;
const stripDiacritics = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const parseIsoDate = (value) => new Date(`${value}T00:00:00`);
const isIsoDateFormat = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const toIsoDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const isValidIsoDate = (value) => {
    if (!isIsoDateFormat(value)) {
        return false;
    }
    const parsed = parseIsoDate(value);
    return !Number.isNaN(parsed.getTime()) && toIsoDate(parsed) === value;
};
exports.isValidIsoDate = isValidIsoDate;
const isValidTime = (value) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
exports.isValidTime = isValidTime;
const isTaskStatus = (value, expected) => {
    const normalized = stripDiacritics(value);
    const target = stripDiacritics(expected);
    return normalized === target || normalized.includes(target);
};
exports.isTaskStatus = isTaskStatus;
const filterRecipesByQuery = (recipes, query) => {
    const normalizedQuery = stripDiacritics(query.trim());
    if (normalizedQuery.length === 0) {
        return recipes;
    }
    return recipes.filter((recipe) => stripDiacritics(recipe.title).includes(normalizedQuery));
};
exports.filterRecipesByQuery = filterRecipesByQuery;
const parseEventDateTimeRange = (startDate, startTime, endDate, endTime) => {
    if (!(0, exports.isValidIsoDate)(startDate) || !(0, exports.isValidIsoDate)(endDate) || !(0, exports.isValidTime)(startTime) || !(0, exports.isValidTime)(endTime)) {
        return null;
    }
    const startAt = new Date(`${startDate}T${startTime}:00`);
    const endAt = new Date(`${endDate}T${endTime}:00`);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
        return null;
    }
    return { startAt, endAt };
};
exports.parseEventDateTimeRange = parseEventDateTimeRange;
