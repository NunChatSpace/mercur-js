# MurcurJS

Multi-platform e-commerce marketplace with OAuth2 integration and webhook-based order synchronization.

## Architecture

```
  External Services                         MercurJS (Medusa)
  (Third-party Apps)                    ┌─────────────────────────┐
                                        │  Represents Platforms:  │
 ┌──────────────────┐                   │  Shopee, Lazada, TikTok │
 │  Mobile App      │                   └─────────────────────────┘
 │  ERP System      │                              │
 │  Inventory Sync  │                              │
 └────────┬─────────┘     ┌─────────────┐     ┌────▼────────┐
          │               │ Admin Panel │     │Vendor Panel │
          │               │   :5173     │     │   :7000     │
          │               └──────┬──────┘     └──────┬──────┘
          │                      │                   │
          │ MQTT                 └───────────────────┘
          │                               │ HTTP
          ▼                               ▼
   ┌─────────────┐                 ┌─────────────┐
   │ Mosquitto   │                 │  MercurJS   │
   │(MQTT Broker)│                 │   :9000     │
   │ :1883/:9001 │                 └──────┬──────┘
   └──────┬──────┘                        │
          │                               │
          │ Subscribe                     │
          ▼                               │
   ┌─────────────┐                        │
   │   Adapter   │◄───────────────────────┘
   │   :3001     │        HTTP API
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │  PostgreSQL │
   │    :5432    │
   └─────────────┘
```

**Data Flow:**
- External services publish requests to MQTT → Adapter consumes and calls MercurJS API
- Adapter publishes responses to MQTT → External services receive via subscription
- MercurJS is the marketplace platform that manages Shopee/Lazada/TikTok seller data
- Adapter handles OAuth tokens, field mapping, and API proxying for external integrations

## Quick Start

### 1. Start all services

```bash
docker compose up -d
```

### 2. Run database migrations and seed

```bash
docker compose exec mercurjs yarn seed
```

This creates:
- Admin user: `admin@mercurjs.com` / `supersecret`
- Seller user: `seller@mercurjs.com` / `secret`
- Sample products and categories
- Publishable API key (shown in output)

### 3. Access the services

| Service | URL | Purpose |
|---------|-----|---------|
| MercurJS API | http://localhost:9000 | Backend API |
| Admin Panel | http://localhost:5173 | Platform admin |
| Vendor Panel | http://localhost:7000 | Seller dashboard |
| WebUI | http://localhost:3100 | OAuth flow helper, Debugging tool |
| Adapter | http://localhost:3001 | External platform integration |
| pgAdmin | http://localhost:5050 | Database management |

**pgAdmin credentials**: `admin@admin.com` / `admin`

To connect to PostgreSQL in pgAdmin:
- Host: `postgres`
- Port: `5432`
- Username: `postgres`
- Password: `postgres`

## Development

For OAuth flow details, MQTT usage, webhook behavior, OMS testing workflow, and environment variables, see `DEVELOPMENT.md`.
