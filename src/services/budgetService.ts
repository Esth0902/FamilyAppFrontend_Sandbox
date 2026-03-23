import { apiFetch } from "@/src/api/client";
import type { BudgetBoardPayload } from "@/src/budget/common";

type FetchBudgetBoardOptions = {
  bypassCache?: boolean;
};

export const fetchBudgetBoard = async (
  options?: FetchBudgetBoardOptions
): Promise<BudgetBoardPayload> => {
  return (await apiFetch("/budget/board", {
    cacheTtlMs: 20_000,
    bypassCache: options?.bypassCache === true,
  })) as BudgetBoardPayload;
};
