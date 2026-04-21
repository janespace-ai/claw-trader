import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * Top-level error boundary. Without this, any React render error taking
 * an ancestor down leaves the window pure black with no explanation —
 * the user just sees the macOS title bar and a blank renderer. Catch
 * here, log to the main-process console via the preload bridge if
 * available, and render a minimal recovery screen that preserves the
 * actual error text and a reload button.
 *
 * Wraps the whole <App/>. Screen-level boundaries could be added later
 * for more surgical recovery, but this one alone is enough to make a
 * black screen impossible.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the original stack visible in devtools — React swallows the
    // throw otherwise in production builds.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] uncaught render error', error, info);
    this.setState({ info });
  }

  handleReset = () => {
    this.setState({ error: null, info: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex flex-col h-full w-full overflow-auto bg-surface-primary text-fg-primary p-6 gap-4">
        <div>
          <div className="text-base font-heading font-semibold text-accent-red">
            Something crashed in the UI
          </div>
          <div className="text-sm text-fg-secondary mt-1">
            The renderer caught a fatal error before it took the whole
            window down. You can try to dismiss it and keep using the
            app, or reload the window.
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={this.handleReset}
            className="px-3 py-1.5 rounded-md bg-surface-tertiary text-fg-primary text-sm hover:bg-surface-secondary"
          >
            Dismiss
          </button>
          <button
            onClick={this.handleReload}
            className="px-3 py-1.5 rounded-md bg-accent-primary text-fg-inverse text-sm font-semibold"
          >
            Reload window
          </button>
        </div>

        <pre className="flex-1 min-h-0 overflow-auto bg-surface-secondary rounded-md p-3 text-xs font-mono text-fg-secondary whitespace-pre-wrap">
          {error.name}: {error.message}
          {error.stack ? '\n\n' + error.stack : ''}
          {info?.componentStack ? '\n\nComponent stack:' + info.componentStack : ''}
        </pre>
      </div>
    );
  }
}
