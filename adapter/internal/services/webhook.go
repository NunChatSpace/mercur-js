package services

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"log"
	"strings"

	"github.com/mercurjs/adapter/internal/broker"
	"github.com/mercurjs/adapter/internal/mapper"
)

// WebhookService handles webhook processing
type WebhookService interface {
	VerifySignature(payload []byte, signature string) bool
	ProcessWebhook(eventType string, data map[string]interface{}) error
}

type webhookService struct {
	secret    string
	publisher *broker.Publisher
	mapper    *mapper.Mapper
}

// NewWebhookService creates a new webhook service
func NewWebhookService(secret string, publisher *broker.Publisher, mapper *mapper.Mapper) WebhookService {
	return &webhookService{
		secret:    secret,
		publisher: publisher,
		mapper:    mapper,
	}
}

// VerifySignature verifies the webhook signature using HMAC-SHA256
func (s *webhookService) VerifySignature(payload []byte, signature string) bool {
	if s.secret == "" {
		return false
	}

	mac := hmac.New(sha256.New, []byte(s.secret))
	mac.Write(payload)
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	// Use constant-time comparison to prevent timing attacks
	return subtle.ConstantTimeCompare([]byte(signature), []byte(expectedSig)) == 1
}

// ProcessWebhook processes the webhook and publishes to broker
func (s *webhookService) ProcessWebhook(eventType string, data map[string]interface{}) error {
	// Extract platform and shop_id from data
	platform := extractString(data, "platform", "default")
	platformID := strings.ToLower(strings.TrimSpace(platform))
	if platformID == "" {
		platformID = "default"
	}
	shopID := extractString(data, "store_id", "")
	if shopID == "" {
		shopID = extractString(data, "shop_id", "")
	}

	if shopID == "" {
		return fmt.Errorf("shop_id is required in payload")
	}

	mappedData := data
	entityType := inferEntityType(eventType, data)
	if s.mapper != nil && entityType != "" {
		transformed, err := s.mapper.Transform(platformID, entityType, data)
		if err != nil {
			log.Printf("[webhook] Mapping failed (platform=%s entity=%s), using raw payload: %v", platformID, entityType, err)
		} else {
			mappedData = transformed
		}
	}

	// Publish to broker
	return s.publisher.Publish(platform, shopID, eventType, mappedData)
}

func inferEntityType(eventType string, data map[string]interface{}) string {
	if raw, ok := data["entity_type"].(string); ok && strings.TrimSpace(raw) != "" {
		return strings.ToLower(strings.TrimSpace(raw))
	}

	normalized := strings.ToLower(strings.TrimSpace(eventType))
	if normalized == "" {
		return ""
	}

	if strings.Contains(normalized, ".") {
		return strings.Split(normalized, ".")[0]
	}
	if strings.Contains(normalized, "_") {
		return strings.Split(normalized, "_")[0]
	}

	return normalized
}

// extractString extracts a string value from a map
func extractString(data map[string]interface{}, key, defaultVal string) string {
	if val, ok := data[key]; ok {
		if str, ok := val.(string); ok {
			return str
		}
	}
	return defaultVal
}
