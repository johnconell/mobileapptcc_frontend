import { z } from 'zod';

export const proctorLoginSchema = z.object({
  username: z.string().trim().min(3, 'Enter your username'),
  password: z.string().min(4, 'Enter your password'),
});

export type ProctorLoginValues = z.infer<typeof proctorLoginSchema>;
