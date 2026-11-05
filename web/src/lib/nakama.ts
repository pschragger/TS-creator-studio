import { EMPLOYEE_GROUP, NAKAMA_SERVER_KEY, NAKAMA_URL } from './config'

export type Role = 'artist' | 'employee'

export interface Session {
  token: string
  refreshToken: string
  userId: string
}

export type Capability = 'submit' | 'review' | 'manage_reviewers' | 'admin'

export interface Profile {
  userId: string
  username: string
  displayName: string
  email: string
  role: Role
  capabilities: Capability[]
}

export class NakamaError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Employees get every admin and artist capability; artists can only submit.
export function capabilitiesFor(role: Role): Capability[] {
  return role === 'employee' ? ['submit', 'review', 'manage_reviewers', 'admin'] : ['submit']
}

interface JwtClaims {
  exp?: number
  uid?: string
}

export function decodeToken(token: string): JwtClaims {
  const part = token.split('.')[1]
  if (!part) throw new Error('malformed token')
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))) as JwtClaims
}

export function tokenExpiresInMs(token: string, now = Date.now()): number {
  const { exp } = decodeToken(token)
  return exp ? exp * 1000 - now : 0
}

async function call<T>(path: string, init: RequestInit & { auth: 'server' | string }): Promise<T> {
  const { auth, ...rest } = init
  const authHeader = auth === 'server' ? `Basic ${btoa(`${NAKAMA_SERVER_KEY}:`)}` : `Bearer ${auth}`
  let res: Response
  try {
    res = await fetch(`${NAKAMA_URL}${path}`, {
      ...rest,
      headers: { 'Content-Type': 'application/json', Authorization: authHeader, ...rest.headers },
    })
  } catch {
    throw new NakamaError(0, 'Cannot reach the game server. Try again shortly.')
  }
  const text = await res.text()
  let body: Record<string, unknown> = {}
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    if (res.ok) throw new NakamaError(res.status, 'Unexpected response from the game server.')
  }
  if (!res.ok) {
    throw new NakamaError(res.status, typeof body.message === 'string' ? body.message : res.statusText)
  }
  return body as T
}

interface AuthResponse {
  token: string
  refresh_token: string
  created?: boolean
}

function toSession(r: AuthResponse): Session {
  const claims = decodeToken(r.token)
  if (!claims.uid) throw new Error('token is missing the user id')
  return { token: r.token, refreshToken: r.refresh_token, userId: claims.uid }
}

export async function login(email: string, password: string): Promise<Session> {
  try {
    const r = await call<AuthResponse>('/v2/account/authenticate/email?create=false', {
      method: 'POST',
      auth: 'server',
      body: JSON.stringify({ email, password }),
    })
    return toSession(r)
  } catch (e) {
    if (e instanceof NakamaError && (e.status === 401 || e.status === 404)) {
      throw new NakamaError(e.status, 'Invalid email or password.')
    }
    throw e
  }
}

export async function register(email: string, password: string, username: string): Promise<Session> {
  let r: AuthResponse
  try {
    r = await call<AuthResponse>(
      `/v2/account/authenticate/email?create=true&username=${encodeURIComponent(username)}`,
      { method: 'POST', auth: 'server', body: JSON.stringify({ email, password }) },
    )
  } catch (e) {
    if (e instanceof NakamaError && (e.status === 401 || e.status === 409)) {
      throw new NakamaError(409, 'That email or username is already in use.')
    }
    throw e
  }
  // create=true silently signs in an existing account that has the same password.
  if (r.created === false) {
    throw new NakamaError(409, 'An account with this email already exists. Sign in instead.')
  }
  return toSession(r)
}

export async function refreshSession(refreshToken: string): Promise<Session> {
  const r = await call<AuthResponse>('/v2/account/session/refresh', {
    method: 'POST',
    auth: 'server',
    body: JSON.stringify({ token: refreshToken }),
  })
  return toSession(r)
}

interface AccountResponse {
  user: { id: string; username: string; display_name?: string }
  email?: string
}

interface UserGroupsResponse {
  user_groups?: { group: { name: string }; state?: number }[]
}

export async function updateDisplayName(session: Session, displayName: string): Promise<void> {
  await call('/v2/account', {
    method: 'PUT',
    auth: session.token,
    body: JSON.stringify({ display_name: displayName }),
  })
}

export async function loadProfile(session: Session): Promise<Profile> {
  const [account, groups] = await Promise.all([
    call<AccountResponse>('/v2/account', { method: 'GET', auth: session.token }),
    call<UserGroupsResponse>(`/v2/user/${session.userId}/group?limit=100`, {
      method: 'GET',
      auth: session.token,
    }),
  ])
  // State 3 is a pending join request, which must not grant the role.
  const isEmployee = (groups.user_groups ?? []).some(
    (g) => g.group.name === EMPLOYEE_GROUP && (g.state ?? 2) < 3,
  )
  const role: Role = isEmployee ? 'employee' : 'artist'
  return {
    userId: account.user.id,
    username: account.user.username,
    displayName: account.user.display_name || account.user.username,
    email: account.email ?? '',
    role,
    capabilities: capabilitiesFor(role),
  }
}
