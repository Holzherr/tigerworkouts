import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/shared/utils/ui-utils';

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
}

export interface DropdownProps<T extends string = string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly DropdownOption<T>[];
  size?: 'md' | 'sm';
  'aria-label'?: string;
  className?: string;
}

/**
 * Single-choice select styled as a bordered pill with a small caret: bold current value, opens a
 * native-feeling menu (Radix Select). Used for units and modes (seconds / reps / minutes), never
 * for long lists; those get the searchable picker sheet.
 */
export const Dropdown = <T extends string>({ value, onValueChange, options, size = 'md', className, 'aria-label': ariaLabel }: DropdownProps<T>) => (
  <Select.Root value={value} onValueChange={v => onValueChange(v as T)}>
    <Select.Trigger
      aria-label={ariaLabel}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-control border border-line bg-surface pr-2.5 pl-3 font-bold whitespace-nowrap text-ink focus-visible:outline-2 focus-visible:outline-brand data-[state=open]:border-hint',
        size === 'sm' ? 'h-9 text-[14px]' : 'h-11 text-[15px]',
        className
      )}
    >
      <Select.Value />
      <Select.Icon className="text-faint">
        <ChevronDown className="size-4" />
      </Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content position="popper" sideOffset={6} align="end" className="z-50 min-w-36 overflow-hidden rounded-tile border border-line bg-surface p-1 shadow-lift">
        <Select.Viewport>
          {options.map(o => (
            <Select.Item
              key={o.value}
              value={o.value}
              className="flex h-11 cursor-pointer items-center justify-between gap-3 rounded-control px-3 text-[15px] font-semibold text-ink outline-none select-none data-[highlighted]:bg-line-soft data-[state=checked]:text-brand-ink"
            >
              <Select.ItemText>{o.label}</Select.ItemText>
              <Select.ItemIndicator>
                <Check className="size-4" />
              </Select.ItemIndicator>
            </Select.Item>
          ))}
        </Select.Viewport>
      </Select.Content>
    </Select.Portal>
  </Select.Root>
);
