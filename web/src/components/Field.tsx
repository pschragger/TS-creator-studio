import type { InputHTMLAttributes } from 'react'
import type { FieldError } from 'react-hook-form'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: FieldError
}

export function Field({ label, error, id, ...input }: Props) {
  const fieldId = id ?? input.name
  return (
    <div className="space-y-1">
      <label htmlFor={fieldId} className="block text-sm font-medium text-slate-200">
        {label}
      </label>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        {...input}
      />
      {error && (
        <p id={`${fieldId}-error`} className="text-sm text-red-400">
          {error.message}
        </p>
      )}
    </div>
  )
}
