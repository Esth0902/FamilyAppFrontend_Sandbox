import { useCallback, useMemo, useState } from "react";

export type HouseholdSetupStepKey = "name" | "modules" | "children";

type UseHouseholdSetupFlowParams = {
  enabled: boolean;
  initialStep?: HouseholdSetupStepKey;
  steps?: HouseholdSetupStepKey[];
};

const DEFAULT_STEPS: HouseholdSetupStepKey[] = ["name", "modules", "children"];

export function useHouseholdSetupFlow({
  enabled,
  initialStep = "name",
  steps = DEFAULT_STEPS,
}: UseHouseholdSetupFlowParams) {
  const flowSteps = useMemo(() => {
    const normalized = steps.length > 0 ? steps : DEFAULT_STEPS;
    return [...new Set(normalized)];
  }, [steps]);

  const safeInitialStep = useMemo(() => {
    if (flowSteps.includes(initialStep)) {
      return initialStep;
    }
    return flowSteps[0] ?? "name";
  }, [flowSteps, initialStep]);

  const [currentStep, setCurrentStep] = useState<HouseholdSetupStepKey>(safeInitialStep);

  const currentStepIndex = useMemo(() => {
    return Math.max(0, flowSteps.indexOf(currentStep));
  }, [currentStep, flowSteps]);

  const totalSteps = flowSteps.length;
  const isFirstStep = currentStepIndex <= 0;
  const isLastStep = currentStepIndex >= totalSteps - 1;

  const goToStep = useCallback(
    (step: HouseholdSetupStepKey) => {
      if (!enabled) {
        return;
      }
      if (!flowSteps.includes(step)) {
        return;
      }
      setCurrentStep(step);
    },
    [enabled, flowSteps]
  );

  const nextStep = useCallback(() => {
    if (!enabled) {
      return;
    }
    setCurrentStep((prev) => {
      const index = flowSteps.indexOf(prev);
      if (index < 0 || index >= flowSteps.length - 1) {
        return prev;
      }
      return flowSteps[index + 1];
    });
  }, [enabled, flowSteps]);

  const previousStep = useCallback(() => {
    if (!enabled) {
      return;
    }
    setCurrentStep((prev) => {
      const index = flowSteps.indexOf(prev);
      if (index <= 0) {
        return prev;
      }
      return flowSteps[index - 1];
    });
  }, [enabled, flowSteps]);

  const resetStep = useCallback(() => {
    setCurrentStep(safeInitialStep);
  }, [safeInitialStep]);

  return {
    steps: flowSteps,
    currentStep,
    currentStepIndex,
    totalSteps,
    isFirstStep,
    isLastStep,
    goToStep,
    nextStep,
    previousStep,
    resetStep,
  };
}

