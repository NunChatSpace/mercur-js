package repository

import (
	"database/sql"

	"github.com/mercurjs/adapter/internal/models"
)

type FieldMappingRepository struct {
	db *sql.DB
}

func NewFieldMappingRepository(db *sql.DB) *FieldMappingRepository {
	return &FieldMappingRepository{db: db}
}

func (r *FieldMappingRepository) FindByPlatformAndEntity(platformID, entityType string) ([]*models.FieldMapping, error) {
	query := `
		SELECT id, platform_id, entity_type, source_field, target_field, transform, is_active, created_at
		FROM field_mappings
		WHERE platform_id = $1 AND entity_type = $2 AND is_active = true
	`

	rows, err := r.db.Query(query, platformID, entityType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var mappings []*models.FieldMapping
	for rows.Next() {
		m := &models.FieldMapping{}
		var transform sql.NullString

		err := rows.Scan(
			&m.ID,
			&m.PlatformID,
			&m.EntityType,
			&m.SourceField,
			&m.TargetField,
			&transform,
			&m.IsActive,
			&m.CreatedAt,
		)
		if err != nil {
			return nil, err
		}

		if transform.Valid {
			m.Transform = transform.String
		}
		mappings = append(mappings, m)
	}

	return mappings, nil
}
