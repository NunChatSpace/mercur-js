package broker

import (
	"encoding/json"
	"log"
	"strings"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/mercurjs/adapter/internal/config"
)

// RequestMessage represents incoming request from external services
type RequestMessage struct {
	RequestID string                 `json:"request_id"`
	APIKey    string                 `json:"api_key"`
	Platform  string                 `json:"platform"`
	ShopID    string                 `json:"shop_id"`
	Action    string                 `json:"action"`
	Params    map[string]interface{} `json:"params"`
}

// ResponseMessage represents response to external services
type ResponseMessage struct {
	RequestID string                 `json:"request_id"`
	Success   bool                   `json:"success"`
	Data      interface{}            `json:"data"`
	Error     *ErrorDetail           `json:"error"`
}

type ErrorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// RequestHandler handles a specific action
type RequestHandler func(req *RequestMessage) *ResponseMessage

// Consumer subscribes to request topics and routes to handlers
type Consumer struct {
	client    mqtt.Client
	handlers  map[string]RequestHandler
	publisher *Publisher
}

func NewConsumer(cfg *config.BrokerConfig, publisher *Publisher) (*Consumer, error) {
	opts := mqtt.NewClientOptions().
		AddBroker(cfg.URL).
		SetClientID(cfg.ClientID + "-consumer").
		SetAutoReconnect(true)

	if cfg.Username != "" {
		opts.SetUsername(cfg.Username)
		opts.SetPassword(cfg.Password)
	}

	client := mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		return nil, token.Error()
	}

	log.Println("[consumer] Connected to broker")

	return &Consumer{
		client:    client,
		handlers:  make(map[string]RequestHandler),
		publisher: publisher,
	}, nil
}

// RegisterHandler registers a handler for an action
func (c *Consumer) RegisterHandler(action string, handler RequestHandler) {
	c.handlers[action] = handler
	log.Printf("[consumer] Registered handler for action: %s", action)
}

// Start subscribes to request topics
func (c *Consumer) Start() error {
	topic := "requests/#"

	token := c.client.Subscribe(topic, 1, c.handleMessage)
	if token.Wait() && token.Error() != nil {
		return token.Error()
	}

	log.Printf("[consumer] Subscribed to: %s", topic)
	return nil
}

func (c *Consumer) handleMessage(client mqtt.Client, msg mqtt.Message) {
	log.Printf("[consumer] Received message on topic: %s", msg.Topic())

	// Parse topic:
	// - requests/{action}
	// - requests/{platform}/{action}
	parts := strings.Split(msg.Topic(), "/")
	if len(parts) < 2 {
		log.Printf("[consumer] Invalid topic format: %s", msg.Topic())
		return
	}

	topicAction := parts[len(parts)-1]
	topicPlatform := ""
	if len(parts) >= 3 && parts[0] == "requests" {
		topicPlatform = parts[1]
	}

	// Parse message
	var req RequestMessage
	if err := json.Unmarshal(msg.Payload(), &req); err != nil {
		log.Printf("[consumer] Failed to parse message: %v", err)
		c.publishError("", "parse_error", "Failed to parse request message")
		return
	}

	if req.Platform == "" && topicPlatform != "" {
		req.Platform = topicPlatform
	}

	// Use action from message (or fallback to topic)
	action := req.Action
	if action == "" {
		action = topicAction
	}

	// Find handler
	handler, ok := c.handlers[action]
	if !ok {
		log.Printf("[consumer] No handler for action: %s", action)
		c.publishError(req.RequestID, "unknown_action", "Unknown action: "+action)
		return
	}

	// Execute handler
	resp := handler(&req)

	// Publish response
	c.publishResponse(req.RequestID, resp)
}

func (c *Consumer) publishResponse(requestID string, resp *ResponseMessage) {
	if requestID == "" {
		log.Println("[consumer] Cannot publish response: missing request_id")
		return
	}

	resp.RequestID = requestID

	payload, err := json.Marshal(resp)
	if err != nil {
		log.Printf("[consumer] Failed to marshal response: %v", err)
		return
	}

	topic := "responses/" + requestID
	if err := c.publisher.PublishRaw(topic, payload); err != nil {
		log.Printf("[consumer] Failed to publish response: %v", err)
	} else {
		log.Printf("[consumer] Published response to: %s", topic)
	}
}

func (c *Consumer) publishError(requestID, code, message string) {
	resp := &ResponseMessage{
		RequestID: requestID,
		Success:   false,
		Data:      nil,
		Error: &ErrorDetail{
			Code:    code,
			Message: message,
		},
	}
	c.publishResponse(requestID, resp)
}

func (c *Consumer) Close() {
	c.client.Disconnect(250)
	log.Println("[consumer] Disconnected from broker")
}
