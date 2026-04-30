# ui-workspace-strategy-design (delta)

## REMOVED Requirements

### Requirement: Workspace Mode Switch (design / preview / deep)
**Reason**: The mode switch is collapsed.  The new
`unified-strategy-workspace` capability provides a single workspace
with center-pane tabs (code / chart / result) that subsume "design" and
"preview" — each user is always in one workspace, not switching modes.
Deep mode is preserved as a separate "view full report" surface
(see ui-workspace-deep-backtest delta).
**Migration**: Existing routes `kind: 'workspace'` continue to render
the new unified workspace; `workspace.mode` is removed from
`workspaceStore`.

### Requirement: AI Strategist Persona As Sole Chat Mode
**Reason**: Replaced by the state-aware AI in the new workspace
(see strategy-generation-ui delta and the design.md AI prompt
skeleton).  The persona's auto-save heuristic (parsing structured
output) is replaced by direct draft_* mutation on every AI turn.

### Requirement: Single-Symbol Run-Preview Path
**Reason**: Replaced by auto-backtest in the unified workspace, which
runs against the multi-symbol draft_symbols array.  See
`unified-strategy-workspace` capability.
