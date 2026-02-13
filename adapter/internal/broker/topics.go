package broker

import (
	"fmt"
	"strings"
)

// BuildTopic builds a topic string for the message broker
// Format: orders/{event_type} (e.g., orders/order.created)
func BuildTopic(platform, shopID, eventType string) string {
	// Use full event type as topic (e.g., "order.created")
	return fmt.Sprintf("orders/%s", eventType)
}

// ParseTopic parses a topic string back to components
func ParseTopic(topic string) (eventType string, ok bool) {
	parts := strings.Split(topic, "/")
	if len(parts) != 2 || parts[0] != "orders" {
		return "", false
	}
	return parts[1], true
}
