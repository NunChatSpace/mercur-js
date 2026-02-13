package domains

import "time"

// WebhookPayload is the payload received from MercurJS
type WebhookPayload struct {
	EventType string                 `json:"event_type"`
	Timestamp string                 `json:"timestamp"`
	Data      map[string]interface{} `json:"data"`
}

// BrokerMessage is the message published to the broker
type BrokerMessage struct {
	EventType string                 `json:"event_type"`
	Timestamp string                 `json:"timestamp"`
	Platform  string                 `json:"platform"`
	ShopID    string                 `json:"shop_id"`
	Data      map[string]interface{} `json:"data"`
}

// NewBrokerMessage creates a new broker message
func NewBrokerMessage(eventType, platform, shopID string, data map[string]interface{}) *BrokerMessage {
	return &BrokerMessage{
		EventType: eventType,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Platform:  platform,
		ShopID:    shopID,
		Data:      data,
	}
}

// WebhookResponse is the response returned to MercurJS
type WebhookResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// ErrorResponse is the error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}
