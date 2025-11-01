import type { Context } from 'elysia';

export const logger = (ctx: Context) => {
    console.log(ctx.request.method, ctx.request.url, ctx.set.status, new Date(performance.timeOrigin).toISOString())
};