import { apiFetch } from "@/src/api/client";
import type { BudgetBoardPayload } from "@/src/budget/common";

export const fetchBudgetBoard = async (): Promise<BudgetBoardPayload> => {
  return (await apiFetch("/budget/board")) as BudgetBoardPayload;
};
