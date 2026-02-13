package api

import (
	"bytes"
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

type MercurJSClient struct {
	baseURL      string
	clientID     string
	clientSecret string
	client       *http.Client
	tokenRepo    *repository.TokenRepository
}

func NewMercurJSClient(baseURL, clientID, clientSecret string, tokenRepo *repository.TokenRepository) *MercurJSClient {
	return &MercurJSClient{
		baseURL:      baseURL,
		clientID:     clientID,
		clientSecret: clientSecret,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		tokenRepo: tokenRepo,
	}
}

// Request makes a generic API request to MercurJS
// This is the main method for the adapter's generic proxy pattern
func (c *MercurJSClient) Request(method, path, shopID string) (map[string]interface{}, error) {
	var result map[string]interface{}
	err := c.doRequest(method, path, shopID, nil, &result)
	return result, err
}

// RequestWithBody makes an API request with a JSON body
func (c *MercurJSClient) RequestWithBody(method, path, shopID string, body interface{}) (map[string]interface{}, error) {
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request body: %w", err)
	}

	var result map[string]interface{}
	err = c.doRequest(method, path, shopID, bodyBytes, &result)
	return result, err
}

func (c *MercurJSClient) doRequest(method, path, shopID string, body []byte, result interface{}) error {
	token, err := c.tokenRepo.FindByShopID(shopID)
	if err != nil {
		return fmt.Errorf("failed to get token: %w", err)
	}
	if token == nil {
		return fmt.Errorf("no token found for shop=%s", shopID)
	}

	// Check if token needs refresh
	if token.ShouldRefresh() {
		token, err = c.refreshToken(token)
		if err != nil {
			return fmt.Errorf("failed to refresh token: %w", err)
		}
	}

	// Make request
	resp, err := c.doAuthenticatedRequest(method, path, token.AccessToken, body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// Handle 401 - try refresh and retry once
	if resp.StatusCode == http.StatusUnauthorized {
		token, err = c.refreshToken(token)
		if err != nil {
			return fmt.Errorf("failed to refresh token after 401: %w", err)
		}

		resp, err = c.doAuthenticatedRequest(method, path, token.AccessToken, body)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
	}

	// Check response status
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API error: status=%d body=%s", resp.StatusCode, string(respBody))
	}

	// Parse response
	if err := json.NewDecoder(resp.Body).Decode(result); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	return nil
}

func (c *MercurJSClient) doAuthenticatedRequest(method, path, accessToken string, body []byte) (*http.Response, error) {
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequest(method, c.baseURL+path, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	return c.client.Do(req)
}

func (c *MercurJSClient) refreshToken(token *models.Token) (*models.Token, error) {
	// Build form data for token refresh
	formData := url.Values{}
	formData.Set("grant_type", "refresh_token")
	formData.Set("refresh_token", token.RefreshToken)
	formData.Set("client_id", c.clientID)
	formData.Set("client_secret", c.clientSecret)

	// Call MercurJS OAuth token refresh endpoint
	req, err := http.NewRequest("POST", c.baseURL+"/oauth/token", strings.NewReader(formData.Encode()))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("token refresh failed: status=%d body=%s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		TokenType    string `json:"token_type"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return nil, err
	}

	// Update token in database
	token.AccessToken = tokenResp.AccessToken
	if tokenResp.RefreshToken != "" {
		token.RefreshToken = tokenResp.RefreshToken
	}
	token.ExpiresAt = time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)
	token.TokenType = tokenResp.TokenType

	if err := c.tokenRepo.Save(token); err != nil {
		return nil, fmt.Errorf("failed to save refreshed token: %w", err)
	}

	return token, nil
}
