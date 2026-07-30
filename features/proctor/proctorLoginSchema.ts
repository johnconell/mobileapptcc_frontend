import { z } from 'zod';

export const proctorLoginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Enter your email')
    .email('Enter a valid email address'),
  password: z.string().min(4, 'Enter your password'),
});

export type ProctorLoginValues = z.infer<typeof proctorLoginSchema>;
