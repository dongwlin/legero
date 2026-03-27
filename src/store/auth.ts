import { create } from 'zustand'
import type {
  AuthUserDTO,
  WorkspaceDTO,
  WorkspaceRole,
} from '@/services/apiTypes'

export type AuthSessionStatus = 'loading' | 'authenticated' | 'anonymous'
export type WorkspaceAccessStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'no_access'
  | 'error'

export type AuthUser = AuthUserDTO

export type ActiveWorkspace = WorkspaceDTO & {
  role: WorkspaceRole
}

type AuthenticatedContext = {
  user: AuthUser
  workspace: WorkspaceDTO
  permissions: string[]
  serverTime: string
}

interface AuthState {
  status: AuthSessionStatus
  user: AuthUser | null
  permissions: string[]
  serverTime: string | null
  workspaceStatus: WorkspaceAccessStatus
  activeWorkspace: ActiveWorkspace | null
  errorMessage: string | null
  setAuthenticatedContext: (input: AuthenticatedContext) => void
  setAnonymous: () => void
  setWorkspaceLoading: () => void
  setNoWorkspaceAccess: (message?: string | null) => void
  setWorkspaceError: (message: string) => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'loading',
  user: null,
  permissions: [],
  serverTime: null,
  workspaceStatus: 'idle',
  activeWorkspace: null,
  errorMessage: null,
  setAuthenticatedContext: ({ user, workspace, permissions, serverTime }) =>
    set({
      status: 'authenticated',
      user,
      permissions,
      serverTime,
      workspaceStatus: 'ready',
      activeWorkspace: {
        id: workspace.id,
        name: workspace.name,
        role: user.role,
      },
      errorMessage: null,
    }),
  setAnonymous: () =>
    set({
      status: 'anonymous',
      user: null,
      permissions: [],
      serverTime: null,
      workspaceStatus: 'idle',
      activeWorkspace: null,
      errorMessage: null,
    }),
  setWorkspaceLoading: () =>
    set((state) => ({
      status: state.user ? 'authenticated' : state.status,
      workspaceStatus: 'loading',
      activeWorkspace: null,
      errorMessage: null,
    })),
  setNoWorkspaceAccess: (message = null) =>
    set((state) => ({
      status: state.user ? 'authenticated' : state.status,
      permissions: [],
      serverTime: null,
      workspaceStatus: 'no_access',
      activeWorkspace: null,
      errorMessage: message,
    })),
  setWorkspaceError: (message) =>
    set((state) => ({
      status: state.user ? 'authenticated' : state.status,
      permissions: [],
      serverTime: null,
      workspaceStatus: 'error',
      activeWorkspace: null,
      errorMessage: message,
    })),
}))
