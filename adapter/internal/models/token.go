package models

import "time"

type Token struct {
	ID           string
	ShopID       string
	AccessToken  string
	RefreshToken string
	TokenType    string
	ExpiresAt    time.Time
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (t *Token) IsExpired() bool {
	return time.Now().After(t.ExpiresAt)
}

func (t *Token) ShouldRefresh() bool {
	// Refresh 5 minutes before expiry
	return time.Now().Add(5 * time.Minute).After(t.ExpiresAt)
}
