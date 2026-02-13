package repository

import (
	"database/sql"
	"time"

	"github.com/mercurjs/adapter/internal/models"
)

type TokenRepository struct {
	db *sql.DB
}

func NewTokenRepository(db *sql.DB) *TokenRepository {
	return &TokenRepository{db: db}
}

func (r *TokenRepository) Save(token *models.Token) error {
	token.UpdatedAt = time.Now()
	if token.CreatedAt.IsZero() {
		token.CreatedAt = time.Now()
	}

	query := `
		INSERT INTO tokens (shop_id, access_token, refresh_token, token_type, expires_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT(shop_id) DO UPDATE SET
			access_token = EXCLUDED.access_token,
			refresh_token = EXCLUDED.refresh_token,
			token_type = EXCLUDED.token_type,
			expires_at = EXCLUDED.expires_at,
			updated_at = EXCLUDED.updated_at
		RETURNING id
	`

	return r.db.QueryRow(query,
		token.ShopID,
		token.AccessToken,
		token.RefreshToken,
		token.TokenType,
		token.ExpiresAt,
		token.CreatedAt,
		token.UpdatedAt,
	).Scan(&token.ID)
}

func (r *TokenRepository) FindByShopID(shopID string) (*models.Token, error) {
	query := `
		SELECT id, shop_id, access_token, refresh_token, token_type, expires_at, created_at, updated_at
		FROM tokens
		WHERE shop_id = $1
	`

	token := &models.Token{}
	err := r.db.QueryRow(query, shopID).Scan(
		&token.ID,
		&token.ShopID,
		&token.AccessToken,
		&token.RefreshToken,
		&token.TokenType,
		&token.ExpiresAt,
		&token.CreatedAt,
		&token.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return token, nil
}

func (r *TokenRepository) Delete(shopID string) error {
	query := `DELETE FROM tokens WHERE shop_id = $1`
	_, err := r.db.Exec(query, shopID)
	return err
}
