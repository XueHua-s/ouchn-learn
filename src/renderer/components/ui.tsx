import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/renderer/lib/utils';

type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'success' | 'warning' | 'destructive';
type ButtonSize = 'default' | 'sm' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize;
  variant?: ButtonVariant;
}

const buttonVariants: Record<ButtonVariant, string> = {
  default: 'bg-teal-700 text-white shadow-sm hover:bg-teal-800',
  destructive: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950',
  outline: 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-950',
  secondary: 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-950',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
  warning: 'bg-amber-500 text-slate-950 shadow-sm hover:bg-amber-600',
};

const buttonSizes: Record<ButtonSize, string> = {
  default: 'h-10 px-3 py-2 text-sm',
  icon: 'h-8 w-8 p-0',
  sm: 'h-9 px-3 py-2 text-xs',
};

export function Button({ className, size = 'default', type = 'button', variant = 'default', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex w-full items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        'cursor-pointer border border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      type={type}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-950 shadow-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'flex min-h-16 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-xs font-medium text-slate-700', className)} {...props} />;
}

interface PanelSectionProps {
  action?: ReactNode;
  children: ReactNode;
  description?: string;
  icon?: ReactNode;
  title: string;
}

export function PanelSection({ action, children, description, icon, title }: PanelSectionProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {icon ? (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-teal-700 shadow-sm">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold text-slate-950">{title}</h4>
            {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

interface FieldRowProps {
  children: ReactNode;
  label: string;
}

export function FieldRow({ children, label }: FieldRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      {children}
    </div>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600',
        className,
      )}
    >
      {children}
    </span>
  );
}
