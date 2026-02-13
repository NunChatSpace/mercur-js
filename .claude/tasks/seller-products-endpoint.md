# Seller Products Endpoint

## Overview
Implement `GET /sellers/{id}/products` to list products that belong to a given seller/store.

**Scope:** Backend API route and service query.

---

## Requirements

- Route: `GET /sellers/:id/products`.
- Validate seller/store exists.
- Return paginated products scoped to the seller.
- Support optional filters (e.g., `q`, `status`, `limit`, `offset`) if standard patterns exist.
- Define authorization rules (public vs authenticated).

---

## API Contract (Draft)

**Request**
```
GET /sellers/:id/products?limit=50&offset=0
```

**Response**
```json
{
  "products": [
    {
      "id": "prod_...",
      "title": "...",
      "status": "published",
      "handle": "..."
    }
  ],
  "count": 1,
  "limit": 50,
  "offset": 0
}
```

---

## Tasks

### Phase 1: Route
- [ ] Add API route handler for `GET /sellers/:id/products`.
- [ ] Validate `:id` and return 404 if seller/store not found.

### Phase 2: Query Logic
- [ ] Add service/query to fetch products by seller/store id.
- [ ] Apply pagination (limit/offset) and ordering.
- [ ] Apply optional filters if available in existing APIs.

### Phase 3: Response Shape
- [ ] Return standard list response with `count`, `limit`, `offset`.
- [ ] Ensure only seller-owned products are returned.

### Phase 4: Authorization
- [ ] Decide access rules (public vs authenticated) and enforce.
- [ ] Add middleware if needed.

---

## Verification

- Request with valid seller id returns only that seller’s products.
- Request with invalid seller id returns 404.
- Pagination works (`limit`, `offset`).

---

## Files Summary (Expected)

### Backend (`mercur/backend/`)

| Action | File |
|--------|------|
| Create | `src/api/sellers/[id]/products/route.ts` |
| Modify | `src/api/middlewares.ts` (if auth needed) |
| Modify | `src/services/` or relevant query layer |

---

## Notes

- Align response format with existing product list endpoints.
- Document any required permissions.
