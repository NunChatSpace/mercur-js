# Admin OAuth Clients List UI

## Overview
Add an admin page that lists registered OAuth clients and their basic metadata (no secrets).

**Scope:** Admin panel UI only (list view). No create/edit flows.

---

## Data Flow

```
Admin UI  ── GET /admin/oauth-clients ──> Backend
```

---

## Requirements

- Route/page in admin panel that is reachable via admin navigation.
- Fetch clients from `GET /admin/oauth-clients`.
- Display key fields: `name`, `client_id`, `redirect_uris`, `grants`, `revoked`.
- Handle loading, empty, and error states.
- Do not display client secrets.

---

## UI Layout (Suggested)

- Page title: “OAuth Clients”
- Table columns:
  - Name
  - Client ID
  - Redirect URIs (comma-separated or stacked)
  - Grants
  - Status (Active/Revoked)
- Row action (optional): View details if route exists.

---

## Tasks

### Phase 1: Routing
- [ ] Add admin route entry for OAuth clients list.
- [ ] Create page component at the route.

### Phase 2: Data Fetching
- [ ] Add query/hook to call `GET /admin/oauth-clients`.
- [ ] Map response into table rows.

### Phase 3: UI Rendering
- [ ] Build table with required fields.
- [ ] Add loading state (skeleton or spinner).
- [ ] Add empty state (no clients).
- [ ] Add error state with retry.

### Phase 4: Navigation
- [ ] Add navigation link in admin sidebar (if needed).

---

## Verification

- Open the new admin page and confirm list renders.
- With no clients, verify empty state.
- With revoked clients, verify status label.

---

## Files Summary (Expected)

### Admin Panel (`mercur/admin-panel/`)

| Action | File |
|--------|------|
| Create | `src/routes/oauth-clients/` (page component) |
| Modify | `src/providers/router-provider/route-map.tsx` (add route) |
| Modify | `src/components/` (table or helper UI if needed) |

---

## Notes

- Keep display data minimal; never show client secrets.
- If an existing design system or table component exists, reuse it.
