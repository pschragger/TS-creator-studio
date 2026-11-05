import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

export const registerSchema = z
  .object({
    email: z.string().trim().email('Enter a valid email address.'),
    username: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_.-]{3,32}$/, '3-32 characters: letters, numbers, dot, dash, underscore.'),
    displayName: z.string().trim().min(2, 'At least 2 characters.').max(40, 'At most 40 characters.'),
    password: z.string().min(8, 'At least 8 characters.').max(128, 'At most 128 characters.'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  })

export type LoginValues = z.infer<typeof loginSchema>
export type RegisterValues = z.infer<typeof registerSchema>
