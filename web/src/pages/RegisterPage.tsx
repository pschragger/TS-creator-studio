import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { AuthCard, FormError, SubmitButton } from '../components/AuthCard'
import { Field } from '../components/Field'
import { registerSchema } from '../lib/schemas'
import type { RegisterValues } from '../lib/schemas'

export function RegisterPage() {
  const { status, register: registerUser } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) })

  if (status === 'signedIn') return <Navigate to="/" replace />

  const onSubmit = handleSubmit(async ({ email, password, username, displayName }) => {
    setError(null)
    try {
      await registerUser({ email, password, username, displayName })
      void navigate('/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed.')
    }
  })

  return (
    <AuthCard title="Create your creator account">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email" type="email" autoComplete="email" error={errors.email} {...register('email')} />
        <Field
          label="Username (used to sign in and cannot be changed)"
          autoComplete="username"
          error={errors.username}
          {...register('username')}
        />
        <Field label="Display name" autoComplete="nickname" error={errors.displayName} {...register('displayName')} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password}
          {...register('password')}
        />
        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword}
          {...register('confirmPassword')}
        />
        <FormError message={error} />
        <SubmitButton busy={isSubmitting}>Create account</SubmitButton>
      </form>
      <p className="text-sm text-slate-400">
        Already registered?{' '}
        <Link to="/login" className="text-indigo-300 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  )
}
