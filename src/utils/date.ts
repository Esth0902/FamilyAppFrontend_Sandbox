export const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const parseIsoDate = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

export const parseOptionalIsoDate = (value?: string | null): Date | null => {
  if (!value) {
    return null;
  }

  return parseIsoDate(value);
};

export const isValidIsoDate = (value: string) => parseIsoDate(value) !== null;

export const addDays = (baseDate: Date, days: number) => {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + days);
  return next;
};

export const todayIso = () => toIsoDate(new Date());

export const addDaysIso = (offset: number, anchor: Date = new Date()) => toIsoDate(addDays(anchor, offset));

export const addDaysFromIso = (baseIso: string, offset: number) => {
  const baseDate = parseIsoDate(baseIso);
  if (!baseDate) {
    return addDaysIso(offset);
  }

  return toIsoDate(addDays(baseDate, offset));
};
