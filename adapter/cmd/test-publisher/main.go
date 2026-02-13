package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/joho/godotenv"
)

type RequestMessage struct {
	RequestID string                 `json:"request_id"`
	APIKey    string                 `json:"api_key"`
	Platform  string                 `json:"platform"`
	ShopID    string                 `json:"shop_id"`
	Action    string                 `json:"action"`
	Params    map[string]interface{} `json:"params"`
}

func main() {
	godotenv.Load()

	// Flags
	action := flag.String("action", "get_stores", "Action to perform (get_stores, get_store, get_products)")
	platform := flag.String("platform", "shopee", "Platform ID")
	shopID := flag.String("shop", "shop_001", "Shop ID")
	storeID := flag.String("store", "", "Store ID (for get_store, get_products)")
	apiKey := flag.String("key", "shopee-key-123", "API key")
	flag.Parse()

	// Connect to broker
	brokerURL := os.Getenv("BROKER_URL")
	if brokerURL == "" {
		brokerURL = "tcp://localhost:1883"
	}

	opts := mqtt.NewClientOptions().
		AddBroker(brokerURL).
		SetClientID("test-publisher-" + fmt.Sprintf("%d", time.Now().Unix()))

	client := mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		log.Fatalf("Failed to connect: %v", token.Error())
	}
	defer client.Disconnect(250)

	log.Printf("Connected to broker: %s", brokerURL)

	// Build request
	requestID := fmt.Sprintf("req_%d", time.Now().UnixNano())
	req := RequestMessage{
		RequestID: requestID,
		APIKey:    *apiKey,
		Platform:  *platform,
		ShopID:    *shopID,
		Action:    *action,
		Params:    make(map[string]interface{}),
	}

	if *storeID != "" {
		req.Params["store_id"] = *storeID
	}

	payload, _ := json.MarshalIndent(req, "", "  ")
	topic := fmt.Sprintf("requests/%s/%s", *platform, *action)

	log.Printf("Publishing to: %s", topic)
	log.Printf("Payload:\n%s", string(payload))

	// Publish request
	token := client.Publish(topic, 1, false, payload)
	if token.Wait() && token.Error() != nil {
		log.Fatalf("Failed to publish: %v", token.Error())
	}

	log.Println("Request published!")

	// Subscribe to response
	responseTopic := fmt.Sprintf("responses/%s/%s", *platform, requestID)
	log.Printf("Waiting for response on: %s", responseTopic)

	received := make(chan []byte, 1)
	client.Subscribe(responseTopic, 1, func(c mqtt.Client, m mqtt.Message) {
		received <- m.Payload()
	})

	// Wait for response with timeout
	select {
	case resp := <-received:
		var prettyResp map[string]interface{}
		json.Unmarshal(resp, &prettyResp)
		pretty, _ := json.MarshalIndent(prettyResp, "", "  ")
		log.Printf("Response received:\n%s", string(pretty))
	case <-time.After(30 * time.Second):
		log.Println("Timeout waiting for response")
	}
}
