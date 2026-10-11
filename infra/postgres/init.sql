-- Rootcause DB setup
-- Ensure rootcause is explicitly created just in case
-- (Wait, postgres image creates POSTGRES_DB which is rootcause, so it already exists)
-- CREATE DATABASE rootcause;
CREATE DATABASE ops;

\connect rootcause;

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  category VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_id VARCHAR(100) NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  payment_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

\connect ops;

CREATE TABLE IF NOT EXISTS deploy_events (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT NOW(),
  service VARCHAR(100) NOT NULL,
  kind VARCHAR(50) NOT NULL CHECK (kind IN ('code', 'config', 'migration')),
  from_version VARCHAR(50),
  to_version VARCHAR(50),
  summary TEXT,
  diff_summary TEXT
);

CREATE TABLE IF NOT EXISTS logs (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL,
  service VARCHAR(50) NOT NULL,
  version VARCHAR(20),
  level VARCHAR(10) NOT NULL,
  request_id VARCHAR(64),
  route VARCHAR(200),
  status INTEGER,
  duration_ms INTEGER,
  message TEXT NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs (ts);

CREATE TABLE IF NOT EXISTS fix_proposals (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW(),
  run_id INTEGER,
  action VARCHAR(255) NOT NULL,
  target VARCHAR(255) NOT NULL,
  reason TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  decided_at TIMESTAMP,
  decided_by VARCHAR(100),
  decision_reason TEXT
);

CREATE TABLE IF NOT EXISTS runs (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW(),
  alert TEXT,
  provider VARCHAR(100),
  model VARCHAR(100),
  status VARCHAR(50) DEFAULT 'running',
  report JSONB,
  total_steps INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  duration_ms INTEGER,
  error TEXT,
  scenario_id VARCHAR(100),
  verdict VARCHAR(20),
  truth_component VARCHAR(50),
  truth_category VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS steps (
  id SERIAL PRIMARY KEY,
  run_id INTEGER REFERENCES runs(id),
  step_number INTEGER NOT NULL,
  role VARCHAR(50) NOT NULL,
  content TEXT,
  tool_name VARCHAR(100),
  tool_args JSONB,
  tool_result TEXT,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

\connect rootcause;
CREATE ROLE agent_readonly WITH LOGIN PASSWORD 'agent_readonly';
GRANT CONNECT ON DATABASE rootcause TO agent_readonly;
GRANT USAGE ON SCHEMA public TO agent_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO agent_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO agent_readonly;

\connect ops;
-- The agent may read deploy history only. It must never see runs, steps or
-- fix_proposals: those hold previous investigation reports.
GRANT CONNECT ON DATABASE ops TO agent_readonly;
GRANT USAGE ON SCHEMA public TO agent_readonly;
GRANT SELECT ON deploy_events, logs TO agent_readonly;

-- Lets the agent see other sessions in pg_stat_activity and pg_locks.
GRANT pg_monitor TO agent_readonly;
