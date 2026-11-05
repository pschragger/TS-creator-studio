import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadProfile, login, NakamaError, register } from './nakama'

function jwt(payload: object): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '')
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
}

const authBody = (created: boolean) => ({
  token: jwt({ uid: 'u1', exp: 9999999999 }),
  refresh_token: 'r',
  created,
})

function mockFetch(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  const fn = vi.fn((url: string, init: RequestInit) => {
    const { status = 200, body } = handler(url, init)
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('nakama client', () => {
  it('registers with create=true and the username', async () => {
    const fn = mockFetch(() => ({ body: authBody(true) }))
    const s = await register('a@b.co', 'password1', 'artist_1')
    expect(s.userId).toBe('u1')
    expect(fn.mock.calls[0][0]).toBe('/nakama/v2/account/authenticate/email?create=true&username=artist_1')
  })

  it('refuses to sign in an existing account during registration', async () => {
    mockFetch(() => ({ body: authBody(false) }))
    await expect(register('a@b.co', 'password1', 'artist_1')).rejects.toThrow(/already exists/)
  })

  it('maps a duplicate username to a conflict', async () => {
    mockFetch(() => ({ status: 409, body: { message: 'Username is already in use.' } }))
    await expect(register('a@b.co', 'password1', 'artist_1')).rejects.toBeInstanceOf(NakamaError)
  })

  it('hides whether the email exists on bad login', async () => {
    mockFetch(() => ({ status: 404, body: { message: 'Account not found.' } }))
    await expect(login('a@b.co', 'x')).rejects.toThrow('Invalid email or password.')
  })

  const account = { user: { id: 'u1', username: 'artist_1', display_name: '' }, email: 'a@b.co' }
  const profileFor = (groups: unknown) =>
    mockFetch((url) => ({ body: url.includes('/group') ? { user_groups: groups } : account }))

  it('defaults to artist', async () => {
    profileFor([])
    const p = await loadProfile({ token: 't', refreshToken: 'r', userId: 'u1' })
    expect(p.role).toBe('artist')
    expect(p.capabilities).toEqual(['submit'])
    expect(p.displayName).toBe('artist_1')
  })

  it('makes group members employees but not pending requests', async () => {
    profileFor([{ group: { name: 'mugi_managers' }, state: 2 }])
    expect((await loadProfile({ token: 't', refreshToken: 'r', userId: 'u1' })).role).toBe('employee')
    profileFor([{ group: { name: 'mugi_managers' }, state: 3 }])
    expect((await loadProfile({ token: 't', refreshToken: 'r', userId: 'u1' })).role).toBe('artist')
  })
})
