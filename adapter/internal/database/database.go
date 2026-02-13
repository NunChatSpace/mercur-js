package database

import (
	"database/sql"
	"log"

	_ "github.com/lib/pq"
)

func New(connectionString string) (*sql.DB, error) {
	db, err := sql.Open("postgres", connectionString)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		return nil, err
	}

	if err := migrate(db); err != nil {
		return nil, err
	}

	log.Println("[database] Connected to PostgreSQL")
	return db, nil
}

func migrate(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS tokens (
		id SERIAL PRIMARY KEY,
		shop_id VARCHAR(100) UNIQUE NOT NULL,
		access_token TEXT NOT NULL,
		refresh_token TEXT,
		token_type VARCHAR(50) DEFAULT 'Bearer',
		expires_at TIMESTAMP,
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS trusted_services (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		api_key VARCHAR(255) UNIQUE NOT NULL,
		name VARCHAR(255) NOT NULL,
		allowed_actions TEXT[],
		is_active BOOLEAN DEFAULT true,
		created_at TIMESTAMP DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS field_mappings (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		platform_id VARCHAR(50) NOT NULL DEFAULT 'default',
		entity_type VARCHAR(50) NOT NULL,
		source_field VARCHAR(255) NOT NULL,
		target_field VARCHAR(255) NOT NULL,
		transform VARCHAR(50),
		is_active BOOLEAN DEFAULT true,
		created_at TIMESTAMP DEFAULT NOW(),
		UNIQUE(platform_id, entity_type, source_field)
	);
	`

	_, err := db.Exec(schema)
	if err != nil {
		return err
	}

	log.Println("[database] Migrations applied")
	return nil
}
