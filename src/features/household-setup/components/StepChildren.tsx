import React from "react";

import { StepLayout } from "@/src/features/household-setup/components/StepLayout";

type StepChildrenProps = {
  stepIndex: number;
  totalSteps: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function StepChildren({ stepIndex, totalSteps, children, footer }: StepChildrenProps) {
  return (
    <StepLayout
      title="Ajouter les membres"
      subtitle="Ajoute les enfants et parents du foyer avant de finaliser la configuration."
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      footer={footer}
    >
      {children}
    </StepLayout>
  );
}

