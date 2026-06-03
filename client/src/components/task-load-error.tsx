import { AlertTriangle } from 'lucide-react';

/**
 * Error state for task views when the tasks request fails for a non-auth reason
 * (server/network). Distinct from the empty state so a server outage never reads
 * as "you have no tasks". 401s are handled globally (redirect to login).
 */
export function TaskLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 py-16 text-center"
    >
      <AlertTriangle className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground max-w-sm">
        We couldn’t load your tasks. The server may be temporarily unavailable.
      </p>
      <button
        onClick={onRetry}
        className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-interactive-foreground hover:opacity-90"
      >
        Retry
      </button>
    </div>
  );
}
