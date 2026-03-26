import type { QueryClient } from "@tanstack/react-query";

let globalQueryClient: QueryClient | null = null;

export const setGlobalQueryClient = (client: QueryClient | null): void => {
  globalQueryClient = client;
};

export const clearGlobalQueryClient = async (): Promise<void> => {
  if (!globalQueryClient) {
    return;
  }

  await globalQueryClient.cancelQueries();
  globalQueryClient.clear();
};
