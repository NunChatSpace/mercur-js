# MurcurJS OMS API (Bruno)

This folder contains a Bruno collection that mirrors what the webui does.

**Files**
- `bruno/bruno.json` collection
- `bruno/environments/local.bru` env variables
- Request files under `bruno/Store`, `bruno/Auth`, `bruno/Vendor`

**Base URLs (from webui)**
- MercurJS API: `http://localhost:9000` (env var `base_url`)
- MQTT WS: `ws://localhost:9001`

**Auth (sellers)**
- Seller auth is Bearer token from `POST /auth/seller/emailpass` or `POST /auth/seller/emailpass/login`.
- Put the token in `vendor_token` env var and use Vendor requests.

**Storefront Place Order Flow (HTTP)**
1. `Store/Get Regions` (optional)
1. `Store/Create Cart`
1. `Store/Add Line Item`
1. `Store/Update Cart (Address + Email)`
1. `Store/Add Shipping Method`
1. `Store/Create Payment Collection`
1. `Store/Create Payment Session`
1. `Store/Complete Cart`

**Vendor Fulfillment Flow (HTTP)**
1. `Auth/Seller Login ...` to get `vendor_token`
1. `Vendor/Get Order` to get `line_item_id`
1. `Vendor/List Stock Locations` to get `location_id`
1. `Vendor/Create Fulfillment` (returns `fulfillment_id`)
1. `Vendor/Create Shipment`
1. `Vendor/Mark As Delivered`

**MQTT Requests (OMS → Adapter)**
- Topic: `requests/api_request`
- Payload:
```
{
  "request_id": "uuid",
  "api_key": "test-key-789",
  "shop_id": "<shop_id>",
  "action": "api_request",
  "params": {
    "path": "/sellers/<shop_id>/products",
    "method": "GET",
    "entity_type": "product",
    "entity_key": "products"
  }
}
```

- Topic: `requests/create_product`
- Payload:
```
{
  "request_id": "uuid",
  "api_key": "test-key-789",
  "shop_id": "<shop_id>",
  "action": "create_product",
  "params": {
    "product": {
      "title": "Green high-tops",
      "status": "published",
      "options": [
        { "title": "Default", "values": ["Default"] }
      ],
      "variants": [
        {
          "title": "Default Variant",
          "options": { "Default": "Default" },
          "prices": [
            { "amount": 99, "currency_code": "eur" }
          ]
        }
      ]
    }
  }
}
```

**MQTT Responses (Adapter → OMS)**
- Topic pattern: `responses/{request_id}` or `responses/{shop_id}/#`

**Webhook Events over MQTT (Adapter → OMS)**
- Topic pattern: `orders/{event_type}`
- Common event types from webui flow: `order.created`, `order.updated`, `order.fulfillment_created`, `order.completed`, `shipment.created`, `delivery.created`
