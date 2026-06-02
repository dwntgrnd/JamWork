
import { Loader2, Check, AlertCircle } from 'lucide-react';

interface SaveStatusIndicatorProps {
  status: 'idle' | 'saving' | 'saved' | 'error';
  error?: string | null;
}

export function SaveStatusIndicator({ status, error }: SaveStatusIndicatorProps) {
  // Render nothing when idle
  if (status === 'idle') {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 transition-opacity duration-200" role="status" aria-live="polite">
      {status === 'saving' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Saving...</span>
        </>
      )}

      {status === 'saved' && (
        <>
          <Check className="h-3.5 w-3.5 text-success" />
          <span className="text-xs text-success">Saved</span>
        </>
      )}

      {status === 'error' && (
        <>
          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          <span
            className="text-xs text-destructive max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap"
            title={error || 'Error saving'}
          >
            {error || 'Error saving'}
          </span>
        </>
      )}
    </div>
  );
}
