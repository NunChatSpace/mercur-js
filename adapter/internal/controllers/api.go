package controllers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/mercurjs/adapter/internal/broker"
)

// APIHandler handles HTTP requests and publishes to MQTT (async)
type APIHandler struct {
	publisher *broker.Publisher
	apiKey    string
}

func NewAPIHandler(publisher *broker.Publisher, apiKey string) *APIHandler {
	return &APIHandler{
		publisher: publisher,
		apiKey:    apiKey,
	}
}

// AsyncResponse is returned immediately after publishing to MQTT
type AsyncResponse struct {
	RequestID     string `json:"request_id"`
	Status        string `json:"status"`
	ResponseTopic string `json:"response_topic"`
}

// HandleGetSellerProducts handles GET /api/sellers/:id/products
// Publishes to MQTT and returns immediately with request_id
func (h *APIHandler) HandleGetSellerProducts(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	shopID := vars["id"]

	requestID := uuid.New().String()
	req := broker.RequestMessage{
		RequestID: requestID,
		APIKey:    h.apiKey,
		ShopID:    shopID,
		Action:    "api_request",
		Params: map[string]interface{}{
			"path":        fmt.Sprintf("/sellers/%s/products", shopID),
			"method":      "GET",
			"entity_type": "product",
			"entity_key":  "products",
		},
	}

	// Publish request to MQTT
	payload, _ := json.Marshal(req)
	topic := "requests/api_request"
	if err := h.publisher.PublishRaw(topic, payload); err != nil {
		log.Printf("[api-handler] Failed to publish request: %v", err)
		http.Error(w, "Failed to send request", http.StatusInternalServerError)
		return
	}

	log.Printf("[api-handler] Published request %s to %s", requestID, topic)

	// Return immediately with request_id
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AsyncResponse{
		RequestID:     requestID,
		Status:        "pending",
		ResponseTopic: fmt.Sprintf("responses/%s", requestID),
	})
}

// HandleGetSellers handles GET /api/sellers
// Publishes to MQTT and returns immediately with request_id
func (h *APIHandler) HandleGetSellers(w http.ResponseWriter, r *http.Request) {
	shopID := r.URL.Query().Get("shop_id")

	requestID := uuid.New().String()
	req := broker.RequestMessage{
		RequestID: requestID,
		APIKey:    h.apiKey,
		ShopID:    shopID,
		Action:    "api_request",
		Params: map[string]interface{}{
			"path":        "/sellers",
			"method":      "GET",
			"entity_type": "seller",
			"entity_key":  "sellers",
		},
	}

	payload, _ := json.Marshal(req)
	topic := "requests/api_request"
	if err := h.publisher.PublishRaw(topic, payload); err != nil {
		http.Error(w, "Failed to send request", http.StatusInternalServerError)
		return
	}

	log.Printf("[api-handler] Published request %s to %s", requestID, topic)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AsyncResponse{
		RequestID:     requestID,
		Status:        "pending",
		ResponseTopic: fmt.Sprintf("responses/%s", requestID),
	})
}

func (h *APIHandler) Close() {
	// Nothing to close in async mode
}
