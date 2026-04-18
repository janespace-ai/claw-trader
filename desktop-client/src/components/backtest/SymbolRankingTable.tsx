import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface RowData {
  symbol: string;
  return_pct: number;
  sharpe: number;
  max_drawdown: number;
  win_rate: number;
  total_trades: number;
}

interface Props {
  perSymbol: Record<string, any>;
  onSelect?: (symbol: string) => void;
}

type SortKey = keyof Omit<RowData, 'symbol'>;

export function SymbolRankingTable({ perSymbol, onSelect }: Props) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<SortKey>('return_pct');
  const [desc, setDesc] = useState(true);

  const rows = useMemo<RowData[]>(() => {
    return Object.entries(perSymbol).map(([symbol, m]: [string, any]) => ({
      symbol,
      return_pct: m?.all?.total_return ?? 0,
      sharpe: m?.all?.sharpe_ratio ?? 0,
      max_drawdown: m?.all?.max_drawdown ?? 0,
      win_rate: m?.all?.win_rate ?? 0,
      total_trades: m?.all?.total_trades ?? 0,
    }));
  }, [perSymbol]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => (desc ? b[sort] - a[sort] : a[sort] - b[sort]));
    return arr;
  }, [rows, sort, desc]);

  const handleSort = (key: SortKey) => {
    if (key === sort) setDesc(!desc);
    else {
      setSort(key);
      setDesc(true);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-[1fr_80px_80px_90px_80px_80px] gap-2 text-[10px] text-fg-muted border-b border-border-subtle px-1 py-2 font-medium">
        <Header>Symbol</Header>
        <Header active={sort === 'return_pct'} desc={desc} onClick={() => handleSort('return_pct')}>
          {t('metric.total_return')}
        </Header>
        <Header active={sort === 'sharpe'} desc={desc} onClick={() => handleSort('sharpe')}>
          {t('metric.sharpe_ratio')}
        </Header>
        <Header active={sort === 'max_drawdown'} desc={desc} onClick={() => handleSort('max_drawdown')}>
          {t('metric.max_drawdown')}
        </Header>
        <Header active={sort === 'win_rate'} desc={desc} onClick={() => handleSort('win_rate')}>
          {t('metric.win_rate')}
        </Header>
        <Header active={sort === 'total_trades'} desc={desc} onClick={() => handleSort('total_trades')}>
          {t('metric.total_trades')}
        </Header>
      </div>

      <div className="divide-y divide-border-subtle">
        {sorted.map((r) => (
          <button
            key={r.symbol}
            onClick={() => onSelect?.(r.symbol)}
            className="w-full grid grid-cols-[1fr_80px_80px_90px_80px_80px] gap-2 text-xs px-1 py-2 text-left hover:bg-surface-tertiary"
          >
            <div className="flex items-center gap-2">
              <span
                className={
                  'w-1.5 h-1.5 rounded-full ' +
                  (r.return_pct > 2
                    ? 'bg-accent-green'
                    : r.return_pct > 0
                      ? 'bg-accent-yellow'
                      : 'bg-accent-red')
                }
              />
              <span className="font-mono font-medium">{r.symbol}</span>
            </div>
            <span className={'font-mono text-right ' + (r.return_pct >= 0 ? 'text-accent-green' : 'text-accent-red')}>
              {r.return_pct >= 0 ? '+' : ''}
              {r.return_pct.toFixed(2)}%
            </span>
            <span className="font-mono text-right">{r.sharpe.toFixed(2)}</span>
            <span className="font-mono text-right text-fg-secondary">
              {r.max_drawdown.toFixed(2)}%
            </span>
            <span className="font-mono text-right">{r.win_rate.toFixed(0)}%</span>
            <span className="font-mono text-right text-fg-secondary">{r.total_trades}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Header({
  children,
  active,
  desc,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  desc?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'text-left hover:text-fg-primary ' +
        (active ? 'text-accent-primary' : '') +
        (onClick ? ' cursor-pointer' : ' cursor-default')
      }
    >
      {children}
      {active ? (desc ? ' ↓' : ' ↑') : ''}
    </button>
  );
}
