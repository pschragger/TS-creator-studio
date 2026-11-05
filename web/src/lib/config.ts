// Base URL of Nakama's HTTP API. Same-origin by default: Vite proxies it in dev and nginx in production.
export const NAKAMA_URL = (import.meta.env.VITE_NAKAMA_URL as string | undefined) ?? '/nakama'

// Public Nakama client key (not a secret). Only MUGI's server-only http_key must never be shipped.
export const NAKAMA_SERVER_KEY =
  (import.meta.env.VITE_NAKAMA_SERVER_KEY as string | undefined) ?? 'defaultkey'

// Members of this Nakama group are treated as employees (admin + artist). Assigned in the Nakama console.
export const EMPLOYEE_GROUP =
  (import.meta.env.VITE_EMPLOYEE_GROUP as string | undefined) ?? 'mugi_managers'
