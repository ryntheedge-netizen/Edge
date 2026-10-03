export const schemaSql = `-- EDGE PostgreSQL Schema

CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED', 'LIVE', 'PAUSED', 'ENDED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    starting_trader_corpus NUMERIC(15,2) NOT NULL DEFAULT 2000000.00,
    threshold_amount NUMERIC(15,2) NOT NULL DEFAULT 100000.00,
    penalty_percentage NUMERIC(5,2) NOT NULL DEFAULT 20.00
);

CREATE TABLE IF NOT EXISTS securities (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    base_price NUMERIC(15,2) NOT NULL DEFAULT 100.00,
    initial_ltp NUMERIC(15,2) NOT NULL,
    current_ltp NUMERIC(15,2) NOT NULL,
    accumulated_trade_value NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    threshold_amount NUMERIC(15,2) NOT NULL DEFAULT 100000.00,
    lower_circuit NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    upper_circuit NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    last_trade_price NUMERIC(15,2),
    last_ltp_update_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    buyer_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    security_id INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
    price NUMERIC(15,2) NOT NULL,
    quantity INTEGER NOT NULL,
    total_value NUMERIC(15,2) NOT NULL,
    os_status TEXT NOT NULL DEFAULT 'OPEN',
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    entered_by TEXT DEFAULT 'ADMIN',
    desk_id TEXT,
    triggered_ltp_update BOOLEAN NOT NULL DEFAULT false,
    previous_ltp NUMERIC(15,2),
    new_ltp NUMERIC(15,2),
    trade_status TEXT DEFAULT 'VALID',
    idempotency_key TEXT UNIQUE,
    audit_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS scrap_trades (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    buyer_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    security_id INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
    price NUMERIC(15,2) NOT NULL,
    quantity INTEGER NOT NULL,
    total_value NUMERIC(15,2) NOT NULL,
    os_status TEXT NOT NULL DEFAULT 'OPEN',
    attempted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    entered_by TEXT DEFAULT 'ADMIN',
    desk_id TEXT
);

CREATE TABLE IF NOT EXISTS market_events (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    security_id INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
    previous_ltp NUMERIC(15,2) NOT NULL,
    new_ltp NUMERIC(15,2) NOT NULL,
    absolute_change NUMERIC(15,2) NOT NULL,
    percentage_change NUMERIC(15,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    actor TEXT NOT NULL DEFAULT 'ADMIN',
    desk_id TEXT,
    action TEXT NOT NULL,
    metadata TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS traders (
    id SERIAL PRIMARY KEY,
    trader_identifier TEXT NOT NULL,
    name TEXT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    starting_corpus NUMERIC(15,2) NOT NULL,
    current_cash_balance NUMERIC(15,2) NOT NULL,
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trader_identifier, event_id)
);

CREATE TABLE IF NOT EXISTS trader_holdings (
    id SERIAL PRIMARY KEY,
    trader_id INTEGER NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
    security_id INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trader_id, security_id)
);

CREATE TABLE IF NOT EXISTS acquisition_lots (
    id SERIAL PRIMARY KEY,
    trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    trader_id TEXT NOT NULL,
    security_id INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
    original_quantity INTEGER NOT NULL,
    remaining_quantity INTEGER NOT NULL,
    acquisition_price NUMERIC(15,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settlement_records (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    trader_id INTEGER NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
    security_id INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    final_market_ltp NUMERIC(15,2) NOT NULL,
    penalty_percentage NUMERIC(5,2) NOT NULL,
    settlement_price NUMERIC(15,2) NOT NULL,
    settlement_value NUMERIC(15,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobbers (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    jobber_identifier TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, jobber_identifier)
);

CREATE TABLE IF NOT EXISTS jobber_inventory (
    id SERIAL PRIMARY KEY,
    jobber_id INTEGER NOT NULL REFERENCES jobbers(id) ON DELETE CASCADE,
    security_id INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
    assigned_quantity INTEGER NOT NULL DEFAULT 0,
    remaining_quantity INTEGER NOT NULL DEFAULT 0,
    assigned_price NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(jobber_id, security_id)
);

CREATE TABLE IF NOT EXISTS brokers (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    broker_identifier TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, broker_identifier)
);

CREATE TABLE IF NOT EXISTS broker_inventory (
    id SERIAL PRIMARY KEY,
    broker_id INTEGER NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
    security_id INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
    assigned_quantity INTEGER NOT NULL DEFAULT 0,
    remaining_quantity INTEGER NOT NULL DEFAULT 0,
    assigned_price NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(broker_id, security_id)
);

CREATE TABLE IF NOT EXISTS active_desks (
    desk_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'AVAILABLE',
    session_token TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_securities_event ON securities(event_id);
CREATE INDEX IF NOT EXISTS idx_trades_event ON trades(event_id);
CREATE INDEX IF NOT EXISTS idx_trades_security ON trades(security_id);
CREATE INDEX IF NOT EXISTS idx_trades_executed ON trades(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_events_event ON market_events(event_id);
CREATE INDEX IF NOT EXISTS idx_market_events_created ON market_events(created_at DESC);

-- ==========================================
-- EDGE PLATFORM & ATTENDANCE MODULE SCHEMA
-- ==========================================

CREATE TABLE IF NOT EXISTS edge_teams (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    team_code TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS edge_participants (
    id SERIAL PRIMARY KEY,
    participant_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    contact TEXT,
    team_id INTEGER REFERENCES edge_teams(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS edge_activities (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS edge_event_participations (
    participant_id INTEGER NOT NULL REFERENCES edge_participants(id) ON DELETE CASCADE,
    activity_id INTEGER NOT NULL REFERENCES edge_activities(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (participant_id, activity_id)
);

CREATE TABLE IF NOT EXISTS attendance_stages (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    stage_type TEXT NOT NULL CHECK(stage_type IN ('GENERAL', 'EVENT')),
    day INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED', 'ACTIVE', 'FINALIZED', 'REOPENED')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_stations (
    id SERIAL PRIMARY KEY,
    station_identifier TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    stage_id INTEGER NOT NULL REFERENCES attendance_stages(id) ON DELETE CASCADE,
    activity_id INTEGER REFERENCES edge_activities(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED', 'ACTIVE', 'STOPPED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id SERIAL PRIMARY KEY,
    participant_id INTEGER NOT NULL REFERENCES edge_participants(id) ON DELETE CASCADE,
    stage_id INTEGER NOT NULL REFERENCES attendance_stages(id) ON DELETE CASCADE,
    activity_id INTEGER REFERENCES edge_activities(id) ON DELETE CASCADE,
    station_id INTEGER REFERENCES attendance_stations(id) ON DELETE SET NULL,
    attendance_method TEXT NOT NULL CHECK(attendance_method IN ('QR', 'MANUAL')),
    marked_by TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(participant_id, stage_id, activity_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_attendance_general ON attendance_records (participant_id, stage_id) WHERE activity_id IS NULL;

CREATE TABLE IF NOT EXISTS attendance_snapshots (
    id SERIAL PRIMARY KEY,
    stage_id INTEGER NOT NULL REFERENCES attendance_stages(id) ON DELETE CASCADE,
    expected_count INTEGER NOT NULL,
    present_count INTEGER NOT NULL,
    absent_count INTEGER NOT NULL,
    finalized_by TEXT NOT NULL,
    finalized_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_audit_logs (
    id SERIAL PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    metadata TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_participant ON attendance_records(participant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_stage ON attendance_records(stage_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_activity ON attendance_records(activity_id);
CREATE TABLE IF NOT EXISTS edge_id_templates (
    id SERIAL PRIMARY KEY,
    image_data TEXT NOT NULL,
    config_data TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- AUCTION MODULE SCHEMA
-- ==========================================

CREATE TABLE IF NOT EXISTS auction_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED', 'RUNNING', 'PAUSED', 'ENDED')),
    total_sales_counter INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auction_master_envelopes (
    id SERIAL PRIMARY KEY,
    envelope_code TEXT NOT NULL UNIQUE,
    envelope_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auction_securities (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    return_pct NUMERIC(15,4) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auction_traders (
    id SERIAL PRIMARY KEY,
    trader_id TEXT NOT NULL UNIQUE,
    starting_corpus NUMERIC(15,2) NOT NULL DEFAULT 2000000.00,
    is_frozen BOOLEAN NOT NULL DEFAULT false,
    freeze_start_sales INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auction_bids (
    id SERIAL PRIMARY KEY,
    trader_id TEXT NOT NULL REFERENCES auction_traders(trader_id),
    security_id INTEGER NOT NULL REFERENCES auction_securities(id),
    bid_amount NUMERIC(15,2) NOT NULL,
    envelope_code TEXT REFERENCES auction_master_envelopes(envelope_code) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK(status IN ('SUCCESS', 'REJECTED')),
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auction_holdings (
    id SERIAL PRIMARY KEY,
    trader_id TEXT NOT NULL REFERENCES auction_traders(trader_id),
    security_id INTEGER NOT NULL REFERENCES auction_securities(id),
    acquisition_price NUMERIC(15,2) NOT NULL,
    envelope_code TEXT REFERENCES auction_master_envelopes(envelope_code) ON DELETE SET NULL,
    effective_return_pct NUMERIC(15,4),
    envelope_effect_details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auction_transfers (
    id SERIAL PRIMARY KEY,
    holding_id INTEGER NOT NULL REFERENCES auction_holdings(id) ON DELETE CASCADE,
    from_trader_id TEXT NOT NULL REFERENCES auction_traders(trader_id),
    to_trader_id TEXT NOT NULL REFERENCES auction_traders(trader_id),
    transfer_price NUMERIC(15,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auction_envelopes_applied (
    id SERIAL PRIMARY KEY,
    trader_id TEXT NOT NULL REFERENCES auction_traders(trader_id),
    envelope_code TEXT REFERENCES auction_master_envelopes(envelope_code) ON DELETE SET NULL,
    bid_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    resulting_value NUMERIC(15,2) NOT NULL DEFAULT 0,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auction_audit_logs (
    id SERIAL PRIMARY KEY,
    actor TEXT NOT NULL DEFAULT 'ADMIN',
    action TEXT NOT NULL,
    trader_id TEXT,
    security_id INTEGER,
    bid_amount NUMERIC(15,2),
    envelope_code TEXT,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
`;
