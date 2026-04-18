package handler

import (
	"context"
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/model"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/service"
)

// SyncHandler wraps HTTP endpoints for sync operations.
type SyncHandler struct {
	svc *service.SyncService
}

// NewSyncHandler constructs the handler.
func NewSyncHandler(svc *service.SyncService) *SyncHandler {
	return &SyncHandler{svc: svc}
}

type startRequest struct {
	Mode string `json:"mode"`
}

type startResponse struct {
	TaskID string `json:"task_id"`
	Status string `json:"status"`
}

// Start handles POST /api/sync/start.
func (h *SyncHandler) Start(ctx context.Context, c *app.RequestContext) {
	var req startRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if req.Mode == "" {
		req.Mode = string(model.SyncModeFull)
	}
	mode := model.SyncMode(req.Mode)
	switch mode {
	case model.SyncModeFull, model.SyncModeS3, model.SyncModeAPI, model.SyncModeRepair:
	default:
		c.JSON(http.StatusBadRequest, map[string]string{"error": "unknown mode: " + req.Mode})
		return
	}

	taskID, err := h.svc.Start(mode)
	if err != nil {
		c.JSON(http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, startResponse{TaskID: taskID, Status: model.SyncStatusRunning})
}

// Status handles GET /api/sync/status.
func (h *SyncHandler) Status(ctx context.Context, c *app.RequestContext) {
	task := h.svc.Status()
	if task == nil {
		c.JSON(http.StatusOK, map[string]string{"status": "idle"})
		return
	}
	c.JSON(http.StatusOK, task)
}
