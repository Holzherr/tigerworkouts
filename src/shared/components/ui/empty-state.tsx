import { cn } from '@/shared/utils/ui-utils';
import { Button } from './button';

export interface EmptyStateProps {
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
  icon?: React.ReactNode;
  className?: string;
}

/** Centred grey copy for an empty list, with an optional icon above and one text action below. */
export const EmptyState = ({ title, body, action, icon, className }: EmptyStateProps) => (
  <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
    {icon && <div className="mb-2 text-faint [&_svg]:size-8">{icon}</div>}
    <div className="text-[14px] font-semibold text-body">{title}</div>
    {body && <div className="mt-1 max-w-[30ch] text-[13px] text-muted">{body}</div>}
    {action && (
      <Button variant="text" size="sm" onClick={action.onClick} className="mt-2">
        {action.label}
      </Button>
    )}
  </div>
);
