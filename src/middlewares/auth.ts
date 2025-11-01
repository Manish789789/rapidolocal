import type { Context } from 'elysia';

export const auth = (context: Context) => {
    const token = context.request.headers.get('Authorization');
    if (token !== 'valid-token') {
        return new Response('Unauthorized', { status: 401 });
    }
};
