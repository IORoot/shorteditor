import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  onReload?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('The app crashed while rendering', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-24 flex max-w-lg flex-col gap-3 rounded-[20px] bg-surface p-8 shadow-[0_6px_28px_#0000001a]">
        <h1 className="text-h2 font-bold">Something went wrong</h1>
        <p className="text-small text-text-2">The page hit an unexpected error. If you just updated the app, restart the backend and reload.</p>
        <p className="break-words rounded-xl bg-bad-soft px-4 py-3 font-mono text-caption text-bad">{this.state.error.message}</p>
        <button
          type="button"
          className="btn btn-primary btn-sm self-start rounded-full"
          onClick={() => (this.props.onReload ?? (() => window.location.reload()))()}
        >
          Reload
        </button>
      </div>
    );
  }
}
