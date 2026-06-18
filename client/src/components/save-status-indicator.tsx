
import { Loader2, Check } from 'lucide-react';

interface SaveStatusIndicatorProps {
  status: 'idle' | 'saving' | 'saved' | 'error';
  /** Friendly name of the field being saved, e.g. "Status" — names the feedback. */
  label?: string | null;
}

export function SaveStatusIndicator({ status, label }: SaveStatusIndicatorProps) {
  // Quiet progress pip only — failures are surfaced by the drawer's alert banner.
  if (status !== 'saving' && status !== 'saved') {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 transition-opacity duration-200" role="status" aria-live="polite">
      {status === 'saving' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {label ? `Saving ${label.toLowerCase()}…` : 'Saving…'}
          </span>
        </>
      )}

      {status === 'saved' && (
        <>
          <Check className="h-3.5 w-3.5 text-success" />
          <span className="text-xs text-success">{label ? `${label} saved` : 'Saved'}</span>
        </>
      )}
    </div>
  );
}
