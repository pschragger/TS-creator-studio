import { describe, expect, it } from 'vitest'
import { capabilitiesFor, decodeToken, tokenExpiresInMs } from './nakama'
import { registerSchema } from './schemas'

function jwt(payload: object): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
}

describe('token helpers', () => {
  it('decodes claims', () => {
    expect(decodeToken(jwt({ uid: 'u1', exp: 100 })).uid).toBe('u1')
  })
  it('computes time to expiry', () => {
    expect(tokenExpiresInMs(jwt({ exp: 100 }), 40_000)).toBe(60_000)
  })
})

describe('capabilities', () => {
  it('artists can only submit', () => {
    expect(capabilitiesFor('artist')).toEqual(['submit'])
  })
  it('employees get artist and admin features', () => {
    const caps = capabilitiesFor('employee')
    expect(caps).toEqual(expect.arrayContaining(['submit', 'review', 'manage_reviewers', 'admin']))
  })
})

describe('registerSchema', () => {
  const ok = {
    email: 'a@b.co',
    username: 'artist_1',
    displayName: 'Artist One',
    password: 'longenough1',
    confirmPassword: 'longenough1',
  }
  it('accepts valid input', () => {
    expect(registerSchema.safeParse(ok).success).toBe(true)
  })
  it('rejects mismatched passwords, bad usernames and short passwords', () => {
    expect(registerSchema.safeParse({ ...ok, confirmPassword: 'x' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...ok, username: 'a b' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...ok, password: 'short', confirmPassword: 'short' }).success).toBe(false)
  })
})
