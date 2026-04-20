import type { ReactNode } from 'react';

interface Props {
  /** Top bar content (fixed 52px height by default). Omit to skip —
   *  screens that don't need a workspace-level header row (e.g. the
   *  Strategy Design screen after its CTA moved into the AI panel
   *  header) can leave it off entirely. */
  topbar?: ReactNode;
  /** Left rail (symbol watchlist, etc). Omit to skip. */
  leftRail?: ReactNode;
  /** Main area (charts, tables, tabs). */
  main: ReactNode;
  /** Right rail (AI persona panel). Omit when collapsed. */
  rightRail?: ReactNode;
  /** Width of leftRail in px. Defaults to 200. */
  leftRailWidth?: number;
  /** Width of rightRail in px. Defaults to 380. */
  rightRailWidth?: number;
  /** Height of topbar in px. Defaults to 52. */
  topbarHeight?: number;
}

/**
 * Three-pane workspace layout used by:
 *   • Workspace Strategy Design / Preview / Deep
 *   • Screener (chart-first)
 *   • Symbol Detail
 *
 * Slot-based — caller supplies whatever goes in each pane.
 */
export function WorkspaceShell({
  topbar,
  leftRail,
  main,
  rightRail,
  leftRailWidth = 200,
  rightRailWidth = 380,
  topbarHeight = 52,
}: Props) {
  return (
    <div className="flex flex-col h-full w-full bg-surface-primary">
      {/* Topbar — only rendered when the caller supplies one. */}
      {topbar != null && (
        <div
          className="flex-shrink-0 bg-surface-secondary border-b border-border-subtle"
          style={{ height: topbarHeight }}
        >
          {topbar}
        </div>
      )}
      {/* Body: left rail + main + right rail */}
      <div className="flex flex-1 overflow-hidden">
        {leftRail && (
          <aside
            className="flex-shrink-0 border-r border-border-subtle bg-surface-secondary overflow-hidden"
            style={{ width: leftRailWidth }}
          >
            {leftRail}
          </aside>
        )}
        <main className="flex-1 min-w-0 overflow-auto">{main}</main>
        {rightRail && (
          <aside
            className="flex-shrink-0 border-l border-border-subtle bg-surface-secondary overflow-hidden"
            style={{ width: rightRailWidth }}
          >
            {rightRail}
          </aside>
        )}
      </div>
    </div>
  );
}
