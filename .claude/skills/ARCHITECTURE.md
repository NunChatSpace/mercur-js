# Architecture Template

A reference architecture for Go backend + Svelte frontend projects.

---

## Project Structure

```
project/
├── backend/
│   ├── internal/
│   │   ├── controllers/   # HTTP handlers (thin layer)
│   │   ├── services/      # Business logic (interfaces + implementations)
│   │   ├── repository/    # Data access layer
│   │   ├── models/        # Database entities
│   │   ├── domains/       # Response/Request DTOs
│   │   ├── views/         # HTTP response helpers
│   │   └── utils/         # Shared utilities
│   ├── migrations/        # SQL migration files
│   └── main.go            # Entry point, DI container, router setup
├── frontend/
│   ├── src/
│   │   ├── routes/        # SvelteKit pages (file-based routing)
│   │   ├── components/    # UI components (Atomic Design)
│   │   ├── lib/apis/      # API client functions
│   │   ├── stores/        # Svelte stores (global state)
│   │   └── types/         # TypeScript interfaces
│   └── svelte.config.js
├── k8s/                   # Kubernetes manifests (optional)
└── docker-compose.yml     # Local development
```

---

## Backend Layers

### 1. Entry Point (`main.go`)

Responsibilities:
- Build dependency injection container
- Run database migrations
- Configure middleware (CORS, rate limiting, logging)
- Mount controllers to router
- Start HTTP server

```go
func main() {
    container := buildContainer()  // Register all dependencies
    runMigrations(db)

    router := mux.NewRouter()
    api := router.PathPrefix("/api").Subrouter()

    // Mount controllers
    mountUserController(api, container)
    mountPostController(api, container)

    http.ListenAndServe(":8080", router)
}
```

### 2. Controllers (`/internal/controllers/`)

**Purpose:** HTTP request handling (thin layer)

**Responsibilities:**
- Parse and validate request input
- Extract user from context (if authenticated)
- Call service methods
- Return JSON response

**Pattern:**
```go
type Handler struct {
    Service services.SomeService
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
    // 1. Parse input
    // 2. Validate
    // 3. Call service
    // 4. Return response
}
```

**Do:**
- Keep handlers thin
- Validate input here
- Handle HTTP concerns (status codes, headers)

**Don't:**
- Put business logic here
- Access repository directly

### 3. Services (`/internal/services/`)

**Purpose:** Business logic

**Pattern:**
```go
// Interface (contract)
type UserService interface {
    Create(ctx context.Context, input CreateUserInput) (*User, error)
    GetByID(ctx context.Context, id string) (*User, error)
    Authenticate(ctx context.Context, email, password string) (*User, error)
}

// Implementation
type userService struct {
    repo     repository.UserRepository
    hasher   PasswordHasher
}

func NewUserService(repo repository.UserRepository) UserService {
    return &userService{repo: repo}
}
```

**Responsibilities:**
- Validate business rules
- Orchestrate repository calls
- Handle transactions if needed
- Transform data between layers

### 4. Repository (`/internal/repository/`)

**Purpose:** Data access (database queries)

**Pattern:**
```go
type UserRepository interface {
    GetByID(ctx context.Context, id string) (*models.User, error)
    GetByEmail(ctx context.Context, email string) (*models.User, error)
    Create(ctx context.Context, user *models.User) error
    Update(ctx context.Context, user *models.User) error
    SoftDelete(ctx context.Context, id string) error
}

type userRepo struct {
    db *sqlx.DB
}
```

**Conventions:**
- Use soft deletes (`deleted_at` column)
- Filter with `WHERE deleted_at IS NULL`
- Use prepared statements or query builder
- Implement Dataloader for batch loading (prevent N+1)

### 5. Models (`/internal/models/`)

**Purpose:** Database entities (table mappings)

```go
type User struct {
    ID        string     `db:"id"`
    Email     string     `db:"email"`
    Password  string     `db:"password"`
    CreatedAt time.Time  `db:"created_at"`
    UpdatedAt time.Time  `db:"updated_at"`
    DeletedAt *time.Time `db:"deleted_at"`
}
```

### 6. Domains (`/internal/domains/`)

**Purpose:** Request/Response DTOs (what API returns)

```go
type UserResponse struct {
    ID    string `json:"id"`
    Email string `json:"email"`
    Name  string `json:"name"`
}

type CreateUserRequest struct {
    Email    string `json:"email"`
    Password string `json:"password"`
    Name     string `json:"name"`
}
```

