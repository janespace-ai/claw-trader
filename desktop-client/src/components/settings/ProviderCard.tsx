import { useState } from 'react';
import type { Provider } from '@/types/domain';
import type { ProviderConfig } from '@/stores/settingsStore';

interface Props {
  provider: Provider;
  config: ProviderConfig;
  isDefault: boolean;
  onChange: (patch: Partial<ProviderConfig>) => void;
  onSetDefault: () => void;
}

/** Matches Pencil primitive `IjMN8` (ProviderCard). */
export function ProviderCard({ provider, config, isDefault, onChange, onSetDefault }: Props) {
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="bg-surface-secondary rounded-lg p-3 space-y-2 border border-border-subtle">
      <div className="flex items-center gap-2">
        <input
          type="radio"
          checked={isDefault}
          onChange={onSetDefault}
          aria-label={`Make ${provider} default`}
        />
        <span className="font-heading font-semibold text-xs capitalize">{provider}</span>
        {isDefault && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[color:var(--accent-primary-dim)] text-accent-primary">
            default
          </span>
        )}
      </div>
      <div className="grid grid-cols-[1fr_160px] gap-2 items-center">
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={config.apiKey}
            onChange={(e) => onChange({ apiKey: e.target.value })}
            placeholder="API key"
            className="w-full bg-surface-primary rounded-md px-3 py-1.5 text-xs font-mono pr-10"
          />
          <button
            onClick={() => setShowKey((v) => !v)}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-fg-muted hover:text-fg-primary"
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
        <input
          type="text"
          value={config.model}
          onChange={(e) => onChange({ model: e.target.value })}
          placeholder="model"
          className="bg-surface-primary rounded-md px-3 py-1.5 text-xs font-mono"
        />
      </div>
      {config.baseURL !== undefined && (
        <input
          type="text"
          value={config.baseURL ?? ''}
          onChange={(e) => onChange({ baseURL: e.target.value || undefined })}
          placeholder="Custom base URL (optional)"
          className="w-full bg-surface-primary rounded-md px-3 py-1.5 text-xs font-mono"
        />
      )}
    </div>
  );
}
