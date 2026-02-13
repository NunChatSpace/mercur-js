package services

import (
	"fmt"

	"github.com/mercurjs/adapter/internal/models"
	"github.com/mercurjs/adapter/internal/repository"
)

type AuthService struct {
	repo *repository.TrustedServiceRepository
}

func NewAuthService(repo *repository.TrustedServiceRepository) *AuthService {
	return &AuthService{repo: repo}
}

// ValidateAPIKey validates an API key and returns the trusted service
func (s *AuthService) ValidateAPIKey(apiKey string) (*models.TrustedService, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("missing api_key")
	}

	service, err := s.repo.FindByAPIKey(apiKey)
	if err != nil {
		return nil, fmt.Errorf("failed to validate api_key: %w", err)
	}

	if service == nil {
		return nil, fmt.Errorf("invalid api_key")
	}

	if !service.IsActive {
		return nil, fmt.Errorf("service is inactive")
	}

	return service, nil
}

// ValidateAction checks if the service can perform the action
func (s *AuthService) ValidateAction(service *models.TrustedService, action string) error {
	if !service.CanPerformAction(action) {
		return fmt.Errorf("action '%s' not allowed for service '%s'", action, service.Name)
	}
	return nil
}
