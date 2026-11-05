import { useAuth } from '../auth/useAuth'
import type { Capability } from '../lib/nakama'

const LABELS: Record<Capability, string> = {
  submit: 'Submit creations',
  review: 'Review submissions',
  manage_reviewers: 'Manage reviewers',
  admin: 'Administration',
}

export function ProfilePage() {
  const { profile, logout } = useAuth()
  if (!profile) return null

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <h1 className="text-lg font-semibold">TS Creator Studio</h1>
        <button onClick={logout} className="rounded-md border border-slate-600 px-3 py-1 text-sm hover:bg-slate-800">
          Sign out
        </button>
      </header>
      <main className="mx-auto max-w-2xl space-y-6 p-6">
        <section className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-xl font-semibold">{profile.displayName}</h2>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
            <dt className="text-slate-400">Username</dt>
            <dd>{profile.username}</dd>
            <dt className="text-slate-400">Email</dt>
            <dd>{profile.email}</dd>
            <dt className="text-slate-400">Role</dt>
            <dd className="capitalize">{profile.role}</dd>
          </dl>
        </section>
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="mb-2 font-semibold">What you can do</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
            {profile.capabilities.map((c) => (
              <li key={c}>{LABELS[c]}</li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
