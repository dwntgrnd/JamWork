
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  category: string;
  shortcuts: ShortcutItem[];
}

const shortcuts: ShortcutCategory[] = [
  {
    category: 'Navigation',
    shortcuts: [
      { keys: ['↑'], description: 'Move up in task list' },
      { keys: ['↓'], description: 'Move down in task list' },
      { keys: ['Esc'], description: 'Close modal or cancel action' },
    ],
  },
  {
    category: 'Actions',
    shortcuts: [
      { keys: ['N'], description: 'Create new task' },
      { keys: ['E'], description: 'Edit selected task' },
      { keys: ['Delete'], description: 'Delete selected task' },
      { keys: ['?'], description: 'Show keyboard shortcuts (this help)' },
    ],
  },
  {
    category: 'Views',
    shortcuts: [
      { keys: ['1'], description: 'Switch to List view' },
      { keys: ['2'], description: 'Switch to Board view' },
      { keys: ['3'], description: 'Switch to Timeline view' },
    ],
  },
];

function KeyboardKey({ keyName }: { keyName: string }) {
  return (
    <kbd className="px-2 py-1 text-xs font-semibold text-foreground bg-muted border border-border rounded shadow-sm">
      {keyName}
    </kbd>
  );
}

export function KeyboardShortcutsModal({ open, onOpenChange }: KeyboardShortcutsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Use these keyboard shortcuts to navigate faster
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {shortcuts.map((category) => (
            <div key={category.category}>
              <h3 className="text-sm font-semibold text-foreground mb-3">
                {category.category}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {category.shortcuts.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 rounded hover:bg-muted/50"
                  >
                    <span className="text-sm text-muted-foreground">
                      {shortcut.description}
                    </span>
                    <div className="flex gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <KeyboardKey key={keyIndex} keyName={key} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-3 bg-muted/50 rounded text-xs text-muted-foreground">
          Tip: Shortcuts are disabled when typing in input fields (except Escape).
        </div>
      </DialogContent>
    </Dialog>
  );
}
