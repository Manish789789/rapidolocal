import { t } from "elysia";

export const loginValidator = t.Object({
    email: t.String({
        format: 'email',
        error: 'Invalid email',
    }),
    password: t.String({
        minLength: 8, // Password must be at least 8 characters
        maxLength: 20, // Optional: Max length of 20 characters
        pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$',
        error: 'Invalid password'
    }),
})

export const forgotPasswordValidator = t.Object({
    email: t.String({
        format: 'email',
        error: 'Invalid email',
    })
})
export const updateForgotPasswordValidator = t.Object({
    email: t.String({
        format: 'email',
        error: 'Invalid email',
    }),
    password: t.String({
        minLength: 8, // Password must be at least 8 characters
        maxLength: 20, // Optional: Max length of 20 characters
        pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$',
        error: 'Invalid password'
    }),
    otp: t.String({
        minLength: 6, // Password must be at least 8 characters
        maxLength: 6,
        error: 'Invalid OTP'

    }),
})
