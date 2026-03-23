import { useCallback, useEffect } from "react";
import { useFocusEffect } from "expo-router";

import { subscribeToHouseholdRealtime } from "@/src/realtime/client";

type RefreshOptions = {
  silent?: boolean;
  bypassCache?: boolean;
};

type UseRealtimeRefetchArgs = {
  householdId: number | null;
  module: string;
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
  const focusSilent = focusOptions?.silent;
  const focusBypassCache = focusOptions?.bypassCache;
  const realtimeSilent = realtimeOptions?.silent;
  const realtimeBypassCache = realtimeOptions?.bypassCache;

  useFocusEffect(
    useCallback(() => {
      const options = focusSilent === undefined && focusBypassCache === undefined
        ? undefined
        : { silent: focusSilent, bypassCache: focusBypassCache };
      void refresh(options);
    }, [focusBypassCache, focusSilent, refresh])
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
        if (message?.module !== module) return;
        const options = realtimeSilent === undefined && realtimeBypassCache === undefined
          ? undefined
          : { silent: realtimeSilent, bypassCache: realtimeBypassCache };
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
  }, [enabled, householdId, module, realtimeBypassCache, realtimeSilent, refresh]);
};
