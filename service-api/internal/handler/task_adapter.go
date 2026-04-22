package handler

import (
	"encoding/json"
	"time"

	"github.com/janespace-ai/claw-trader/service-api/internal/model"
)

// toTaskResponse converts a DB-level BacktestRun into the canonical
// `TaskResponse` envelope. Embedded JSON columns (progress / result)
// are re-hydrated so clients see structured objects rather than raw
// base64 / strings.
func toTaskResponse(run model.BacktestRun) model.TaskResponse {
	out := model.TaskResponse{
		TaskID: run.ID,
		Status: mapStatus(run.Status),
	}
	if run.StartedAt != nil {
		out.StartedAt = run.StartedAt.Unix()
	} else {
		out.StartedAt = run.CreatedAt.Unix()
	}
	if run.FinishedAt != nil {
		t := run.FinishedAt.Unix()
		out.FinishedAt = &t
	}
	if len(run.Progress) > 0 {
		var p model.TaskProgress
		if err := json.Unmarshal(run.Progress, &p); err == nil {
			out.Progress = &p
		}
	}
	if len(run.Result) > 0 && out.Status == model.TaskStatusDone {
		var raw any
		if err := json.Unmarshal(run.Result, &raw); err == nil {
			out.Result = raw
		}
	}
	if run.Error != "" && out.Status == model.TaskStatusFailed {
		out.Error = &model.TaskErrorBody{
			Code:    "INTERNAL_ERROR",
			Message: run.Error,
		}
	}
	return out
}

// toTaskResponseScreener is the ScreenerRun analog of toTaskResponse —
// same envelope, different source type.
func toTaskResponseScreener(run model.ScreenerRun) model.TaskResponse {
	out := model.TaskResponse{
		TaskID: run.ID,
		Status: mapStatus(run.Status),
	}
	if run.StartedAt != nil {
		out.StartedAt = run.StartedAt.Unix()
	} else {
		out.StartedAt = run.CreatedAt.Unix()
	}
	if run.FinishedAt != nil {
		t := run.FinishedAt.Unix()
		out.FinishedAt = &t
	}
	if len(run.Result) > 0 && out.Status == model.TaskStatusDone {
		var raw any
		if err := json.Unmarshal(run.Result, &raw); err == nil {
			out.Result = raw
		}
	}
	if run.Error != "" && out.Status == model.TaskStatusFailed {
		out.Error = &model.TaskErrorBody{
			Code:    "INTERNAL_ERROR",
			Message: run.Error,
		}
	}
	return out
}

// mapStatus normalizes legacy status strings to the canonical enum.
func mapStatus(s string) model.TaskStatus {
	switch s {
	case model.StatusPending:
		return model.TaskStatusPending
	case model.StatusRunning:
		return model.TaskStatusRunning
	case model.StatusDone:
		return model.TaskStatusDone
	case model.StatusFailed:
		return model.TaskStatusFailed
	case "cancelled":
		return model.TaskStatusCancelled
	default:
		return model.TaskStatusPending
	}
}

// unixNow is a small helper used by handlers that synthesize a
// started_at without reading the DB (e.g. fresh Start responses).
func unixNow() int64 { return time.Now().Unix() }
