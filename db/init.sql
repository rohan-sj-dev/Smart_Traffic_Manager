-- Intelligent Load Balancer — Database Schema
-- Run: psql -U postgres -f db/init.sql

CREATE DATABASE loadbalancer;
\c loadbalancer;

-- Request logs: every routed request
CREATE TABLE IF NOT EXISTS request_logs (
    id            SERIAL PRIMARY KEY,
    timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_id    VARCHAR(64),
    method        VARCHAR(10)  NOT NULL DEFAULT 'GET',
    url           VARCHAR(256) NOT NULL,
    server_id     VARCHAR(64),
    status_code   INT          NOT NULL DEFAULT 200,
    latency_ms    INT          NOT NULL DEFAULT 0,
    cache_hit     BOOLEAN      NOT NULL DEFAULT FALSE,
    client_ip     VARCHAR(45)  DEFAULT '127.0.0.1'
);

CREATE INDEX idx_request_logs_ts   ON request_logs (timestamp);
CREATE INDEX idx_request_logs_url  ON request_logs (url);
CREATE INDEX idx_request_logs_srv  ON request_logs (server_id);

-- Scaling events from the auto-scaler
CREATE TABLE IF NOT EXISTS scaling_events (
    id            SERIAL PRIMARY KEY,
    timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action        VARCHAR(32)  NOT NULL,  -- 'scale_up', 'scale_down', 'hold'
    servers_before INT,
    servers_after  INT,
    predicted_load DOUBLE PRECISION,
    spike_detected BOOLEAN DEFAULT FALSE,
    reason         TEXT
);

CREATE INDEX idx_scaling_ts ON scaling_events (timestamp);

-- Periodic metric snapshots (every ~5s)
CREATE TABLE IF NOT EXISTS metric_snapshots (
    id              SERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_requests  BIGINT,
    rps             DOUBLE PRECISION,
    avg_latency_ms  DOUBLE PRECISION,
    p99_latency_ms  DOUBLE PRECISION,
    cache_hit_rate  DOUBLE PRECISION,
    cache_entries   INT,
    active_servers  INT,
    predicted_load  DOUBLE PRECISION,
    trend           VARCHAR(16)
);

CREATE INDEX idx_metrics_ts ON metric_snapshots (timestamp);
