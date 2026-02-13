.PHONY: build run dev test docker-up docker-down docker-logs clean

# Build the adapter binary
build:
	go build -o bin/adapter ./cmd/main.go

# Run the adapter
run: build
	./bin/adapter

# Run with hot reload (requires air: go install github.com/cosmtrek/air@latest)
dev:
	air -c .air.toml || go run ./cmd/main.go

# Run tests
test:
	go test -v ./test/...

# Start docker services (MQTT + Adapter)
docker-up:
	docker compose up -d

# Stop docker services
docker-down:
	docker compose down

# View docker logs
docker-logs:
	docker compose logs -f

# Clean build artifacts
clean:
	rm -rf bin/

# Download dependencies
deps:
	go mod download
	go mod tidy

# Seed database with test data
seed:
	PGPASSWORD=adapter psql -h localhost -U adapter -d adapter -f scripts/seed.sql

# Run test publisher (simulates external service)
# Usage: make test-pub ACTION=get_stores PLATFORM=shopee SHOP=shop_001
test-pub:
	go run ./cmd/test-publisher/main.go -action=$(ACTION) -platform=$(PLATFORM) -shop=$(SHOP) -store=$(STORE) -key=$(KEY)

# Quick test examples
test-get-stores:
	go run ./cmd/test-publisher/main.go -action=get_stores -platform=shopee -shop=shop_001 -key=shopee-key-123

test-get-store:
	go run ./cmd/test-publisher/main.go -action=get_store -platform=shopee -shop=shop_001 -store=store_123 -key=shopee-key-123

test-get-products:
	go run ./cmd/test-publisher/main.go -action=get_products -platform=shopee -shop=shop_001 -store=store_123 -key=shopee-key-123
