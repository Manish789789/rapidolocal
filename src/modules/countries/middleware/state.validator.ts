import { t } from "elysia";

export const stateSearchValidator = t.Object({
    country: t.Optional(t.String({ minLength: 2, error: 'Invalid country' })),
    search: t.Optional(t.String({ minLength: 1, error: 'Invalid search' }))
})
 