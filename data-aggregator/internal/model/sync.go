package model

import "time"

// SyncStatus enumerates job/task lifecycle states.
const (
	SyncStatusPending = "pending"
	SyncStatusRunning = "running"
	SyncStatusDone    = "done"
	SyncStatusFailed  = "failed"
	SyncStatusSkipped = "skipped"
)

// SyncMode is the coarse granularity of a requested sync.
type SyncMode string

const (
	SyncModeFull   SyncMode = "full"
	SyncModeS3     SyncMode = "s3"
	SyncModeAPI    SyncMode = "api"
	SyncModeRepair SyncMode = "repair"
)

// SyncState records a per (symbol, market, interval, source, period) sync outcome.
type SyncState struct {
	Symbol   string
	Market   string
	Interval string
	Source   string // 's3' | 'api' | 'aggregate'
	Period   string // 'YYYYMM' or 'api'
	Status   string
	RowCount int64
	Error    string
	SyncedAt time.Time
}

// SyncProgress is an in-memory snapshot of a running sync task.
type SyncProgress struct {
	Phase string `json:"phase"` // 'symbols' | 's3_download' | 'aggregate' | 'api_fill' | 'gap_repair' | 'done'
	S3    Counter `json:"s3_progress"`
	API   Counter `json:"api_progress"`
	Gap   Counter `json:"gap_progress"`
}

// Counter is a simple done/total/failed tally.
type Counter struct {
	Done   int64 `json:"done"`
	Total  int64 `json:"total"`
	Failed int64 `json:"failed"`
}

// SyncTask is the top-level record for a user-triggered sync.
type SyncTask struct {
	TaskID      string        `json:"task_id"`
	Mode        SyncMode      `json:"mode"`
	Status      string        `json:"status"`
	Progress    SyncProgress  `json:"progress"`
	StartedAt   time.Time     `json:"started_at"`
	FinishedAt *time.Time    `json:"finished_at,omitempty"`
	Error       string        `json:"error,omitempty"`
}
