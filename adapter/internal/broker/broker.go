package broker

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/mercurjs/adapter/internal/config"
	"github.com/mercurjs/adapter/internal/domains"
)

// Publisher handles publishing messages to broker
type Publisher struct {
	client mqtt.Client
}

// NewPublisher creates a new MQTT publisher
func NewPublisher(cfg *config.BrokerConfig) (*Publisher, error) {
	opts := mqtt.NewClientOptions().
		AddBroker(cfg.URL).
		SetClientID(cfg.ClientID).
		SetAutoReconnect(true).
		SetConnectRetry(true).
		SetConnectRetryInterval(5 * time.Second).
		SetOnConnectHandler(func(c mqtt.Client) {
			log.Println("[broker] Connected to message broker")
		}).
		SetConnectionLostHandler(func(c mqtt.Client, err error) {
			log.Printf("[broker] Connection lost: %v", err)
		})

	if cfg.Username != "" {
		opts.SetUsername(cfg.Username)
		opts.SetPassword(cfg.Password)
	}

	client := mqtt.NewClient(opts)

	// Connect with timeout
	token := client.Connect()
	if token.WaitTimeout(10 * time.Second) {
		if token.Error() != nil {
			return nil, fmt.Errorf("failed to connect to broker: %w", token.Error())
		}
	} else {
		return nil, fmt.Errorf("broker connection timeout")
	}

	return &Publisher{client: client}, nil
}

// Publish publishes a message to the broker
func (p *Publisher) Publish(platform, shopID, eventType string, data map[string]interface{}) error {
	topic := BuildTopic(platform, shopID, eventType)
	msg := domains.NewBrokerMessage(eventType, platform, shopID, data)

	payload, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	token := p.client.Publish(topic, 1, false, payload)
	if token.WaitTimeout(5 * time.Second) {
		if token.Error() != nil {
			return fmt.Errorf("failed to publish: %w", token.Error())
		}
	} else {
		return fmt.Errorf("publish timeout")
	}

	log.Printf("[broker] Published to %s", topic)
	return nil
}

// PublishRaw publishes raw bytes to a specific topic
func (p *Publisher) PublishRaw(topic string, payload []byte) error {
	token := p.client.Publish(topic, 1, false, payload)
	if token.WaitTimeout(5 * time.Second) {
		if token.Error() != nil {
			return fmt.Errorf("failed to publish: %w", token.Error())
		}
	} else {
		return fmt.Errorf("publish timeout")
	}
	return nil
}

// Close closes the broker connection
func (p *Publisher) Close() {
	p.client.Disconnect(1000)
	log.Println("[broker] Disconnected from message broker")
}
