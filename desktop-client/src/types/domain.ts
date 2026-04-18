// Shared domain types for renderer code.

export type Provider = 'openai' | 'deepseek' | 'kimi' | 'anthropic' | 'google';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  ts?: number;
}

export interface Strategy {
  id: string;
  name: string;
  type: 'strategy' | 'screener';
  code: string;
  description: string | null;
  status: 'active' | 'inactive';
  is_favorite: boolean;
  tags: string[];
  version: number;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  messages: ChatMessage[];
  strategy_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BacktestConfig {
  symbols: string[];
  interval: string;
  from: string;
  to: string;
  initial_capital: number;
  commission: number;
  slippage: number;
  fill_mode: 'close' | 'next_open';
}

export interface Metrics {
  total_return: number;
  annualized_return: number;
  max_drawdown: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  win_rate: number;
  profit_factor: number;
  total_trades: number;
  [key: string]: number;
}

export interface MetricsSet {
  all: Metrics;
  long: Metrics;
  short: Metrics;
}

export interface EquityPoint {
  ts: string;
  equity: number;
}

export interface DrawdownPoint {
  ts: string;
  drawdown: number;
}

export interface Trade {
  symbol: string;
  side: 'long' | 'short';
  entry_time: string;
  exit_time: string;
  entry_price: number;
  exit_price: number;
  size: number;
  leverage: number;
  pnl: number;
  return_pct: number;
  commission: number;
  duration_hours: number;
}

export interface BacktestResultRecord {
  id: string;
  strategy_id: string;
  type: 'preview' | 'full';
  symbols: string[];
  config: BacktestConfig;
  summary_metrics: MetricsSet | null;
  per_symbol_metrics: Record<string, MetricsSet> | null;
  equity_curve: EquityPoint[] | null;
  trades: Trade[] | null;
  remote_task_id: string | null;
  created_at: string;
}

export interface CoinListRecord {
  id: string;
  name: string | null;
  symbols: string[];
  screener_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScreenerRowResult {
  symbol: string;
  passed: boolean;
  score: number;
  rank?: number | null;
  error?: string;
}
