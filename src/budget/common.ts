export type BudgetRecurrence = "weekly" | "monthly";
export type BudgetRole = "parent" | "enfant";
export type TransactionType = "allocation" | "bonus" | "penalty" | "advance";
export type TransactionStatus = "pending" | "approved" | "rejected";
export type BudgetRequestKind = "advance" | "reimbursement";
export type BudgetPayoutMode = "integrated" | "immediate";

export type BudgetSetting = {
  user_id: number;
  base_amount: number;
  recurrence: BudgetRecurrence;
  reset_day: number;
  allow_advances: boolean;
  max_advance_amount: number;
};

export type BudgetTransaction = {
  id: number;
  amount: number;
  signed_amount: number;
  type: TransactionType;
  status: TransactionStatus;
  comment: string | null;
  request_kind?: BudgetRequestKind | null;
  payout_mode?: BudgetPayoutMode | null;
  created_at: string | null;
  user?: {
    id: number;
    name: string;
  };
};

export type ChildBudgetSummary = {
  base_amount: number;
  approved_total_period: number;
  allocation_total_period: number;
  bonus_total_period: number;
  penalty_total_period: number;
  advance_total_period: number;
  pending_advance_total_period: number;
  reimbursement_total_period?: number;
  pending_reimbursement_total_period?: number;
  lifetime_balance: number;
};

export type ChildBudget = {
  child: {
    id: number;
    name: string;
  };
  setting: BudgetSetting | null;
  period: {
    start: string;
    end: string;
    label: string;
  };
  summary: ChildBudgetSummary;
  transactions: BudgetTransaction[];
};

export type BudgetBoardPayload = {
  budget_enabled: boolean;
  currency: string;
  current_user: {
    id: number;
    role: BudgetRole;
  };
  children: ChildBudget[];
  pending_advance_requests: BudgetTransaction[];
};

export type PaymentBreakdown = {
  baseAmount: number;
  bonusTotal: number;
  penaltyTotal: number;
  approvedAdvanceToDeduct: number;
  pendingAdvance: number;
  alreadyPaid: number;
  totalExpected: number;
  remainingRaw: number;
  remainingToPay: number;
};

const WEEK_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export const toNumber = (rawValue: string): number | null => {
  const normalized = rawValue.replace(",", ".").trim();
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatMoney = (value: number, currency: string): string => {
  try {
    return new Intl.NumberFormat("fr-BE", {
      style: "currency",
      currency: (currency || "EUR").toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} EUR`;
  }
};

export const formatSignedMoney = (value: number, currency: string): string => {
  if (value === 0) {
    return formatMoney(0, currency);
  }
  const prefix = value > 0 ? "+" : "-";
  return `${prefix}${formatMoney(Math.abs(value), currency)}`;
};

export const formatDateTime = (iso: string | null): string => {
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("fr-BE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export const formatPeriod = (startIso: string, endIso: string): string => {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${startIso} - ${endIso}`;
  const startLabel = start.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit" });
  const endLabel = end.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit" });
  return `${startLabel} - ${endLabel}`;
};

export const recurrenceLabel = (recurrence: BudgetRecurrence): string => (recurrence === "monthly" ? "Mensuel" : "Hebdomadaire");

export const resetDayLabel = (recurrence: BudgetRecurrence, resetDay: number): string => {
  if (recurrence === "monthly") return `Jour ${resetDay}`;
  return WEEK_LABELS[Math.max(0, Math.min(6, resetDay - 1))] ?? `Jour ${resetDay}`;
};

export const transactionStatusLabel = (status: TransactionStatus): string => {
  if (status === "pending") return "En attente";
  if (status === "approved") return "Approuvée";
  return "Refusée";
};

export const computePaymentBreakdown = (child: ChildBudget): PaymentBreakdown => {
  const baseAmount = Number(child.setting?.base_amount ?? child.summary.base_amount ?? 0);
  const bonusTotal = Number(child.summary.bonus_total_period ?? 0);
  const penaltyTotal = Number(child.summary.penalty_total_period ?? 0);
  const approvedAdvanceToDeduct = Math.max(0, Number(child.summary.advance_total_period ?? 0));
  const pendingAdvance = Math.max(0, Number(child.summary.pending_advance_total_period ?? 0));
  const alreadyPaid = Math.max(0, Number(child.summary.allocation_total_period ?? 0));
  const totalExpected = baseAmount + bonusTotal + penaltyTotal - approvedAdvanceToDeduct;
  const remainingRaw = totalExpected - alreadyPaid;

  return {
    baseAmount,
    bonusTotal,
    penaltyTotal,
    approvedAdvanceToDeduct,
    pendingAdvance,
    alreadyPaid,
    totalExpected,
    remainingRaw,
    remainingToPay: remainingRaw > 0 ? remainingRaw : 0,
  };
};

