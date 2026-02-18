package controllers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"github.com/mercurjs/adapter/internal/mapper"
	"github.com/mercurjs/adapter/internal/models"
	"github.com/mercurjs/adapter/internal/repository"
)

type MappingsHandler struct {
	repo   *repository.FieldMappingRepository
	mapper *mapper.Mapper
}

func NewMappingsHandler(repo *repository.FieldMappingRepository, fieldMapper *mapper.Mapper) *MappingsHandler {
	return &MappingsHandler{
		repo:   repo,
		mapper: fieldMapper,
	}
}

type upsertMappingRequest struct {
	PlatformID  string `json:"platform_id"`
	EntityType  string `json:"entity_type"`
	SourceField string `json:"source_field"`
	TargetField string `json:"target_field"`
	Transform   string `json:"transform"`
	IsActive    *bool  `json:"is_active"`
}

func (h *MappingsHandler) HandleListMappings(w http.ResponseWriter, r *http.Request) {
	platformID := strings.TrimSpace(r.URL.Query().Get("platform_id"))
	entityType := strings.TrimSpace(r.URL.Query().Get("entity_type"))

	mappings, err := h.repo.List(platformID, entityType)
	if err != nil {
		http.Error(w, "Failed to load mappings", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"mappings": mappings,
		"count":    len(mappings),
	})
}

func (h *MappingsHandler) HandleUpsertMapping(w http.ResponseWriter, r *http.Request) {
	var req upsertMappingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	platformID := strings.ToLower(strings.TrimSpace(req.PlatformID))
	entityType := strings.ToLower(strings.TrimSpace(req.EntityType))
	sourceField := strings.TrimSpace(req.SourceField)
	targetField := strings.TrimSpace(req.TargetField)
	transform := strings.TrimSpace(req.Transform)

	if platformID == "" {
		platformID = "default"
	}

	if entityType == "" || sourceField == "" || targetField == "" {
		http.Error(w, "platform_id/entity_type/source_field/target_field are required", http.StatusBadRequest)
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	row, err := h.repo.Upsert(&models.FieldMapping{
		PlatformID:  platformID,
		EntityType:  entityType,
		SourceField: sourceField,
		TargetField: targetField,
		Transform:   transform,
		IsActive:    isActive,
	})
	if err != nil {
		http.Error(w, "Failed to save mapping", http.StatusInternalServerError)
		return
	}

	h.mapper.ClearCache()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"mapping": row,
	})
}

func (h *MappingsHandler) HandleDeleteMapping(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(mux.Vars(r)["id"])
	if id == "" {
		http.Error(w, "id is required", http.StatusBadRequest)
		return
	}

	if err := h.repo.DeleteByID(id); err != nil {
		http.Error(w, "Failed to delete mapping", http.StatusInternalServerError)
		return
	}

	h.mapper.ClearCache()
	w.WriteHeader(http.StatusNoContent)
}
