export type MarketStatus = 'NOT_STARTED' | 'LIVE' | 'PAUSED' | 'ENDED';

export interface EventState {
  id: number;
  name: string;
  status: MarketStatus;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  starting_trader_corpus?: number;
}

export interface Security {
  id: number;
  event_id: number;
  name: string;
  symbol: string;
  base_price: number;
  initial_ltp: number;
  current_ltp: number;
  accumulated_trade_value: number;
  threshold_amount: number;
  last_trade_price: number | null;
  last_ltp_update_at: string | null;
  is_active: number;
  lower_circuit: number;
  upper_circuit: number;
  absolute_change?: number;
  percentage_change?: number;
  remaining_threshold?: number;
  threshold_progress_pct?: number;
}

export interface Trade {
  id: number;
  event_id: number;
  buyer_id: string;
  seller_id: string;
  security_id: number;
  security_name?: string;
  security_symbol?: string;
  price: number;
  quantity: number;
  total_value: number;
  os_status: string;
  executed_at: string;
  triggered_ltp_update: number;
  previous_ltp: number | null;
  new_ltp: number | null;
  audit_id?: string;
  desk_id?: string;
  entered_by?: string;
}

export interface MarketEvent {
  id: number;
  event_id: number;
  security_id: number;
  security_name: string;
  security_symbol: string;
  previous_ltp: number;
  new_ltp: number;
  absolute_change: number;
  percentage_change: number;
  created_at: string;
}

export interface EventStats {
  total_trades: number;
  total_ltp_changes: number;
}
