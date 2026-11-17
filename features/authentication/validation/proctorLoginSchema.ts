import { z } from 'zod';

export const proctorLoginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Enter your username')
    .max(64, 'Username must be 64 characters or fewer')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Use letters, numbers, dots, underscores, or hyphens'),
  password: z.string().min(4, 'Enter your password'),
});

export type ProctorLoginValues = z.infer<typeof proctorLoginSchema>;
