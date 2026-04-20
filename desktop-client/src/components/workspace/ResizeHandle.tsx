import { useEffect, useRef } from 'react';

interface Props {
  /** Invoked with the vertical pixel delta since the last mousemove. */
  onResize: (deltaY: number) => void;
  /** Optional callback fired when the drag ends (mouseup / cancel).
   *  Useful for screens that want to persist the final size to a
   *  store after the user finishes dragging rather than on every tick. */
  onResizeEnd?: () => void;
  /** Visible slot label for screen readers. */
  ariaLabel?: string;
}

/**
 * Horizontal drag bar that lets the user resize the element above it.
 * Sits between two stacked panes (main chart ↔ indicator pane, or
 * pane ↔ pane) and emits pixel deltas — the parent owns the pane
 * heights and clamps them.
 *
 * The handle itself is a thin strip that becomes more visible on hover
 * / during drag so it doesn't distract from the chart, but is easy to
 * grab (6px hit-box, 1px visible line).
 */
export function ResizeHandle({ onResize, onResizeEnd, ariaLabel }: Props) {
  const draggingRef = useRef(false);
  const lastYRef = useRef<number | null>(null);
  // Hold the latest callbacks in refs so the global listeners we attach
  // on pointerdown don't go stale between renders (otherwise a drag
  // started before a parent re-render would keep calling the old
  // `onResize` closure).
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const onEndRef = useRef(onResizeEnd);
  onEndRef.current = onResizeEnd;

  // Clean up document-level listeners if the handle unmounts mid-drag
  // (e.g. the pane it's attached to gets hidden while the user drags).
  useEffect(() => {
    return () => {
      draggingRef.current = false;
      lastYRef.current = null;
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    lastYRef.current = e.clientY;
    // Suppress text selection while the user drags. `user-select: none`
    // on the body is the cleanest cross-browser way.
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';

    const onMove = (ev: PointerEvent) => {
      if (!draggingRef.current || lastYRef.current == null) return;
      const dy = ev.clientY - lastYRef.current;
      lastYRef.current = ev.clientY;
      if (dy !== 0) onResizeRef.current(dy);
    };
    const onUp = () => {
      draggingRef.current = false;
      lastYRef.current = null;
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      onEndRef.current?.();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      className="group relative h-1.5 cursor-row-resize select-none"
    >
      {/* Visible line — faint by default, picks up the accent colour
          on hover / during drag so the user sees where to grab. */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border-subtle group-hover:h-0.5 group-hover:bg-accent-primary transition-all" />
    </div>
  );
}
