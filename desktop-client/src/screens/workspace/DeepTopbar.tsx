interface Props {
  strategyName: string;
  summaryLabel: string;
  onOptimize: () => void;
  isOptimizing: boolean;
  canOptimize: boolean;
}

export function DeepTopbar({ strategyName, summaryLabel, onOptimize, isOptimizing, canOptimize }: Props) {
  return (
    <div className="flex items-center justify-between h-14 px-5 bg-surface-secondary border-b border-border-subtle">
      <div className="flex items-baseline gap-3">
        <span className="font-heading font-semibold text-sm">{strategyName}</span>
        <span className="text-xs text-fg-secondary">{summaryLabel}</span>
      </div>
      <button
        onClick={onOptimize}
        disabled={isOptimizing || !canOptimize}
        className="px-3 py-1.5 rounded-md bg-accent-primary text-fg-inverse text-xs font-semibold disabled:opacity-50"
        title={canOptimize ? undefined : 'Strategy needs tunable params to optimize'}
      >
        {isOptimizing ? 'Optimizing…' : 'Optimize'}
      </button>
    </div>
  );
}
