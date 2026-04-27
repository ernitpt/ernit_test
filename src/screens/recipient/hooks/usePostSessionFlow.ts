import { useState, useRef, useCallback } from 'react';
import type { CTADecision } from '../../../services/CTAService';

export type PostSessionFlowStep =
  | 'idle'
  | 'media'
  | 'hint'
  | 'celebration'
  | 'discovery'
  | 'reveal'
  | 'cta';

export interface PostSessionFlowData {
  hasHint?: boolean;
  needsDiscoveryQuiz?: boolean;
  needsReveal?: boolean;
  ctaDecision?: CTADecision | null;
}

/**
 * State machine for the post-session modal flow in DetailedGoalCard.
 * Replaces the previous chained setTimeout + 6 boolean useState pattern so
 * the sequence is inspectable, interruptible, and leak-free.
 *
 * Canonical sequence:
 *   media? → hint? → celebration → discovery? → reveal? → cta? → idle
 *
 * Each step that's not applicable (falsy flag) is skipped. Every modal's
 * onClose calls advance() — the hook decides what comes next based on
 * the data passed to startCelebrationFlow.
 */
export function usePostSessionFlow() {
  const [step, setStep] = useState<PostSessionFlowStep>('idle');
  const [ctaDecision, setCTADecisionState] = useState<CTADecision | null>(null);
  const dataRef = useRef<PostSessionFlowData>({});

  const openMediaPrompt = useCallback(() => setStep('media'), []);

  // Jump straight to the reveal modal (used by the goal-completion path where the
  // normal media → hint → celebration sequence is skipped in favor of AchievementDetail).
  const openReveal = useCallback(() => setStep('reveal'), []);

  const startCelebrationFlow = useCallback((data: PostSessionFlowData) => {
    dataRef.current = data;
    if (data.ctaDecision) setCTADecisionState(data.ctaDecision);
    setStep(data.hasHint ? 'hint' : 'celebration');
  }, []);

  const advance = useCallback(() => {
    setStep(prev => {
      const data = dataRef.current;
      switch (prev) {
        case 'media':
          return 'idle';
        case 'hint':
          return 'celebration';
        case 'celebration':
          if (data.needsDiscoveryQuiz) return 'discovery';
          if (data.needsReveal) return 'reveal';
          if (data.ctaDecision) return 'cta';
          return 'idle';
        case 'discovery':
          if (data.needsReveal) return 'reveal';
          if (data.ctaDecision) return 'cta';
          return 'idle';
        case 'reveal':
          if (data.ctaDecision) return 'cta';
          return 'idle';
        case 'cta':
        default:
          return 'idle';
      }
    });
  }, []);

  const setCTADecision = useCallback((decision: CTADecision | null) => {
    dataRef.current = { ...dataRef.current, ctaDecision: decision };
    setCTADecisionState(decision);
  }, []);

  // Late-arriving reveal decision. The discovery quiz can match an experience
  // mid-flow (inside onAnswer), after which the flow should route to 'reveal'
  // on the next advance instead of skipping it. Patches the frozen snapshot
  // in dataRef so the switch in advance() picks it up.
  const setNeedsReveal = useCallback((val: boolean) => {
    dataRef.current = { ...dataRef.current, needsReveal: val };
  }, []);

  const dismiss = useCallback(() => {
    dataRef.current = {};
    setCTADecisionState(null);
    setStep('idle');
  }, []);

  return {
    step,
    ctaDecision,
    openMediaPrompt,
    openReveal,
    startCelebrationFlow,
    advance,
    setCTADecision,
    setNeedsReveal,
    dismiss,
  };
}
