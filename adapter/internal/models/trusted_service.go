package models

import "time"

type TrustedService struct {
	ID             string
	APIKey         string
	Name           string
	AllowedActions []string
	IsActive       bool
	CreatedAt      time.Time
}

func (s *TrustedService) CanPerformAction(action string) bool {
	if !s.IsActive {
		return false
	}
	for _, a := range s.AllowedActions {
		if a == action || a == "*" {
			return true
		}
	}
	return false
}
