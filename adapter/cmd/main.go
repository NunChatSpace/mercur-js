package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/mercurjs/adapter/internal/api"
	"github.com/mercurjs/adapter/internal/broker"
	"github.com/mercurjs/adapter/internal/config"
	"github.com/mercurjs/adapter/internal/controllers"
	"github.com/mercurjs/adapter/internal/database"
	"github.com/mercurjs/adapter/internal/mapper"
	"github.com/mercurjs/adapter/internal/repository"
	"github.com/mercurjs/adapter/internal/services"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize database
	db, err := database.New(cfg.Database.ConnectionString())
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Create repositories
	tokenRepo := repository.NewTokenRepository(db)
	trustedServiceRepo := repository.NewTrustedServiceRepository(db)
	fieldMappingRepo := repository.NewFieldMappingRepository(db)

	// Create broker publisher
	publisher, err := broker.NewPublisher(&cfg.Broker)
	if err != nil {
		log.Fatalf("Failed to create broker publisher: %v", err)
	}
	defer publisher.Close()

	// Create MercurJS API client
	apiClient := api.NewMercurJSClient(cfg.MercurJS.BaseURL, cfg.MercurJS.ClientID, cfg.MercurJS.ClientSecret, tokenRepo)

	// Create mapper
	fieldMapper := mapper.New(fieldMappingRepo)

	// Create services
	webhookService := services.NewWebhookService(cfg.WebhookSecret, publisher, fieldMapper)
	authService := services.NewAuthService(trustedServiceRepo)
	consumerService := services.NewConsumerService(authService, apiClient, fieldMapper)
	oauthService := services.NewOAuthService(cfg.MercurJS.BaseURL, cfg.MercurJS.ClientID, cfg.MercurJS.ClientSecret, cfg.MercurJS.RedirectURI, tokenRepo)

	// Create broker consumer
	consumer, err := broker.NewConsumer(&cfg.Broker, publisher)
	if err != nil {
		log.Fatalf("Failed to create broker consumer: %v", err)
	}
	defer consumer.Close()

	// Register handlers and start consumer
	consumerService.RegisterHandlers(consumer)
	if err := consumer.Start(); err != nil {
		log.Fatalf("Failed to start consumer: %v", err)
	}

	// Create handlers
	webhookHandler := controllers.NewWebhookHandler(webhookService)
	oauthHandler := controllers.NewOAuthHandler(oauthService, cfg.WebUIURL)
	mappingsHandler := controllers.NewMappingsHandler(fieldMappingRepo, fieldMapper)

	// Create API handler for async MQTT requests
	apiHandler := controllers.NewAPIHandler(publisher, "test-key-789")

	// Create router
	router := mux.NewRouter()

	// Enable CORS for WebUI
	router.Use(corsMiddleware)

	// Mount routes
	router.HandleFunc("/hook", webhookHandler.HandleWebhook).Methods("POST")
	router.HandleFunc("/health", webhookHandler.HandleHealth).Methods("GET")
	router.HandleFunc("/oauth/callback", oauthHandler.HandleCallback).Methods("GET")
	router.HandleFunc("/api/mappings", mappingsHandler.HandleListMappings).Methods("GET")
	router.HandleFunc("/api/mappings", mappingsHandler.HandleUpsertMapping).Methods("POST")
	router.HandleFunc("/api/mappings/{id}", mappingsHandler.HandleDeleteMapping).Methods("DELETE")

	// API routes (proxied through MQTT)
	router.HandleFunc("/api/sellers", apiHandler.HandleGetSellers).Methods("GET")
	router.HandleFunc("/api/sellers/{id}/products", apiHandler.HandleGetSellerProducts).Methods("GET")

	// Create server
	addr := fmt.Sprintf("%s:%s", cfg.Host, cfg.Port)
	server := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Printf("[adapter] Server running on %s", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[adapter] Shutting down...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("[adapter] Server stopped")
}

// corsMiddleware adds CORS headers for WebUI access
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
