import { t } from "elysia";

export const placesValidator = t.Object({
    latitude: t.Number(t.String({
        minLength: 1,
        error: 'Invalid latitude'
    })),
    longitude: t.Number(t.String({
        minLength: 1,
        error: 'Invalid longitude'
    })),
})

export const validateLatLong = async ({ body }: any) => {
    if (!body?.latitude || !body.longitude || body.latitude === 0 || body.longitude === 0) {
        throw new Error('Invalid latitude or longitude');
    }
}