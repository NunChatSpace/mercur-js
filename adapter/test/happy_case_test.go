package test

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

var (
	adapterURL    = getEnv("ADAPTER_URL", "http://localhost:3001")
	brokerURL     = getEnv("BROKER_URL", "tcp://localhost:1883")
	webhookSecret = getEnv("WEBHOOK_SECRET", "test-secret-123")
)

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func generateSignature(payload []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}

func TestHappyCase(t *testing.T) {
	fmt.Println("🚀 Starting Happy Case Test")
	fmt.Println("\nFlow: MercurJS Hook → Adapter → Message Broker → Subscriber\n")

	// Channel to receive message
	messageReceived := make(chan map[string]interface{}, 1)

	// Step 1: Connect subscriber to broker
	fmt.Println("📡 Step 1: Connecting subscriber to Message Broker...")

	opts := mqtt.NewClientOptions().
		AddBroker(brokerURL).
		SetClientID(fmt.Sprintf("test-subscriber-%d", time.Now().UnixNano()))

	subscriber := mqtt.NewClient(opts)
	token := subscriber.Connect()
	if !token.WaitTimeout(10 * time.Second) {
		t.Fatal("Subscriber connection timeout")
	}
	if token.Error() != nil {
		t.Fatalf("Subscriber connection error: %v", token.Error())
	}
	defer subscriber.Disconnect(1000)

	fmt.Println("   ✅ Subscriber connected to Message Broker")

	// Subscribe to topic
	topic := "orders/shopee/store_456/created"
	subToken := subscriber.Subscribe(topic, 1, func(c mqtt.Client, m mqtt.Message) {
		fmt.Printf("\n📬 Step 3: Message received from broker!\n")
		fmt.Printf("   Topic: %s\n", m.Topic())

		var msg map[string]interface{}
		if err := json.Unmarshal(m.Payload(), &msg); err == nil {
			messageReceived <- msg
		}
	})

	if !subToken.WaitTimeout(5 * time.Second) {
		t.Fatal("Subscribe timeout")
	}
	fmt.Printf("   ✅ Subscribed to topic: %s\n", topic)

	// Step 2: Send webhook to adapter
	fmt.Println("\n📤 Step 2: Sending webhook to Adapter...")

	payload := map[string]interface{}{
		"event_type": "order.created",
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
		"data": map[string]interface{}{
			"order_id":      "order_test_123",
			"store_id":      "store_456",
			"platform":      "shopee",
			"currency_code": "USD",
			"items": []map[string]interface{}{
				{
					"id":         "item_1",
					"title":      "Test Product",
					"quantity":   2,
					"unit_price": 1000,
				},
			},
		},
	}

	payloadBytes, _ := json.Marshal(payload)
	signature := generateSignature(payloadBytes, webhookSecret)

	fmt.Printf("   URL: %s/hook\n", adapterURL)
	fmt.Printf("   Event: order.created\n")
	fmt.Printf("   Signature: %s...\n", signature[:20])

	req, _ := http.NewRequest("POST", adapterURL+"/hook", bytes.NewReader(payloadBytes))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Webhook-Signature", signature)
	req.Header.Set("X-Webhook-Event", "order.created")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("Failed to send webhook: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		fmt.Printf("   ✅ Adapter responded: %d\n", resp.StatusCode)
	} else {
		t.Fatalf("Adapter error: %d", resp.StatusCode)
	}

	// Step 3: Wait for message
	fmt.Println("\n⏳ Waiting for message to arrive at subscriber...")

	select {
	case msg := <-messageReceived:
		fmt.Println("\n📊 Test Results:")
		fmt.Println("──────────────────────────────────────────────────")
		fmt.Println("✅ Message received from Message Broker!")

		// Verify payload
		fmt.Println("\nPayload verification:")
		checks := []struct {
			name     string
			expected interface{}
			actual   interface{}
		}{
			{"event_type", "order.created", msg["event_type"]},
			{"platform", "shopee", msg["platform"]},
			{"shop_id", "store_456", msg["shop_id"]},
		}

		allPassed := true
		for _, check := range checks {
			passed := check.expected == check.actual
			if !passed {
				allPassed = false
			}
			status := "✅"
			if !passed {
				status = "❌"
			}
			fmt.Printf("  %s %s: %v\n", status, check.name, check.actual)
		}

		fmt.Println("\n──────────────────────────────────────────────────")
		if allPassed {
			fmt.Println("🎉 ALL TESTS PASSED!")
		} else {
			t.Fatal("Some checks failed")
		}

	case <-time.After(5 * time.Second):
		t.Fatal("❌ Message NOT received from Message Broker (timeout)")
	}
}
