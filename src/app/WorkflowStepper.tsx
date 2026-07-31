"use client";

import { KeyboardEvent, useRef } from "react";

import styles from "./page.module.css";

export type WorkflowStepId = "load" | "create" | "done";

type WorkflowStep = {
  id: WorkflowStepId;
  label: string;
  summary?: string;
};

type WorkflowStepperProps = {
  activeStep: WorkflowStepId;
  availableSteps: WorkflowStepId[];
  onStepChange: (step: WorkflowStepId) => void;
  steps: WorkflowStep[];
};

export function WorkflowStepper({
  activeStep,
  availableSteps,
  onStepChange,
  steps,
}: WorkflowStepperProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const availableIndexes = steps
      .map((step, index) => (availableSteps.includes(step.id) ? index : -1))
      .filter((index) => index >= 0);
    const currentAvailableIndex = availableIndexes.indexOf(currentIndex);
    const targetIndex =
      event.key === "Home"
        ? availableIndexes[0]
        : event.key === "End"
          ? availableIndexes.at(-1)
          : event.key === "ArrowRight"
            ? availableIndexes[Math.min(currentAvailableIndex + 1, availableIndexes.length - 1)]
            : availableIndexes[Math.max(currentAvailableIndex - 1, 0)];

    if (targetIndex !== undefined) {
      buttonRefs.current[targetIndex]?.focus();
    }
  }

  return (
    <nav className={styles.stepper} aria-label="Setlist playlist progress">
      <ol>
        {steps.map((step, index) => {
          const isAvailable = availableSteps.includes(step.id);
          const isActive = activeStep === step.id;
          const isComplete = isAvailable && !isActive;

          return (
            <li
              className={
                isActive
                  ? styles.stepActive
                  : isComplete
                    ? styles.stepComplete
                    : styles.stepLocked
              }
              key={step.id}
            >
              <button
                aria-current={isActive ? "step" : undefined}
                disabled={!isAvailable}
                ref={(element) => {
                  buttonRefs.current[index] = element;
                }}
                type="button"
                onClick={() => onStepChange(step.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                <span>{index + 1}</span>
                <span>
                  <strong>{step.label}</strong>
                  {step.summary ? <small>{step.summary}</small> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
