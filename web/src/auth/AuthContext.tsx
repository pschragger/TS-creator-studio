import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AuthContext } from './useAuth'
import type { AuthState } from './useAuth'
import type { ReactNode } from 'react'
import {
  loadProfile,
  login as apiLogin,
  refreshSession,
  register as apiRegister,
  tokenExpiresInMs,
  updateDisplayName,
} from '../lib/nakama'
import type { Profile, Session } from '../lib/nakama'

const STORAGE_KEY = 'ts-studio.session'

type RegisterInput = Parameters<AuthState['register']>[0]

// sessionStorage is tab-scoped; this is a Phase 1 default and the token-storage decision is still open.
function readStored(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function store(session: Session | null) {
  if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  else sessionStorage.removeItem(STORAGE_KEY)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading')
  const [profile, setProfile] = useState<Profile | null>(null)
  const sessionRef = useRef<Session | null>(null)

  const clear = useCallback(() => {
    sessionRef.current = null
    store(null)
    setProfile(null)
    setStatus('signedOut')
  }, [])

  const establish = useCallback(async (session: Session) => {
    const p = await loadProfile(session)
    sessionRef.current = session
    store(session)
    setProfile(p)
    setStatus('signedIn')
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      let session = readStored()
      if (!session) return setStatus('signedOut')
      try {
        if (tokenExpiresInMs(session.token) < 60_000) session = await refreshSession(session.refreshToken)
        if (!cancelled) await establish(session)
      } catch {
        if (!cancelled) clear()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [establish, clear])

  useEffect(() => {
    if (status !== 'signedIn') return
    const id = window.setInterval(() => {
      const current = sessionRef.current
      if (!current || tokenExpiresInMs(current.token) > 120_000) return
      refreshSession(current.refreshToken).then(
        (next) => {
          sessionRef.current = next
          store(next)
        },
        () => clear(),
      )
    }, 30_000)
    return () => window.clearInterval(id)
  }, [status, clear])

  const login = useCallback(
    async (email: string, password: string) => establish(await apiLogin(email, password)),
    [establish],
  )

  const register = useCallback(
    async ({ email, password, username, displayName }: RegisterInput) => {
      const session = await apiRegister(email, password, username)
      await updateDisplayName(session, displayName)
      await establish(session)
    },
    [establish],
  )

  const value = useMemo<AuthState>(
    () => ({ status, profile, login, register, logout: clear }),
    [status, profile, login, register, clear],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
