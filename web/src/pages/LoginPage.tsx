import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { AuthCard, FormError, SubmitButton } from '../components/AuthCard'
import { Field } from '../components/Field'
import { loginSchema } from '../lib/schemas'
import type { LoginValues } from '../lib/schemas'

export function LoginPage() {
  const { status, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  if (status === 'signedIn') return <Navigate to="/" replace />

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      await login(values.email, values.password)
      void navigate(from, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed.')
    }
  })

  return (
    <AuthCard title="Sign in to Creator Studio">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email" type="email" autoComplete="email" error={errors.email} {...register('email')} />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password}
          {...register('password')}
        />
        <FormError message={error} />
        <SubmitButton busy={isSubmitting}>Sign in</SubmitButton>
      </form>
      <p className="text-sm text-slate-400">
        New creator?{' '}
        <Link to="/register" className="text-indigo-300 hover:underline">
          Create an account
        </Link>
      </p>
    </AuthCard>
  )
}
