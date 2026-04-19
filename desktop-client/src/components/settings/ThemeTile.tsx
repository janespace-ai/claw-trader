interface Props {
  value: 'auto' | 'dark' | 'light';
  selected: boolean;
  label: string;
  onClick: () => void;
}

function PreviewSwatch({ kind }: { kind: 'auto' | 'dark' | 'light' }) {
  if (kind === 'auto') {
    return (
      <div className="w-full h-14 rounded-md overflow-hidden flex">
        <div className="flex-1 bg-[#111827]" />
        <div className="flex-1 bg-[#f9fafb]" />
      </div>
    );
  }
  if (kind === 'dark') {
    return <div className="w-full h-14 rounded-md bg-[#111827] border border-[#1f2937]" />;
  }
  return <div className="w-full h-14 rounded-md bg-[#f9fafb] border border-[#e5e7eb]" />;
}

export function ThemeTile({ value, selected, label, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={
        'flex flex-col gap-2 p-3 rounded-lg border transition-colors ' +
        (selected
          ? 'border-accent-primary bg-[color:var(--accent-primary-dim)]'
          : 'border-border-subtle bg-surface-secondary hover:border-accent-primary-dim')
      }
    >
      <PreviewSwatch kind={value} />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
