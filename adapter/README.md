# MercurJS Adapter (Go)

Message broker adapter for MercurJS with two main flows:

1. **Publisher (AC6)**: MercurJS webhooks → Adapter → Message Broker
2. **Consumer**: Message Broker → Adapter → MercurJS API → Message Broker

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                ADAPTER                                       │
│                                                                              │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐    │
│  │  Publisher  │     │                   Consumer                       │    │
│  │             │     │                                                  │    │
│  │  /hook ────>│────>│ requests/+/+ ──> validate ──> MercurJS API ────>│    │
│  │  (webhook)  │     │                     │              │             │    │
│  └──────┬──────┘     │                     │              │             │    │
│         │            │                     ▼              ▼             │    │
│         │            │               ┌──────────┐   ┌──────────┐        │    │
│         │            │               │  Token   │   │  Field   │        │    │
│         │            │               │  Store   │   │  Mapper  │        │    │
│         │            │               └──────────┘   └──────────┘        │    │
│         │            │                                    │             │    │
│         │            │                    responses/{platform}/{req_id} │    │
│         ▼            └────────────────────────────────────┼─────────────┘    │
│    orders/{platform}/{shop_id}/{event}                    │                  │
│         │                                                 │                  │
└─────────┼─────────────────────────────────────────────────┼──────────────────┘
          │                                                 │
          ▼                                                 ▼
    ┌──────────────────────────────────────────────────────────┐
    │                     Message Broker                        │
    └──────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Start all services (PostgreSQL + MQTT + Adapter)
make docker-up

# Seed test data
make seed

# Test consumer flow
make test-get-stores

# View logs
make docker-logs

# Stop services
make docker-down
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/hook` | POST | Webhook receiver (Publisher) |
| `/oauth/callback` | GET | OAuth token exchange |

## Message Topics

**Requests (External → Adapter):**
```
requests/{platform}/{action}
Example: requests/shopee/get_stores
```

**Responses (Adapter → External):**
```
responses/{platform}/{request_id}
Example: responses/shopee/req_001
```

**Orders (Adapter → External):**
```
orders/{platform}/{shop_id}/{event_type}
Example: orders/shopee/shop_001/order.created
```

## Request Message Format

```json
{
  "request_id": "req_001",
  "api_key": "shopee-key-123",
  "platform": "shopee",
  "shop_id": "shop_001",
  "action": "get_stores",
  "params": {}
}
```

## Response Message Format

```json
{
  "request_id": "req_001",
  "success": true,
  "data": [...],
  "error": null
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `HOST` | 0.0.0.0 | Server host |
| `WEBHOOK_SECRET` | | Secret for webhook signature |
| `BROKER_URL` | tcp://localhost:1883 | MQTT broker URL |
| `BROKER_CLIENT_ID` | adapter-001 | MQTT client ID |
| `DATABASE_HOST` | localhost | PostgreSQL host |
| `DATABASE_PORT` | 5432 | PostgreSQL port |
| `DATABASE_USER` | adapter | PostgreSQL user |
| `DATABASE_PASSWORD` | adapter | PostgreSQL password |
| `DATABASE_NAME` | adapter | PostgreSQL database |
| `MERCURJS_URL` | http://localhost:9000 | MercurJS API URL |
| `MERCURJS_CLIENT_ID` | | OAuth client ID |
| `MERCURJS_CLIENT_SECRET` | | OAuth client secret |

## Project Structure

```
adapter/
├── cmd/
│   ├── main.go                 # Entry point
│   └── test-publisher/         # Test script
├── internal/
│   ├── api/                    # MercurJS API client
│   ├── broker/                 # MQTT publisher + consumer
│   ├── config/                 # Configuration
│   ├── controllers/            # HTTP handlers
│   ├── database/               # PostgreSQL connection
│   ├── domains/                # DTOs
│   ├── mapper/                 # Field mapping
│   ├── models/                 # Entities
│   ├── repository/             # Database access
│   └── services/               # Business logic
├── scripts/
│   └── seed.sql                # Test data
├── docker-compose.yml
├── Dockerfile
├── Makefile
└── go.mod
```

## Testing

### Quick Tests

```bash
# Test get_stores
make test-get-stores

# Test get_store
make test-get-store

# Test get_products
make test-get-products
```
