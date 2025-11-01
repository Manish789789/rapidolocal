import { t } from "elysia";

export const fcmValidator = t.Object({
    fcmToken: t.String({ minLength: 6, error: 'Invalid fcmToken' })
})

export const userProfileUpdateValidator = t.Object({
    fullName: t.Optional(t.String({
        minLength: 2,
        error: 'Invalid full name'
    })),
    email: t.Optional(t.String({
        format: 'email',
        error: 'Invalid email'
    })),
    phone: t.Optional(t.String({
        error: 'Invalid phone'
    })),
    otp: t.Optional(t.String({
        minLength: 6,
        maxLength: 6,
        error: 'Invalid OTP'
    })),
    countryName: t.Optional(t.String({
        maxLength: 20,
        error: 'Invalid country name'
    })),
    countryCode: t.Optional(t.String({
        maxLength: 20,
        error: 'Invalid country code'
    })),
})