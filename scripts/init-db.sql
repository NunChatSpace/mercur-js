-- Create databases for MercurJS and Adapter
CREATE DATABASE medusa;
CREATE DATABASE adapter;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE medusa TO postgres;
GRANT ALL PRIVILEGES ON DATABASE adapter TO postgres;

-- Connect to adapter database and create tables + seed data
\c adapter

-- Create adapter tables
CREATE TABLE IF NOT EXISTS tokens (
    id SERIAL PRIMARY KEY,
    shop_id VARCHAR(100) UNIQUE NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trusted_services (
    id SERIAL PRIMARY KEY,
    api_key VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    allowed_actions TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS field_mappings (
    id SERIAL PRIMARY KEY,
    platform_id VARCHAR(50) NOT NULL DEFAULT 'default',
    entity_type VARCHAR(50) NOT NULL,
    source_field VARCHAR(100) NOT NULL,
    target_field VARCHAR(100) NOT NULL,
    transform VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform_id, entity_type, source_field)
);

-- Seed trusted services
INSERT INTO trusted_services (api_key, name, allowed_actions, is_active)
VALUES
  ('test-key-789', 'Default Service', ARRAY['*'], true)
ON CONFLICT (api_key) DO NOTHING;

-- Seed default field mappings (optional - for transforming MercurJS response)
INSERT INTO field_mappings (platform_id, entity_type, source_field, target_field, transform, is_active)
VALUES
  ('default', 'seller', 'id', 'shop_id', NULL, true),
  ('default', 'seller', 'name', 'shop_name', NULL, true),
  ('default', 'product', 'id', 'item_id', NULL, true),
  ('default', 'product', 'title', 'item_name', NULL, true)
ON CONFLICT (platform_id, entity_type, source_field) DO NOTHING;
