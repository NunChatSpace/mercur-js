package controllers

import (
	"encoding/json"
	"io"
	"log"
	"net/http"

	"github.com/mercurjs/adapter/internal/domains"
	"github.com/mercurjs/adapter/internal/services"
)

// WebhookHandler handles webhook HTTP requests
type WebhookHandler struct {
	service services.WebhookService
}

// NewWebhookHandler creates a new webhook handler
func NewWebhookHandler(service services.WebhookService) *WebhookHandler {
	return &WebhookHandler{service: service}
}

// HandleWebhook handles POST /hook
func (h *WebhookHandler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	// Get headers
	signature := r.Header.Get("X-Webhook-Signature")
	eventType := r.Header.Get("X-Webhook-Event")

	// // Validate headers
	if signature == "" {
		h.respondError(w, http.StatusUnauthorized, "missing_signature", "X-Webhook-Signature header is required")
		return
	}

	if eventType == "" {
		h.respondError(w, http.StatusBadRequest, "missing_event_type", "X-Webhook-Event header is required")
		return
	}

	// Read body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid_body", "Failed to read request body")
		return
	}
	defer r.Body.Close()

	// Verify signature
	if !h.service.VerifySignature(body, signature) {
		h.respondError(w, http.StatusUnauthorized, "invalid_signature", "Webhook signature verification failed")
		return
	}

	// Parse payload
	var payload domains.WebhookPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid_json", "Failed to parse request body")
		return
	}

	// Process webhook
	if err := h.service.ProcessWebhook(eventType, payload.Data); err != nil {
		log.Printf("[webhook] Failed to process: %v", err)
		h.respondError(w, http.StatusInternalServerError, "process_failed", err.Error())
		return
	}

	// Success response
	h.respondJSON(w, http.StatusOK, domains.WebhookResponse{
		Success: true,
		Message: "Webhook received and published",
	})
}

// HandleHealth handles GET /health
func (h *WebhookHandler) HandleHealth(w http.ResponseWriter, r *http.Request) {
	h.respondJSON(w, http.StatusOK, map[string]string{
		"status": "ok",
	})
}

func (h *WebhookHandler) respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (h *WebhookHandler) respondError(w http.ResponseWriter, status int, code, message string) {
	h.respondJSON(w, status, domains.ErrorResponse{
		Error:   code,
		Message: message,
	})
}
