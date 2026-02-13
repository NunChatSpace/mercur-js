-- Seed trusted services for testing
-- The generic 'api_request' action allows proxying any API request to MercurJS
INSERT INTO trusted_services (api_key, name, allowed_actions, is_active)
VALUES
  ('shopee-key-123', 'Shopee', ARRAY['api_request'], true),
  ('lazada-key-456', 'Lazada', ARRAY['api_request'], true),
  ('test-key-789', 'Test Service', ARRAY['*'], true)
ON CONFLICT (api_key) DO NOTHING;

-- Seed field mappings for Shopee
INSERT INTO field_mappings (platform_id, entity_type, source_field, target_field, transform, is_active)
VALUES
  ('shopee', 'seller', 'id', 'shop_id', NULL, true),
  ('shopee', 'seller', 'name', 'shop_name', 'uppercase', true),
  ('shopee', 'seller', 'handle', 'shop_handle', NULL, true),
  ('shopee', 'product', 'id', 'item_id', NULL, true),
  ('shopee', 'product', 'title', 'item_name', NULL, true),
  ('shopee', 'product', 'variants.0.price', 'price', 'cents_to_dollars', true)
ON CONFLICT (platform_id, entity_type, source_field) DO NOTHING;

-- Seed field mappings for Lazada
INSERT INTO field_mappings (platform_id, entity_type, source_field, target_field, transform, is_active)
VALUES
  ('lazada', 'seller', 'id', 'seller_id', NULL, true),
  ('lazada', 'seller', 'name', 'seller_name', NULL, true),
  ('lazada', 'product', 'id', 'sku_id', NULL, true),
  ('lazada', 'product', 'title', 'product_name', NULL, true),
  ('lazada', 'product', 'variants.0.price', 'special_price', 'cents_to_dollars', true)
ON CONFLICT (platform_id, entity_type, source_field) DO NOTHING;
