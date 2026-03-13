
import { useEffect } from 'react';

export interface KeyboardShortcut {
  key: string;
  handler: () => void;
  description: string;
  scope?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input field
      const target = e.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      // Allow Escape to work even in input fields
      if (isInputField && e.key !== 'Escape') {
        return;
      }

      // Find matching shortcut
      for (const shortcut of shortcuts) {
        const keyMatches = e.key.toLowerCase() === shortcut.key.toLowerCase();
        const metaMatches = shortcut.metaKey ? e.metaKey : !e.metaKey;
        const ctrlMatches = shortcut.ctrlKey ? e.ctrlKey : !e.ctrlKey;
        const shiftMatches = shortcut.shiftKey ? e.shiftKey : !e.shiftKey;

        if (keyMatches && metaMatches && ctrlMatches && shiftMatches) {
          e.preventDefault();

          // Dispatch custom event for visual feedback
          const event = new CustomEvent('shortcut-triggered', {
            detail: { key: shortcut.key, description: shortcut.description },
          });
          window.dispatchEvent(event);

          // Execute handler
          shortcut.handler();
          break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts]);
}
