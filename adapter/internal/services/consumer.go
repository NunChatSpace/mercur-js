package services

import (
	"fmt"
	"log"
	"strings"

	"github.com/mercurjs/adapter/internal/api"
	"github.com/mercurjs/adapter/internal/broker"
	"github.com/mercurjs/adapter/internal/mapper"
)

type ConsumerService struct {
	auth      *AuthService
	apiClient *api.MercurJSClient
	mapper    *mapper.Mapper
}

func resolvePlatformID(req *broker.RequestMessage) string {
	if req.Platform != "" {
		return strings.ToLower(strings.TrimSpace(req.Platform))
	}

	if req.Params != nil {
		if platform, ok := req.Params["platform"].(string); ok && strings.TrimSpace(platform) != "" {
			return strings.ToLower(strings.TrimSpace(platform))
		}
	}

	return "default"
}

func NewConsumerService(auth *AuthService, apiClient *api.MercurJSClient, mapper *mapper.Mapper) *ConsumerService {
	return &ConsumerService{
		auth:      auth,
		apiClient: apiClient,
		mapper:    mapper,
	}
}

// RegisterHandlers registers the generic API request handler with the consumer
func (s *ConsumerService) RegisterHandlers(consumer *broker.Consumer) {
	// Single generic handler for all API requests
	consumer.RegisterHandler("api_request", s.handleAPIRequest)
	// Create product handler
	consumer.RegisterHandler("create_product", s.handleCreateProduct)
}

// handleAPIRequest is a generic proxy handler that forwards requests to MercurJS
// Request params:
//   - path: API path (e.g., "/sellers", "/sellers/123/products")
//   - method: HTTP method (default: "GET")
//   - entity_type: Entity type for field mapping (e.g., "seller", "product")
//   - entity_key: Key in response containing entities to map (e.g., "sellers", "products")
func (s *ConsumerService) handleAPIRequest(req *broker.RequestMessage) *broker.ResponseMessage {
	// Validate API key
	service, err := s.auth.ValidateAPIKey(req.APIKey)
	if err != nil {
		return errorResponse(req.RequestID, "unauthorized", err.Error())
	}

	// Validate action permission - use "api_request" or "*" for generic access
	if err := s.auth.ValidateAction(service, "api_request"); err != nil {
		return errorResponse(req.RequestID, "forbidden", err.Error())
	}

	// Get required path param
	path, ok := req.Params["path"].(string)
	if !ok || path == "" {
		return errorResponse(req.RequestID, "bad_request", "path is required in params")
	}

	// Get optional method param (default to GET)
	method := "GET"
	if m, ok := req.Params["method"].(string); ok && m != "" {
		method = strings.ToUpper(m)
	}

	// Call MercurJS API
	result, err := s.apiClient.Request(method, path, req.ShopID)
	if err != nil {
		log.Printf("[consumer] API request error: %v", err)
		return errorResponse(req.RequestID, "api_error", err.Error())
	}

	// Apply field mapping if entity_type is specified
	entityType, hasEntityType := req.Params["entity_type"].(string)
	entityKey, hasEntityKey := req.Params["entity_key"].(string)

	platformID := resolvePlatformID(req)

	if hasEntityType && entityType != "" && hasEntityKey && entityKey != "" {
		// Map array of entities
		if entities, ok := result[entityKey].([]interface{}); ok {
			var mappedEntities []map[string]interface{}
			for _, entity := range entities {
				if entityMap, ok := entity.(map[string]interface{}); ok {
					mapped, err := s.mapper.Transform(platformID, entityType, entityMap)
					if err != nil {
						mappedEntities = append(mappedEntities, entityMap)
					} else {
						mappedEntities = append(mappedEntities, mapped)
					}
				}
			}
			result[entityKey] = mappedEntities
		}
	} else if hasEntityType && entityType != "" {
		// Map single entity (the result itself)
		mapped, err := s.mapper.Transform(platformID, entityType, result)
		if err != nil {
			log.Printf("[consumer] Mapping error: %v", err)
		} else {
			result = mapped
		}
	}

	return successResponse(req.RequestID, result)
}

// handleCreateProduct handles product creation requests from external services
// Request params:
//   - product: product data object to create
//   - entity_type: (optional) entity type for reverse field mapping
func (s *ConsumerService) handleCreateProduct(req *broker.RequestMessage) *broker.ResponseMessage {
	// Validate API key
	service, err := s.auth.ValidateAPIKey(req.APIKey)
	if err != nil {
		return errorResponse(req.RequestID, "unauthorized", err.Error())
	}

	// Validate action permission
	if err := s.auth.ValidateAction(service, "create_product"); err != nil {
		return errorResponse(req.RequestID, "forbidden", err.Error())
	}

	// Extract product data from params
	productData, ok := req.Params["product"].(map[string]interface{})
	if !ok || productData == nil {
		return errorResponse(req.RequestID, "bad_request", "product data is required in params")
	}

	// Apply reverse field mapping if entity_type is specified
	if entityType, ok := req.Params["entity_type"].(string); ok && entityType != "" {
		mapped, err := s.mapper.ReverseTransform(resolvePlatformID(req), entityType, productData)
		if err != nil {
			log.Printf("[consumer] Reverse mapping error: %v", err)
		} else {
			productData = mapped
		}
	}

	// Call MercurJS API to create product
	path := fmt.Sprintf("/sellers/%s/products", req.ShopID)
	result, err := s.apiClient.RequestWithBody("POST", path, req.ShopID, productData)
	if err != nil {
		log.Printf("[consumer] Create product error: %v", err)
		return errorResponse(req.RequestID, "api_error", err.Error())
	}

	return successResponse(req.RequestID, result)
}

func successResponse(requestID string, data interface{}) *broker.ResponseMessage {
	return &broker.ResponseMessage{
		RequestID: requestID,
		Success:   true,
		Data:      data,
		Error:     nil,
	}
}

func errorResponse(requestID, code, message string) *broker.ResponseMessage {
	return &broker.ResponseMessage{
		RequestID: requestID,
		Success:   false,
		Data:      nil,
		Error: &broker.ErrorDetail{
			Code:    code,
			Message: message,
		},
	}
}
