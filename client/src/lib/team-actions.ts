import { User } from '@/types';

/** Management actions that can appear on a Team-tab row. */
export type RowAction = 'edit' | 'reset' | 'delete' | 'promote' | 'demote' | 'transfer';

/**
 * Which actions the current user may take on a given row, mirroring the
 * backend permission matrix (CC31a). The backend enforces these rules; this
 * only governs what the UI renders so users don't see actions they can't take.
 */
export function visibleActions(current: User | null, row: User): RowAction[] {
  if (!current || row.id === current.id) return [];

  if (current.role === 'owner') {
    if (row.role === 'member') return ['edit', 'reset', 'delete', 'promote'];
    if (row.role === 'admin') return ['edit', 'reset', 'delete', 'demote', 'transfer'];
    return [];
  }

  if (current.role === 'admin' && row.role === 'member') {
    return ['edit', 'reset', 'delete'];
  }

  return [];
}
