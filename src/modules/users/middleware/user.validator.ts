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
    theme: t.Optional(t.String({
        error: 'Invalid theme'
    })),
    avatar: t.Optional(t.String({
        error: 'Invalid avatar'
    })),
    gender: t.Optional(t.String({
        error: 'Invalid gender'
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
    favDrivers: t.Optional(t.Array(t.String())),
    blockDrivers: t.Optional(t.Array(t.String())),
    defaultOtpCode: t.Optional(t.String({
        error: 'Invalid Code'
    })),

    defaultOtpCodeValue: t.Optional(t.String({
        error: 'Invalid Value'
    })),
})