# TS Creator Studio (web)

Vite + React + TypeScript + Tailwind CSS v4. See `../document/` for the design.

## Run

```sh
cp .env.example .env     # set NAKAMA_PROXY_TARGET to the external Nakama/MUGI server
npm install
npm run dev              # http://localhost:5173
npm test
npm run build
```

The browser calls Nakama through the same-origin `/nakama` path. Vite proxies it in
development, and nginx will in production, so no CORS setup is needed.

## Accounts and roles

- **Register** creates a Nakama account (email, password, unique username) and sets the
  display name. Every new account is an **artist** and can submit.
- **Employee** accounts get all admin and artist features. An employee is a member of the
  Nakama group named by `VITE_EMPLOYEE_GROUP` (default `mugi_managers`). Create that group
  in the Nakama console and add the employee (state: member or higher). Pending join
  requests do not grant the role.
- The UI hides features by role, but the real checks must be enforced by MUGI/Nakama RPCs
  as they are added (see the Phase 0 contract).

## Notes

- The session is kept in `sessionStorage` (tab-scoped). The token-storage decision is open.
- Display-name uniqueness is not enforced yet; it arrives with the MUGI studio RPCs.
  Nakama usernames are already unique.
