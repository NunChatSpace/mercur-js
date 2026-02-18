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

func (r *FieldMappingRepository) List(platformID, entityType string) ([]*models.FieldMapping, error) {
	query := `
		SELECT id, platform_id, entity_type, source_field, target_field, transform, is_active, created_at
		FROM field_mappings
		WHERE ($1 = '' OR platform_id = $1)
		  AND ($2 = '' OR entity_type = $2)
		ORDER BY platform_id, entity_type, source_field
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

func (r *FieldMappingRepository) Upsert(mapping *models.FieldMapping) (*models.FieldMapping, error) {
	query := `
		INSERT INTO field_mappings (platform_id, entity_type, source_field, target_field, transform, is_active)
		VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6)
		ON CONFLICT (platform_id, entity_type, source_field)
		DO UPDATE SET
			target_field = EXCLUDED.target_field,
			transform = EXCLUDED.transform,
			is_active = EXCLUDED.is_active
		RETURNING id, platform_id, entity_type, source_field, target_field, transform, is_active, created_at
	`

	row := &models.FieldMapping{}
	var transform sql.NullString

	err := r.db.QueryRow(
		query,
		mapping.PlatformID,
		mapping.EntityType,
		mapping.SourceField,
		mapping.TargetField,
		mapping.Transform,
		mapping.IsActive,
	).Scan(
		&row.ID,
		&row.PlatformID,
		&row.EntityType,
		&row.SourceField,
		&row.TargetField,
		&transform,
		&row.IsActive,
		&row.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	if transform.Valid {
		row.Transform = transform.String
	}

	return row, nil
}

func (r *FieldMappingRepository) DeleteByID(id string) error {
	_, err := r.db.Exec(`DELETE FROM field_mappings WHERE id = $1`, id)
	return err
}
