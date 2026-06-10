import { describe, it, expect } from 'vitest';
import { visibleActions } from './team-actions';
import type { User, UserRole } from '@/types';

const mk = (id: string, role: UserRole): User => ({
  id,
  email: `${id}@example.com`,
  displayName: id,
  role,
});

const owner = mk('owner', 'owner');
const admin = mk('admin', 'admin');
const member = mk('member', 'member');

describe('visibleActions', () => {
  // Owner viewing others
  it('owner sees full management + promote on a member', () => {
    expect(visibleActions(owner, member)).toEqual(['edit', 'reset', 'delete', 'promote']);
  });

  it('owner sees full management + demote + transfer on an admin', () => {
    expect(visibleActions(owner, admin)).toEqual(['edit', 'reset', 'delete', 'demote', 'transfer']);
  });

  it('owner sees no actions on themselves', () => {
    expect(visibleActions(owner, owner)).toEqual([]);
  });

  // Admin viewing others
  it('admin sees member management only', () => {
    expect(visibleActions(admin, member)).toEqual(['edit', 'reset', 'delete']);
  });

  it('admin sees no actions on another admin', () => {
    const otherAdmin = mk('admin2', 'admin');
    expect(visibleActions(admin, otherAdmin)).toEqual([]);
  });

  it('admin sees no actions on themselves', () => {
    expect(visibleActions(admin, admin)).toEqual([]);
  });

  it('admin sees no actions on the owner', () => {
    expect(visibleActions(admin, owner)).toEqual([]);
  });

  // Defensive: members and absent users never get actions
  it('member sees no actions on anyone', () => {
    expect(visibleActions(member, member)).toEqual([]);
    expect(visibleActions(member, admin)).toEqual([]);
  });

  it('returns no actions when there is no current user', () => {
    expect(visibleActions(null, member)).toEqual([]);
  });
});
