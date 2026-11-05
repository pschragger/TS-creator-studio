import type { ReactNode } from 'react'

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-slate-800 bg-slate-900/70 p-8 shadow-xl">
        <header>
          <p className="text-xs uppercase tracking-widest text-indigo-300">Twilight Sovereign</p>
          <h1 className="text-2xl font-semibold text-white">{title}</h1>
        </header>
        {children}
      </div>
    </main>
  )
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-md bg-indigo-500 px-4 py-2 font-medium text-white hover:bg-indigo-400 disabled:opacity-60"
    >
      {busy ? 'Please wait...' : children}
    </button>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-300">
      {message}
    </p>
  )
}
