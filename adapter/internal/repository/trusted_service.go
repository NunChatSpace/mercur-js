package repository

import (
	"database/sql"

	"github.com/lib/pq"
	"github.com/mercurjs/adapter/internal/models"
)

type TrustedServiceRepository struct {
	db *sql.DB
}

func NewTrustedServiceRepository(db *sql.DB) *TrustedServiceRepository {
	return &TrustedServiceRepository{db: db}
}

func (r *TrustedServiceRepository) FindByAPIKey(apiKey string) (*models.TrustedService, error) {
	query := `
		SELECT id, api_key, name, allowed_actions, is_active, created_at
		FROM trusted_services
		WHERE api_key = $1 AND is_active = true
	`

	service := &models.TrustedService{}
	var actions pq.StringArray

	err := r.db.QueryRow(query, apiKey).Scan(
		&service.ID,
		&service.APIKey,
		&service.Name,
		&actions,
		&service.IsActive,
		&service.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	service.AllowedActions = []string(actions)
	return service, nil
}
