package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/mercurjs/adapter/internal/models"
	"github.com/mercurjs/adapter/internal/repository"
)

type OAuthService struct {
	mercurJSURL  string
	clientID     string
	clientSecret string
	redirectURI  string
	tokenRepo    *repository.TokenRepository
	httpClient   *http.Client
}

func NewOAuthService(mercurJSURL, clientID, clientSecret, redirectURI string, tokenRepo *repository.TokenRepository) *OAuthService {
	return &OAuthService{
		mercurJSURL:  mercurJSURL,
		clientID:     clientID,
		clientSecret: clientSecret,
		redirectURI:  redirectURI,
		tokenRepo:    tokenRepo,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// RedirectURI returns the configured redirect URI
func (s *OAuthService) RedirectURI() string {
	return s.redirectURI
}

type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	TokenType    string `json:"token_type"`
	UserID       string `json:"user_id"`
	UserType     string `json:"user_type"`
}

// ExchangeCode exchanges authorization code for tokens
// Returns the shop_id (user_id from token response)
func (s *OAuthService) ExchangeCode(code string) (string, error) {
	// Build token request
	data := url.Values{}
	data.Set("grant_type", "authorization_code")
	data.Set("code", code)
	data.Set("client_id", s.clientID)
	data.Set("client_secret", s.clientSecret)
	data.Set("redirect_uri", s.redirectURI)

	req, err := http.NewRequest("POST", s.mercurJSURL+"/oauth/token", strings.NewReader(data.Encode()))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to exchange code: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("token exchange failed: status=%d body=%s", resp.StatusCode, string(body))
	}

	var tokenResp TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("failed to parse token response: %w", err)
	}

	// Shop ID is the user_id from the token response
	shopID := tokenResp.UserID
	if shopID == "" {
		return "", fmt.Errorf("token response missing user_id")
	}

	// Store token
	token := &models.Token{
		ShopID:       shopID,
		AccessToken:  tokenResp.AccessToken,
		RefreshToken: tokenResp.RefreshToken,
		TokenType:    tokenResp.TokenType,
		ExpiresAt:    time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second),
		CreatedAt:    time.Now(),
	}

	if err := s.tokenRepo.Save(token); err != nil {
		return "", fmt.Errorf("failed to save token: %w", err)
	}

	return shopID, nil
}
