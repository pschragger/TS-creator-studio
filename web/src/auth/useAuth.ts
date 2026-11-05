import { createContext, useContext } from 'react'
import type { Profile } from '../lib/nakama'

export interface RegisterInput {
  email: string
  password: string
  username: string
  displayName: string
}

export interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn'
  profile: Profile | null
  login: (email: string, password: string) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
