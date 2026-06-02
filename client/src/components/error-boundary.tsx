import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render-time exceptions in the routed app and shows a recoverable
 * fallback instead of white-screening the whole SPA. Wraps the protected layout
 * (see router.tsx) so a crash in any page leaves the user a way back.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="w-full max-w-md rounded-lg border bg-surface-overlay p-6 text-center shadow-sm">
            <h1 className="mb-2 text-xl font-semibold text-foreground">Something went wrong</h1>
            <p className="mb-6 text-sm text-muted-foreground">
              An unexpected error occurred. Reloading the page usually fixes it.
            </p>
            <Button onClick={this.handleReload}>Reload page</Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
