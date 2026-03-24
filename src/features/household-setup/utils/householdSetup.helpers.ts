import {
  ALLOWED_DIETARY_TYPES,
  DIETARY_TYPE_ORDER,
  WEEK_DAY_SHORT,
  WHEEL_ITEM_HEIGHT,
} from "./householdSetup.constants";
import type {
  CreatedMemberCredential,
  DietaryTagOption,
  MemberRole,
} from "./householdSetup.types";

export const normalizeMemberRole = (value: unknown): MemberRole => {
  return String(value ?? "").trim() === "parent" ? "parent" : "enfant";
};

export const compareMembersByRoleThenName = <T extends { role: MemberRole; name: string }>(a: T, b: T): number => {
  if (a.role !== b.role) {
    return a.role === "parent" ? -1 : 1;
  }
  return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
};

export const normalizeMemberIdentity = (value?: string): string => {
  return String(value ?? "").trim().toLocaleLowerCase("fr");
};

export const toggleMemberRole = (role: MemberRole): MemberRole => {
  return role === "parent" ? "enfant" : "parent";
};

export const normalizeDietaryType = (value: unknown): DietaryTagOption["type"] => {
  const rawType = String(value ?? "");
  return ALLOWED_DIETARY_TYPES.includes(rawType as DietaryTagOption["type"])
    ? (rawType as DietaryTagOption["type"])
    : "restriction";
};

export const sortDietaryTags = (tags: DietaryTagOption[]): DietaryTagOption[] => {
  return [...tags].sort((a, b) => {
    const typeIndexDiff = DIETARY_TYPE_ORDER.indexOf(a.type) - DIETARY_TYPE_ORDER.indexOf(b.type);
    if (typeIndexDiff !== 0) {
      return typeIndexDiff;
    }
    return a.label.localeCompare(b.label, "fr", { sensitivity: "base" });
  });
};

export const parseTimeToHHMM = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

export const parseDecimalInput = (value: string): number | null => {
  const normalized = value.replace(",", ".").trim();
  if (normalized === "") {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const pad2 = (value: number): string => String(value).padStart(2, "0");

export const toIsoDate = (date: Date): string => {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

export const parseIsoDate = (value: string): Date => new Date(`${value}T00:00:00`);

export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export const wheelIndexFromOffset = (offsetY: number, size: number): number => {
  return clamp(Math.round(offsetY / WHEEL_ITEM_HEIGHT), 0, Math.max(0, size - 1));
};

export const weekDayShortLabel = (year: number, month: number, day: number): string => {
  const date = new Date(year, month - 1, day);
  return WEEK_DAY_SHORT[date.getDay()] ?? "";
};

export const startOfCustomWeek = (date: Date, startDayIso: number): Date => {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const jsStartDay = startDayIso % 7;
  const delta = (normalized.getDay() - jsStartDay + 7) % 7;
  normalized.setDate(normalized.getDate() - delta);
  return normalized;
};

export const isValidIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

export const normalizeCustodyWeekStartDate = (isoDate: string, changeDay: number): string => {
  const safeDay = Number.isInteger(changeDay) && changeDay >= 1 && changeDay <= 7 ? changeDay : 5;
  const source = isValidIsoDate(isoDate) ? parseIsoDate(isoDate) : new Date();
  return toIsoDate(startOfCustomWeek(source, safeDay));
};

export const buildMemberShareText = (member: CreatedMemberCredential): string => {
  const name = String(member.name ?? "Membre").trim() || "Membre";
  const email = String(member.generated_email ?? "").trim();
  const password = String(member.generated_password ?? "").trim();

  if (member.share_text && String(member.share_text).trim().length > 0) {
    return String(member.share_text).trim();
  }

  return `Bonjour ${name} !\n\n`
    + "Ton compte FamilyFlow est prêt.\n"
    + `Email : ${email}\n`
    + `Mot de passe temporaire : ${password}\n\n`
    + "Connecte-toi puis modifie ton mot de passe dès la première connexion.";
};

export const buildHouseholdConnectionShareText = (
  householdName: string,
  code: string,
  customText?: string
): string => {
  const normalizedCustomText = String(customText ?? "").trim();
  if (normalizedCustomText.length > 0) {
    return normalizedCustomText;
  }

  return `Invitation de liaison FamilyFlow\n\n`
    + `Foyer : ${householdName}\n`
    + `Code de liaison : ${code}\n\n`
    + "Ouvre FamilyFlow > Modifier le foyer > Foyer connecté, puis encode ce code.";
};

export const resolveActiveHouseholdRole = (rawUser: unknown): MemberRole => {
  const user = (rawUser ?? {}) as {
    household_id?: unknown;
    role?: unknown;
    households?: {
      id?: unknown;
      role?: unknown;
      pivot?: { role?: unknown } | null;
    }[];
  };

  const households = Array.isArray(user.households) ? user.households : [];
  const parsedHouseholdId = Number(user.household_id ?? 0);
  const activeHouseholdId = Number.isFinite(parsedHouseholdId) && parsedHouseholdId > 0
    ? Math.trunc(parsedHouseholdId)
    : null;

  const activeHousehold = activeHouseholdId
    ? households.find((household) => Number(household?.id ?? 0) === activeHouseholdId)
    : households[0];

  return normalizeMemberRole(activeHousehold?.pivot?.role ?? activeHousehold?.role ?? user.role);
};