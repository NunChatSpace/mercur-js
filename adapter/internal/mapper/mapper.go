package mapper

import (
	"encoding/json"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/mercurjs/adapter/internal/models"
	"github.com/mercurjs/adapter/internal/repository"
)

type Mapper struct {
	repo  *repository.FieldMappingRepository
	cache map[string][]*models.FieldMapping
	mu    sync.RWMutex
	ttl   time.Duration
}

func New(repo *repository.FieldMappingRepository) *Mapper {
	return &Mapper{
		repo:  repo,
		cache: make(map[string][]*models.FieldMapping),
		ttl:   5 * time.Minute,
	}
}

// Transform converts MercurJS JSON to platform-specific format
func (m *Mapper) Transform(platformID, entityType string, data map[string]interface{}) (map[string]interface{}, error) {
	mappings, err := m.getMappings(platformID, entityType)
	if err != nil {
		return nil, err
	}

	// If no mappings, return original data
	if len(mappings) == 0 {
		return data, nil
	}

	result := make(map[string]interface{})

	for _, mapping := range mappings {
		value := getNestedValue(data, mapping.SourceField)
		if value == nil {
			continue
		}

		// Apply transform if specified
		if mapping.Transform != "" {
			value = applyTransform(value, mapping.Transform)
		}

		// Set nested value in result
		setNestedValue(result, mapping.TargetField, value)
	}

	return result, nil
}

// ReverseTransform converts platform-specific format back to MercurJS JSON
// Uses the same mappings but swaps source/target direction and inverts transforms
func (m *Mapper) ReverseTransform(platformID, entityType string, data map[string]interface{}) (map[string]interface{}, error) {
	mappings, err := m.getMappings(platformID, entityType)
	if err != nil {
		return nil, err
	}

	if len(mappings) == 0 {
		return data, nil
	}

	result := make(map[string]interface{})

	for _, mapping := range mappings {
		// Read from TargetField (platform field) instead of SourceField
		value := getNestedValue(data, mapping.TargetField)
		if value == nil {
			continue
		}

		// Apply inverse transform if specified
		if mapping.Transform != "" {
			value = applyInverseTransform(value, mapping.Transform)
		}

		// Write to SourceField (MercurJS field) instead of TargetField
		setNestedValue(result, mapping.SourceField, value)
	}

	return result, nil
}

// TransformJSON transforms JSON bytes
func (m *Mapper) TransformJSON(platformID, entityType string, jsonData []byte) ([]byte, error) {
	var data map[string]interface{}
	if err := json.Unmarshal(jsonData, &data); err != nil {
		return nil, err
	}

	result, err := m.Transform(platformID, entityType, data)
	if err != nil {
		return nil, err
	}

	return json.Marshal(result)
}

func (m *Mapper) getMappings(platformID, entityType string) ([]*models.FieldMapping, error) {
	cacheKey := platformID + ":" + entityType

	m.mu.RLock()
	if cached, ok := m.cache[cacheKey]; ok {
		m.mu.RUnlock()
		return cached, nil
	}
	m.mu.RUnlock()

	mappings, err := m.repo.FindByPlatformAndEntity(platformID, entityType)
	if err != nil {
		return nil, err
	}

	m.mu.Lock()
	m.cache[cacheKey] = mappings
	m.mu.Unlock()

	return mappings, nil
}

// ClearCache clears the mapping cache
func (m *Mapper) ClearCache() {
	m.mu.Lock()
	m.cache = make(map[string][]*models.FieldMapping)
	m.mu.Unlock()
}

// getNestedValue gets value from nested map using dot notation
// e.g., "variants.0.price" -> data["variants"][0]["price"]
func getNestedValue(data map[string]interface{}, path string) interface{} {
	parts := strings.Split(path, ".")
	var current interface{} = data

	for _, part := range parts {
		switch v := current.(type) {
		case map[string]interface{}:
			current = v[part]
		case []interface{}:
			idx, err := strconv.Atoi(part)
			if err != nil || idx < 0 || idx >= len(v) {
				return nil
			}
			current = v[idx]
		default:
			return nil
		}

		if current == nil {
			return nil
		}
	}

	return current
}

// setNestedValue sets value in nested map using dot notation
func setNestedValue(data map[string]interface{}, path string, value interface{}) {
	parts := strings.Split(path, ".")
	updated := setNestedNode(data, parts, value)
	if obj, ok := updated.(map[string]interface{}); ok {
		for k := range data {
			delete(data, k)
		}
		for k, v := range obj {
			data[k] = v
		}
	}
}

func setNestedNode(current interface{}, parts []string, value interface{}) interface{} {
	if len(parts) == 0 {
		return value
	}

	part := parts[0]
	if idx, err := strconv.Atoi(part); err == nil {
		var arr []interface{}
		if existing, ok := current.([]interface{}); ok {
			arr = existing
		}

		for len(arr) <= idx {
			arr = append(arr, nil)
		}
		arr[idx] = setNestedNode(arr[idx], parts[1:], value)
		return arr
	}

	var obj map[string]interface{}
	if existing, ok := current.(map[string]interface{}); ok && existing != nil {
		obj = existing
	} else {
		obj = make(map[string]interface{})
	}

	obj[part] = setNestedNode(obj[part], parts[1:], value)
	return obj
}

// applyTransform applies a transform function to a value
func applyTransform(value interface{}, transform string) interface{} {
	switch transform {
	case "uppercase":
		if s, ok := value.(string); ok {
			return strings.ToUpper(s)
		}
	case "lowercase":
		if s, ok := value.(string); ok {
			return strings.ToLower(s)
		}
	case "cents_to_dollars":
		switch v := value.(type) {
		case float64:
			return v / 100
		case int:
			return float64(v) / 100
		}
	case "dollars_to_cents":
		switch v := value.(type) {
		case float64:
			return int(v * 100)
		case int:
			return v * 100
		}
	case "string":
		return toString(value)
	case "int":
		return toInt(value)
	case "bool":
		return toBool(value)
	case "date_iso":
		if s, ok := value.(string); ok {
			t, err := time.Parse("2006-01-02", s)
			if err == nil {
				return t.Format(time.RFC3339)
			}
		}
	}
	return value
}

// applyInverseTransform applies the inverse of a transform function
func applyInverseTransform(value interface{}, transform string) interface{} {
	switch transform {
	case "cents_to_dollars":
		return applyTransform(value, "dollars_to_cents")
	case "dollars_to_cents":
		return applyTransform(value, "cents_to_dollars")
	default:
		// Most transforms (uppercase, lowercase, string, int, bool, date_iso) are
		// applied the same way in both directions
		return applyTransform(value, transform)
	}
}

func toString(v interface{}) string {
	switch val := v.(type) {
	case string:
		return val
	case float64:
		return strconv.FormatFloat(val, 'f', -1, 64)
	case int:
		return strconv.Itoa(val)
	case bool:
		return strconv.FormatBool(val)
	default:
		return ""
	}
}

func toInt(v interface{}) int {
	switch val := v.(type) {
	case float64:
		return int(val)
	case int:
		return val
	case string:
		i, _ := strconv.Atoi(val)
		return i
	default:
		return 0
	}
}

func toBool(v interface{}) bool {
	switch val := v.(type) {
	case bool:
		return val
	case string:
		return val == "true" || val == "1" || val == "yes"
	case float64:
		return val != 0
	case int:
		return val != 0
	default:
		return false
	}
}
