import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { UserSummary } from '@/types';

export const USERS_KEY = ['users'] as const;

/** The org's user list, used to populate assignee pickers and filters. */
export function useUsers() {
  return useQuery({
    queryKey: USERS_KEY,
    queryFn: () => apiGet<{ users: UserSummary[] }>('/auth/users').then((d) => d.users),
  });
}
