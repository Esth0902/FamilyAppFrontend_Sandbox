"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const calendar_utils_1 = require("../src/features/calendar/calendar-utils");
(0, node_test_1.default)("isValidIsoDate validates strict YYYY-MM-DD values", () => {
    strict_1.default.equal((0, calendar_utils_1.isValidIsoDate)("2026-03-05"), true);
    strict_1.default.equal((0, calendar_utils_1.isValidIsoDate)("2026-2-5"), false);
    strict_1.default.equal((0, calendar_utils_1.isValidIsoDate)("2026-02-30"), false);
});
(0, node_test_1.default)("isValidTime validates HH:MM 24h values", () => {
    strict_1.default.equal((0, calendar_utils_1.isValidTime)("00:00"), true);
    strict_1.default.equal((0, calendar_utils_1.isValidTime)("23:59"), true);
    strict_1.default.equal((0, calendar_utils_1.isValidTime)("24:00"), false);
    strict_1.default.equal((0, calendar_utils_1.isValidTime)("08:7"), false);
});
(0, node_test_1.default)("parseEventDateTimeRange rejects invalid and reversed ranges", () => {
    strict_1.default.equal((0, calendar_utils_1.parseEventDateTimeRange)("2026-03-05", "14:00", "2026-03-05", "13:00"), null);
    strict_1.default.equal((0, calendar_utils_1.parseEventDateTimeRange)("2026-03-05", "14:00", "2026-03-05", "14:00"), null);
    strict_1.default.equal((0, calendar_utils_1.parseEventDateTimeRange)("2026-03-40", "14:00", "2026-03-05", "15:00"), null);
});
(0, node_test_1.default)("parseEventDateTimeRange supports multi-day events", () => {
    const range = (0, calendar_utils_1.parseEventDateTimeRange)("2026-03-05", "22:00", "2026-03-06", "01:00");
    strict_1.default.notEqual(range, null);
    strict_1.default.equal(range?.startAt.getFullYear(), 2026);
    strict_1.default.equal(range?.startAt.getMonth(), 2);
    strict_1.default.equal(range?.startAt.getDate(), 5);
    strict_1.default.equal(range?.endAt.getDate(), 6);
    strict_1.default.equal(range?.endAt.getTime() - range?.startAt.getTime(), 3 * 60 * 60 * 1000);
});
(0, node_test_1.default)("filterRecipesByQuery filters by recipe title", () => {
    const recipes = [
        { id: 1, title: "Pates bolo" },
        { id: 2, title: "Soupe tomates" },
        { id: 3, title: "Riz cantonais" },
        { id: 4, title: "Cr\u00e8me brulee" },
    ];
    strict_1.default.deepEqual((0, calendar_utils_1.filterRecipesByQuery)(recipes, "soupe").map((recipe) => recipe.id), [2]);
    strict_1.default.deepEqual((0, calendar_utils_1.filterRecipesByQuery)(recipes, "  RIZ ").map((recipe) => recipe.id), [3]);
    strict_1.default.deepEqual((0, calendar_utils_1.filterRecipesByQuery)(recipes, "creme").map((recipe) => recipe.id), [4]);
    strict_1.default.equal((0, calendar_utils_1.filterRecipesByQuery)(recipes, "").length, 4);
});
(0, node_test_1.default)("isTaskStatus accepts accents and ASCII fallback", () => {
    strict_1.default.equal((0, calendar_utils_1.isTaskStatus)("r\u00e9alis\u00e9e", "realisee"), true);
    strict_1.default.equal((0, calendar_utils_1.isTaskStatus)("a faire", "\u00e0 faire"), true);
    strict_1.default.equal((0, calendar_utils_1.isTaskStatus)("annulee", "annul\u00e9e"), true);
    strict_1.default.equal((0, calendar_utils_1.isTaskStatus)("en pause", "\u00e0 faire"), false);
});
