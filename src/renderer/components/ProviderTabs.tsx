import type { ExamConfig } from '@/types/exam';

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
    <div className="ouchn-tabs" role="tablist" aria-label="AI Provider">
      {PROVIDERS.map((provider) => (
        <button
          aria-selected={activeProvider === provider.value}
          className={`ouchn-tab${activeProvider === provider.value ? ' active' : ''}`}
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
