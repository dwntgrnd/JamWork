import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X, Plus, ExternalLink, Link as LinkIcon } from 'lucide-react';
import { TaskLink } from '@/types';

const getDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
};

interface TaskLinksSectionProps {
  links: TaskLink[];
  showAddLink: boolean;
  onShowAddLinkChange: (show: boolean) => void;
  newLinkUrl: string;
  onNewLinkUrlChange: (v: string) => void;
  newLinkTitle: string;
  onNewLinkTitleChange: (v: string) => void;
  linkError: string;
  onAdd: () => void;
  onCancelAdd: () => void;
  onDelete: (linkId: string) => void;
}

/** Related links list with an add form (task drawer, edit mode). */
export function TaskLinksSection({
  links,
  showAddLink,
  onShowAddLinkChange,
  newLinkUrl,
  onNewLinkUrlChange,
  newLinkTitle,
  onNewLinkTitleChange,
  linkError,
  onAdd,
  onCancelAdd,
  onDelete,
}: TaskLinksSectionProps) {
  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Links</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => onShowAddLinkChange(!showAddLink)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>

      {/* Add link form */}
      {showAddLink && (
        <div className="space-y-2 p-3 border rounded-md bg-muted/30">
          <Input
            placeholder="https://example.com"
            value={newLinkUrl}
            onChange={(e) => onNewLinkUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onAdd();
              }
            }}
            className="h-8 text-sm"
          />
          <Input
            placeholder="Link title (optional)"
            value={newLinkTitle}
            onChange={(e) => onNewLinkTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onAdd();
              }
            }}
            className="h-8 text-sm"
          />
          {linkError && <p className="text-xs text-destructive">{linkError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancelAdd}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={onAdd}>
              Add Link
            </Button>
          </div>
        </div>
      )}

      {/* Link rows */}
      {links.length > 0 && (
        <div className="space-y-1">
          {links.map((link) => (
            <div
              key={link.id}
              className="flex items-center gap-2 group py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline truncate flex-1"
                title={link.url}
              >
                {link.title || getDomain(link.url)}
              </a>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={() => onDelete(link.id)}
              >
                <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state when no links and form not showing */}
      {links.length === 0 && !showAddLink && (
        <div
          className="flex items-center gap-2 border-b border-dashed border-field-border pb-1 cursor-pointer"
          onClick={() => onShowAddLinkChange(true)}
        >
          <LinkIcon className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
          <span className="text-sm text-muted-foreground">Add a link...</span>
        </div>
      )}
    </div>
  );
}
