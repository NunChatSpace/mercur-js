.PHONY: up down logs ps seed clean

# Start all services
up:
	docker compose up -d

# Start with build
up-build:
	docker compose up -d --build

# Stop all services
down:
	docker compose down

# View logs
logs:
	docker compose logs -f

# View specific service logs
logs-mercurjs:
	docker compose logs -f mercurjs

logs-adapter:
	docker compose logs -f adapter

# Show running services
ps:
	docker compose ps

# Seed adapter database
seed:
	docker compose exec postgres psql -U postgres -d adapter -f /docker-entrypoint-initdb.d/init-db.sql || true
	PGPASSWORD=postgres psql -h localhost -U postgres -d adapter -c "\
		INSERT INTO trusted_services (api_key, name, allowed_actions, is_active) \
		VALUES \
			('shopee-key-123', 'Shopee', ARRAY['get_stores', 'get_store', 'get_products'], true), \
			('lazada-key-456', 'Lazada', ARRAY['get_stores', 'get_store', 'get_products'], true), \
			('test-key-789', 'Test Service', ARRAY['*'], true) \
		ON CONFLICT (api_key) DO NOTHING; \
		\
		INSERT INTO field_mappings (platform_id, entity_type, source_field, target_field, transform, is_active) \
		VALUES \
			('shopee', 'store', 'id', 'shop_id', NULL, true), \
			('shopee', 'store', 'name', 'shop_name', 'uppercase', true), \
			('shopee', 'product', 'id', 'item_id', NULL, true), \
			('shopee', 'product', 'title', 'item_name', NULL, true), \
			('lazada', 'store', 'id', 'seller_id', NULL, true), \
			('lazada', 'store', 'name', 'seller_name', NULL, true) \
		ON CONFLICT (platform_id, entity_type, source_field) DO NOTHING;"

# Insert test token
seed-token:
	PGPASSWORD=postgres psql -h localhost -U postgres -d adapter -c "\
		INSERT INTO tokens (platform_id, shop_id, access_token, refresh_token, token_type, expires_at) \
		VALUES ('shopee', 'shop_001', 'test_token', 'test_refresh', 'Bearer', NOW() + INTERVAL '1 hour') \
		ON CONFLICT (platform_id, shop_id) DO UPDATE SET access_token = EXCLUDED.access_token;"

# Clean up (remove volumes)
clean:
	docker compose down -v

# Run MercurJS migrations
migrate:
	docker compose exec mercurjs yarn medusa db:migrate

# Test consumer flow
test-consumer:
	mosquitto_pub -h localhost -p 1883 -t "requests/shopee/get_stores" -m '{"request_id":"req_001","api_key":"shopee-key-123","platform":"shopee","shop_id":"shop_001","action":"get_stores","params":{}}'

# Health check
health:
	@echo "=== Adapter ===" && curl -s http://localhost:3001/health | jq . || echo "Adapter not running"
	@echo "\n=== MercurJS ===" && curl -s http://localhost:9000/health | jq . || echo "MercurJS not running"
