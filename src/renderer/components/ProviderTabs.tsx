import type { ExamConfig } from '@/types/exam';
import { cn } from '@/renderer/lib/utils';

interface ProviderTabsProps {
  activeProvider: ExamConfig['provider'];
  onChange: (provider: ExamConfig['provider']) => void;
}

const PROVIDERS: Array<{ label: string; value: ExamConfig['provider'] }> = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Claude', value: 'claude' },
];

export function ProviderTabs({ activeProvider, onChange }: ProviderTabsProps) {
  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1"
      role="tablist"
      aria-label="AI Provider"
    >
      {PROVIDERS.map((provider) => (
        <button
          aria-selected={activeProvider === provider.value}
          className={cn(
            'inline-flex h-9 items-center justify-center rounded-md text-xs font-medium transition-colors',
            'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700',
            activeProvider === provider.value
              ? 'bg-white text-slate-950 shadow-sm'
              : 'text-slate-600 hover:bg-white hover:text-slate-950',
          )}
          key={provider.value}
          onClick={() => onChange(provider.value)}
          role="tab"
          type="button"
        >
          {provider.label}
        </button>
      ))}
    </div>
  );
}
