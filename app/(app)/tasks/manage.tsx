import React, { useMemo } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";

type TaskModuleKey = "planned" | "schedule" | "routines";

const isTaskModuleKey = (value: unknown): value is TaskModuleKey =>
  value === "planned" || value === "schedule" || value === "routines";

export default function ManageTasksLegacyRedirect() {
  const params = useLocalSearchParams<{ module?: string | string[] }>();

  const target = useMemo(() => {
    const raw = Array.isArray(params.module) ? params.module[0] : params.module;
    if (!isTaskModuleKey(raw)) {
      return "/tasks/planned" as const;
    }
    if (raw === "schedule") {
      return "/tasks/schedule" as const;
    }
    if (raw === "routines") {
      return "/tasks/routines" as const;
    }
    return "/tasks/planned" as const;
  }, [params.module]);

  return <Redirect href={target as any} />;
}
