package models

import "time"

type FieldMapping struct {
	ID          string
	PlatformID  string
	EntityType  string
	SourceField string
	TargetField string
	Transform   string
	IsActive    bool
	CreatedAt   time.Time
}
