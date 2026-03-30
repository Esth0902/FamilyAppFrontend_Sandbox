import { useCallback, useEffect, useMemo } from "react";
import { useFocusEffect } from "expo-router";

import { subscribeToHouseholdRealtime } from "@/src/realtime/client";

type RefreshOptions = {
  silent?: boolean;
};

type UseRealtimeRefetchArgs = {
  householdId: number | null;
  module: string | string[];
  refresh: (options?: RefreshOptions) => Promise<unknown> | void;
  focusOptions?: RefreshOptions;
  realtimeOptions?: RefreshOptions;
  enabled?: boolean;
};

export const useRealtimeRefetch = ({
  householdId,
  module,
  refresh,
  focusOptions,
  realtimeOptions,
  enabled = true,
}: UseRealtimeRefetchArgs) => {
  const modules = useMemo(() => (Array.isArray(module) ? module : [module]), [module]);
  const focusSilent = focusOptions?.silent;
  const realtimeSilent = realtimeOptions?.silent;

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        return;
      }
      const options = focusSilent === undefined ? undefined : { silent: focusSilent };
      void refresh(options);
    }, [enabled, focusSilent, refresh])
  );

  useEffect(() => {
    if (!enabled || !householdId) {
      return;
    }

    let unsubscribeRealtime: (() => void) | null = null;
    let active = true;

    const bindRealtime = async () => {
      unsubscribeRealtime = await subscribeToHouseholdRealtime(householdId, (message) => {
        if (!active) return;
        const messageModule = String(message?.module ?? "");
        if (!modules.includes(messageModule)) return;
        const options = realtimeSilent === undefined ? undefined : { silent: realtimeSilent };
        void refresh(options);
      });
    };

    void bindRealtime();

    return () => {
      active = false;
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
      }
    };
  }, [enabled, householdId, modules, realtimeSilent, refresh]);
};