---

## Backend Patterns

### Dependency Injection

Use a DI container (e.g., Uber's `dig`) to wire dependencies:

```go
func buildContainer() *dig.Container {
    c := dig.New()
    c.Provide(NewDB)
    c.Provide(repository.NewUserRepository)
    c.Provide(services.NewUserService)
    c.Provide(controllers.NewUserHandler)
    return c
}
```

### Middleware Chain

```
Request
  ↓ RateLimiter
  ↓ RequestLogger
  ↓ AuthMiddleware (for private routes)
  ↓ Handler
Response
```

### Router Structure

```go
api := router.PathPrefix("/api").Subrouter()

// Public routes (no auth required)
public := api.NewRoute().Subrouter()
public.HandleFunc("/auth/login", handler.Login).Methods("POST")

// Private routes (auth required)
private := api.NewRoute().Subrouter()
private.Use(AuthMiddleware)
private.HandleFunc("/me", handler.GetMe).Methods("GET")
```

### Session Authentication

```
1. User logs in → Create session token (UUID) → Store in DB
2. Set HttpOnly cookie with token
3. On each request → Read cookie → Lookup session → Inject user to context
4. User logs out → Delete session from DB → Clear cookie
```

### Soft Deletes

Never hard delete. Set `deleted_at` timestamp instead:

```sql
-- All queries include this filter
WHERE deleted_at IS NULL

-- "Delete" operation
UPDATE users SET deleted_at = NOW() WHERE id = $1
```

### Dataloader (Prevent N+1)

When loading nested data, batch load related entities:

```go
// Bad: N+1 queries
for _, post := range posts {
    post.User = repo.GetUser(post.UserID)  // 1 query per post
}

// Good: 2 queries total
userIDs := extractUserIDs(posts)
users := repo.GetUsersByIDs(userIDs)  // 1 query for all users
mapUsersToPost(posts, users)
```

---

## Frontend Layers

### 1. Routes (`/src/routes/`)

SvelteKit file-based routing:

```
routes/
├── +layout.svelte     # Global layout (header, nav)
├── +page.svelte       # Home page (/)
├── items/
│   └── +page.svelte   # /items
└── profile/
    └── +page.svelte   # /profile
```

### 2. Components (Atomic Design)

```
components/
├── Atoms/        # Basic elements (Button, Input, Icon)
├── Molecules/    # Combinations (SearchBar, Modal, Card)
├── Organisms/    # Complex sections (Header, Form, List)
└── Pages/        # Full page layouts
```

### 3. Stores (`/src/stores/`)

Global state with Svelte stores:

```typescript
// auth.ts
import { writable, derived } from 'svelte/store';

export const user = writable<User | null>(null);
export const isSignedIn = derived(user, $user => $user !== null);

export function signOut() {
    user.set(null);
    // Clear cookies/localStorage
}
```

### 4. API Layer (`/src/lib/apis/`)

Centralized API client:

```typescript
// fetcher.ts
const API_BASE = '/api';

export async function GET<T>(url: string): Promise<T> {
    const res = await fetch(`${API_BASE}${url}`, {
        credentials: 'include'  // Send cookies
    });
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
}

export async function POST<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(`${API_BASE}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
}
```

```typescript
// users.ts
import { GET, POST } from './fetcher';

export const getMe = () => GET<User>('/me');
export const signIn = (data: SignInRequest) => POST<User>('/sessions', data);
```

### 5. Types (`/src/types/`)

TypeScript interfaces matching backend DTOs:

```typescript
interface User {
    id: string;
    email: string;
    name: string;
}

interface Paged<T> {
    data: T[];
    next: string | null;
    count: number;
}
```

---

## Data Flow

### Request Lifecycle

```
Frontend Component
  ↓ calls API function
API Layer (lib/apis)
  ↓ HTTP request with credentials
Backend Controller
  ↓ validates, extracts user from context
Service Layer
  ↓ business logic
Repository
  ↓ SQL query
Database
  ↓ returns data
Repository → Service → Controller → JSON Response
  ↓
