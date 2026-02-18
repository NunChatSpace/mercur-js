# MercurJS Adapter (Go)

Message broker adapter for MercurJS with two main flows:

1. **Publisher (AC6)**: MercurJS webhooks -> Adapter -> Message Broker
2. **Consumer**: Message Broker -> Adapter -> MercurJS API -> Message Broker

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                ADAPTER                                       │
│                                                                              │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐    │
│  │  Publisher  │     │                   Consumer                       │    │
│  │             │     │                                                  │    │
│  │  /hook ────>│────>│ requests/# ───> validate ──> MercurJS API ────>│    │
│  │  (webhook)  │     │                     │              │             │    │
│  └──────┬──────┘     │                     │              │             │    │
│         │            │                     ▼              ▼             │    │
│         │            │               ┌──────────┐   ┌──────────┐        │    │
│         │            │               │  Token   │   │  Field   │        │    │
│         │            │               │  Store   │   │  Mapper  │        │    │
│         │            │               └──────────┘   └──────────┘        │    │
│         │            │                                    │             │    │
│         │            │                    responses/{req_id}           │    │
│         ▼            └────────────────────────────────────┼─────────────┘    │
│    orders/{event_type}                                    │                  │
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
| `/api/mappings` | GET | List mappings (optional filters: `platform_id`, `entity_type`) |
| `/api/mappings` | POST | Create/Upsert mapping |
| `/api/mappings/{id}` | DELETE | Delete mapping |

## Message Topics

**Requests (External → Adapter):**
```
requests/{action}
Example: requests/api_request

Also supported:
requests/{platform}/{action}
Example: requests/shopee/api_request
```

**Responses (Adapter → External):**
```
responses/{request_id}
Example: responses/req_001
```

**Orders (Adapter → External):**
```
orders/{event_type}
Example: orders/order.created
```

## Request Message Format

```json
{
  "request_id": "req_001",
  "api_key": "shopee-key-123",
  "platform": "default",
  "shop_id": "shop_001",
  "action": "api_request",
  "params": {
    "path": "/sellers",
    "method": "GET",
    "entity_type": "seller",
    "entity_key": "sellers"
  }
}
```

## Field Mapping Configuration

You can configure mappings in two ways:

1. Web UI: `http://localhost:3100/mappings.html`
2. Adapter API:

```bash
# List mappings
curl "http://localhost:3001/api/mappings?platform_id=default&entity_type=product"

# Upsert mapping
curl -X POST "http://localhost:3001/api/mappings" \
  -H "Content-Type: application/json" \
  -d '{
    "platform_id": "default",
    "entity_type": "product",
    "source_field": "variants.0.prices.0.amount",
    "target_field": "price",
    "transform": "cents_to_dollars",
    "is_active": true
  }'

# Delete mapping
curl -X DELETE "http://localhost:3001/api/mappings/<mapping_id>"
```

Notes:
- One mapping row is used for both directions:
  - `Transform`: `source_field -> target_field`
  - `ReverseTransform`: `target_field -> source_field`
- Mapper selection is platform-aware:
  - Uses request `platform` (or topic `requests/{platform}/{action}`), otherwise falls back to `default`.

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
