import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import {
  useSidebarPreferences,
  useUpdateSidebarPreferences,
  PREFERENCES_KEY,
} from '@/hooks/use-preferences';
import { apiGet, apiPut } from '@/lib/api';
import type { SidebarPreferences } from '@/types/preferences';

vi.mock('@/lib/api', () => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  // The shared query client's error policy references ApiError; keep the export
  // present so a rejected mutation doesn't trip "No ApiError export".
  ApiError: class ApiError extends Error {
    status = 0;
  },
}));

const mockedApiGet = apiGet as ReturnType<typeof vi.fn>;
const mockedApiPut = apiPut as ReturnType<typeof vi.fn>;

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children);

describe('use-preferences', () => {
  beforeEach(() => {
    queryClient.clear();
    mockedApiGet.mockReset();
    mockedApiPut.mockReset();
  });
  afterEach(cleanup);

  it('fetches GET /user/preferences and returns the sidebar namespace', async () => {
    mockedApiGet.mockResolvedValue({
      preferences: { sidebar: { view: 'mine', pinnedProjects: ['p1', 'p2'] } },
    });

    const { result } = renderHook(() => useSidebarPreferences(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockedApiGet).toHaveBeenCalledWith('/user/preferences');
    expect(result.current.data).toEqual({ view: 'mine', pinnedProjects: ['p1', 'p2'] });
  });

  it('defaults to All with an empty list when preferences are empty', async () => {
    mockedApiGet.mockResolvedValue({ preferences: {} });

    const { result } = renderHook(() => useSidebarPreferences(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({ view: 'all', pinnedProjects: [] });
  });

  it('optimistically updates the cache and PUTs the full sidebar object', async () => {
    const previous: SidebarPreferences = { view: 'all', pinnedProjects: [] };
    queryClient.setQueryData(PREFERENCES_KEY, previous);

    // Keep the PUT pending so we can observe the optimistic cache mid-flight.
    let resolvePut: (value: unknown) => void = () => {};
    mockedApiPut.mockReturnValue(new Promise((res) => { resolvePut = res; }));

    const { result } = renderHook(() => useUpdateSidebarPreferences(), { wrapper });

    const next: SidebarPreferences = { view: 'mine', pinnedProjects: ['p1'] };
    act(() => {
      result.current.mutate(next);
    });

    // Cache reflects the change while the PUT is still in flight (optimistic).
    await waitFor(() => expect(queryClient.getQueryData(PREFERENCES_KEY)).toEqual(next));
    expect(mockedApiPut).toHaveBeenCalledWith('/user/preferences', { sidebar: next });

    resolvePut({ preferences: { sidebar: next } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Successful save keeps the optimistic value (no rollback).
    expect(queryClient.getQueryData(PREFERENCES_KEY)).toEqual(next);
  });

  it('rolls back the cache when the PUT fails', async () => {
    const previous: SidebarPreferences = { view: 'mine', pinnedProjects: ['p1'] };
    queryClient.setQueryData(PREFERENCES_KEY, previous);
    mockedApiPut.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useUpdateSidebarPreferences(), { wrapper });

    act(() => {
      result.current.mutate({ view: 'all', pinnedProjects: [] });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(PREFERENCES_KEY)).toEqual(previous);
  });
});
