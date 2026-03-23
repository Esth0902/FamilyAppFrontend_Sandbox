import React from "react";

import { StepLayout } from "@/src/features/household-setup/components/StepLayout";

type StepNameProps = {
  stepIndex: number;
  totalSteps: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function StepName({ stepIndex, totalSteps, children, footer }: StepNameProps) {
  return (
    <StepLayout
      title="Nommer le foyer"
      subtitle="Donne un nom clair pour identifier facilement votre espace familial."
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      footer={footer}
    >
      {children}
    </StepLayout>
  );
}

