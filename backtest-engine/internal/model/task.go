package model

// TaskStatus enumerates the lifecycle of an async task. Matches the
// `TaskStatus` enum in `api/openapi.yaml`.
type TaskStatus string

const (
	TaskStatusPending   TaskStatus = "pending"
	TaskStatusRunning   TaskStatus = "running"
	TaskStatusDone      TaskStatus = "done"
	TaskStatusFailed    TaskStatus = "failed"
	TaskStatusCancelled TaskStatus = "cancelled"
)

// TaskProgress is a small envelope carried inside TaskResponse while a
// task is running. All fields are optional.
type TaskProgress struct {
	Phase      string `json:"phase,omitempty"`
	CurrentBar int64  `json:"current_bar,omitempty"`
	TotalBars  int64  `json:"total_bars,omitempty"`
	CurrentRun int    `json:"current_run,omitempty"`
	TotalRuns  int    `json:"total_runs,omitempty"`
	Message    string `json:"message,omitempty"`
}

// TaskErrorBody matches the ErrorBody wire shape and is embedded on a
// failed TaskResponse.
type TaskErrorBody struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

// TaskResponse is the canonical envelope returned by every async
// start/status/result operation. `Result` carries the operation-
// specific payload when `Status == done`; handlers narrow the type
// via the openapi operation's response schema.
type TaskResponse struct {
	TaskID     string         `json:"task_id"`
	Status     TaskStatus     `json:"status"`
	Progress   *TaskProgress  `json:"progress,omitempty"`
	Result     any            `json:"result,omitempty"`
	Error      *TaskErrorBody `json:"error,omitempty"`
	StartedAt  int64          `json:"started_at"`
	FinishedAt *int64         `json:"finished_at,omitempty"`
}
