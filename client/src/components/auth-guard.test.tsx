import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { createElement } from 'react'
import { AuthGuard } from '@/components/auth-guard'
import { useAuth } from '@/hooks/use-auth'

const navigateMock = vi.fn()
vi.mock('react-router', () => ({ useNavigate: () => navigateMock }))
vi.mock('@/hooks/use-auth', () => ({ useAuth: vi.fn() }))

const mockedUseAuth = useAuth as ReturnType<typeof vi.fn>

type AuthState = ReturnType<typeof useAuth>
function authState(over: Partial<AuthState>): AuthState {
  return { user: null, loading: false, serverError: false, ...over } as AuthState
}

const child = () => createElement('div', null, 'protected-content')

describe('AuthGuard', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    mockedUseAuth.mockReset()
  })
  afterEach(cleanup)

  it('shows a server-unavailable state on serverError and does NOT redirect to login', () => {
    mockedUseAuth.mockReturnValue(authState({ serverError: true }))
    render(createElement(AuthGuard, null, child()))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()
    expect(screen.queryByText('protected-content')).not.toBeInTheDocument()
  })

  it('redirects to login when unauthenticated (no server error)', () => {
    mockedUseAuth.mockReturnValue(authState({ user: null }))
    render(createElement(AuthGuard, null, child()))

    expect(navigateMock).toHaveBeenCalledWith('/login')
  })

  it('renders children when authenticated', () => {
    mockedUseAuth.mockReturnValue(authState({ user: { id: 'u1', mustResetPassword: false } as AuthState['user'] }))
    render(createElement(AuthGuard, null, child()))

    expect(screen.getByText('protected-content')).toBeInTheDocument()
  })
})
