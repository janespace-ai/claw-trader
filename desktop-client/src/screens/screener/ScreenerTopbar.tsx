interface Props {
  strategyName: string | null;
  status: 'idle' | 'pending' | 'running' | 'complete' | 'failed';
  interval: '1h' | '4h' | '1d';
  onIntervalChange: (iv: '1h' | '4h' | '1d') => void;
  onRun: () => void;
  onOpenSaved: () => void;
}

const INTERVALS: Array<Props['interval']> = ['1h', '4h', '1d'];

export function ScreenerTopbar({
  strategyName,
  status,
  interval,
  onIntervalChange,
  onRun,
  onOpenSaved,
}: Props) {
  const running = status === 'pending' || status === 'running';
  return (
    <div className="flex items-center justify-between h-14 px-5 bg-surface-secondary border-b border-border-subtle">
      <div className="flex items-baseline gap-3">
        <span className="font-heading font-semibold text-sm">Screener</span>
        <span className="text-xs text-fg-secondary">
          {strategyName ? `Using ${strategyName}` : 'No screener strategy selected'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex bg-surface-tertiary rounded-md p-0.5 text-[11px]">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              onClick={() => onIntervalChange(iv)}
              className={
                'px-2 py-1 rounded-sm ' +
                (interval === iv ? 'bg-surface-primary text-fg-primary' : 'text-fg-secondary hover:text-fg-primary')
              }
            >
              {iv}
            </button>
          ))}
        </div>
        <button
          onClick={onOpenSaved}
          className="px-3 py-1.5 text-xs rounded-md bg-surface-tertiary hover:bg-surface-primary"
        >
          Saved lists
        </button>
        <button
          onClick={onRun}
          disabled={running || !strategyName}
          className="px-3 py-1.5 rounded-md bg-accent-primary text-fg-inverse text-xs font-semibold disabled:opacity-50"
          title={strategyName ? undefined : 'Pick a screener strategy first'}
        >
          {running ? 'Running…' : 'Run screener'}
        </button>
      </div>
    </div>
  );
}
