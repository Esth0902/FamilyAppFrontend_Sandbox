import React from "react";

import { StepLayout } from "@/src/features/household-setup/components/StepLayout";

type StepModulesProps = {
  stepIndex: number;
  totalSteps: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function StepModules({ stepIndex, totalSteps, children, footer }: StepModulesProps) {
  return (
    <StepLayout
      title="Choisir les modules"
      subtitle="Active uniquement les modules utiles au foyer pour garder une expérience claire."
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      footer={footer}
    >
      {children}
    </StepLayout>
  );
}

