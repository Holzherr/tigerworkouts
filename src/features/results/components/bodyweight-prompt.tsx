import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Stepper } from '@/shared/components/ui/stepper';
import { cn } from '@/shared/utils/ui-utils';

export interface BodyweightPromptProps {
  onSave: (kg: number) => void;
  onSkip: () => void;
  className?: string;
}

/**
 * Asked once, under the calorie estimate, until answered or skipped: a white row with
 * "Your bodyweight (kg)" and a grey line saying why, a stepper starting at the 80 kg the estimate
 * assumes, then Save in coral text and Skip in grey.
 */
export const BodyweightPrompt = ({ onSave, onSkip, className }: BodyweightPromptProps) => {
  const [kg, setKg] = useState(80);
  return (
    <div className={cn('rounded-card border border-line bg-surface px-3 py-2', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold">Your bodyweight (kg)</div>
          <div className="text-[12px] text-muted">Calories assume 80 kg until you say.</div>
        </div>
        <Stepper size="sm" aria-label="Bodyweight" value={kg} min={30} max={250} step={0.5} onChange={setKg} />
      </div>
      <div className="mt-1 flex justify-end gap-1">
        <Button variant="quiet" size="sm" onClick={onSkip}>
          Skip
        </Button>
        <Button variant="text" size="sm" onClick={() => onSave(kg)}>
          Save
        </Button>
      </div>
    </div>
  );
};
