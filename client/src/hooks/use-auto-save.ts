import { useState, useRef, useCallback, useEffect } from "react";
import { apiPut, getErrorMessage } from "@/lib/api";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface UseAutoSaveOptions {
  taskId: string;
  enabled?: boolean; // false for create mode, true for edit mode
}

interface UseAutoSaveReturn {
  saveField: (fieldName: string, value: unknown) => Promise<void>;
  status: SaveStatus;
  error: string | null;
  clearError: () => void;
}

export function useAutoSave(options: UseAutoSaveOptions): UseAutoSaveReturn {
  const { taskId, enabled = true } = options;

  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  const clearError = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  const saveField = useCallback(
    async (fieldName: string, value: unknown) => {
      // No-op if not enabled (create mode)
      if (!enabled) {
        return;
      }

      // Clear any existing saved-to-idle timer
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
        savedTimerRef.current = null;
      }

      // Set status to saving
      setStatus("saving");
      setError(null);

      try {
        // Call API with single field payload
        await apiPut(`/tasks/${taskId}`, { [fieldName]: value });

        // Success: set to saved, then auto-reset to idle after 2 seconds
        setStatus("saved");
        savedTimerRef.current = setTimeout(() => {
          setStatus("idle");
          savedTimerRef.current = null;
        }, 2000);
      } catch (err: unknown) {
        // Error: set error status and store message
        const errorMessage = getErrorMessage(err, "Failed to save");
        setStatus("error");
        setError(errorMessage);

        // Re-throw so caller can handle revert
        throw err;
      }
    },
    [taskId, enabled],
  );

  return {
    saveField,
    status,
    error,
    clearError,
  };
}