Frontend updates store/UI
```

### Authentication Flow

```
1. User submits login form
2. POST /api/sessions { email, password }
3. Backend validates credentials
4. Create session, set HttpOnly cookie
5. Return user data
6. Frontend stores user in auth store
7. Subsequent requests include cookie automatically
```

---

## Database Conventions

### Migration Files

```
migrations/
├── 0001_init.up.sql
├── 0001_init.down.sql
├── 0002_add_posts.up.sql
└── 0002_add_posts.down.sql
```

### Table Structure

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP  -- For soft deletes
);

-- Index for soft delete queries
CREATE INDEX idx_users_deleted_at ON users(deleted_at);
```

### Full-Text Search (PostgreSQL)

```sql
ALTER TABLE posts ADD COLUMN search_vector tsvector;

CREATE INDEX idx_posts_search ON posts USING GIN(search_vector);

-- Query
SELECT * FROM posts
WHERE search_vector @@ plainto_tsquery('english', $1);
```

---

## Pub/Sub Architecture (Adapter Pattern)

For event-driven communication between services, use the Adapter + Message Broker pattern.

### Flow

```
┌─────────────┐     webhook     ┌─────────────┐    publish    ┌─────────────┐
│  MercurJS   │────────────────>│   Adapter   │──────────────>│   Message   │
│  (Backend)  │                 │    (Go)     │               │   Broker    │
└─────────────┘                 └─────────────┘               └──────┬──────┘
                                                                     │
                                                              subscribe
                                                                     │
                                                              ┌──────▼──────┐
                                                              │  Consumers  │
                                                              └─────────────┘
```

### Adapter Structure

```
adapter/
├── cmd/
│   └── main.go              # Entry point, DI, router setup
├── internal/
│   ├── config/              # Configuration loading
│   ├── controllers/         # HTTP handlers (webhook receiver)
│   ├── services/            # Business logic (signature verification)
│   ├── broker/              # Message broker client (MQTT/RabbitMQ)
│   └── domains/             # Request/Response DTOs
├── test/                    # Integration tests
├── docker-compose.yml       # Local development (broker + adapter)
└── Makefile                 # Build commands
```

### Broker Interface Pattern

```go
// Publisher interface for message broker
type Publisher interface {
    Publish(platform, shopID, eventType string, data map[string]interface{}) error
    Close()
}

// Implementation can be MQTT, RabbitMQ, Kafka, etc.
type mqttPublisher struct {
    client mqtt.Client
}

func NewPublisher(cfg *config.BrokerConfig) (Publisher, error) {
    // Connect to broker
}

func (p *mqttPublisher) Publish(...) error {
    topic := BuildTopic(platform, shopID, eventType)
    return p.client.Publish(topic, payload)
}
```

### Webhook Handler Pattern

```go
func (h *WebhookHandler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
    // 1. Extract headers
    signature := r.Header.Get("X-Webhook-Signature")
    eventType := r.Header.Get("X-Webhook-Event")

    // 2. Read body
    body, _ := io.ReadAll(r.Body)

    // 3. Verify signature (HMAC-SHA256)
    if !h.service.VerifySignature(body, signature) {
        return Unauthorized
    }

    // 4. Process and publish to broker
    h.service.ProcessWebhook(eventType, data)

    // 5. Return success
    return OK
}
```

### Topic Naming Convention

```
{resource}/{platform}/{identifier}/{action}

Examples:
- orders/shopee/store_123/created
- orders/lazada/store_456/updated
- inventory/default/warehouse_1/low_stock
```

### Message Format

```json
{
  "event_type": "order.created",
  "timestamp": "2024-01-01T00:00:00Z",
  "platform": "shopee",
  "shop_id": "store_123",
  "data": {
    "order_id": "order_abc",
    "items": [...]
  }
}
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Svelte/SvelteKit, TypeScript, Tailwind CSS |
| Backend | Go, Gorilla mux, sqlx |
| Adapter | Go, Gorilla mux, MQTT client |
| Message Broker | MQTT (Mosquitto) / RabbitMQ |
| Database | PostgreSQL |
| Storage | MinIO / S3 |
| Auth | HttpOnly session cookies |
| DI | Uber dig |
| Deploy | Docker, Kubernetes |

---

## Checklist for New Projects

- [ ] Set up project structure (backend/frontend folders)
- [ ] Configure DI container in main.go
- [ ] Create base migration (users, sessions tables)
- [ ] Implement auth flow (login, logout, session middleware)
- [ ] Set up API client in frontend
- [ ] Create auth store in frontend
- [ ] Configure CORS for frontend origin
- [ ] Set up rate limiting middleware
- [ ] Configure soft delete pattern in repositories
