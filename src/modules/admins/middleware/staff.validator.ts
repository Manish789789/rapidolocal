import { t } from "elysia";

export const createStaffValidator = t.Object({
    fullName: t.String({  error: 'Full name is required' }),
    phone: t.String({  error: 'Phone is required' }),
    role: t.String({  error: 'Role is required' }),
    email: t.String({
        format: 'email',
        error: 'Invalid email',
    }),
    address: t.Object({         // State object
        country: t.String({ error: 'Country is required' }),    // State value (string)
      }),
    password: t.String({
        minLength: 8, // Password must be at least 8 characters
        maxLength: 20, // Optional: Max length of 20 characters
        pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$',
        error: 'Invalid password'
    }),
})