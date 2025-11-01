
export const setHeaders = (ctx: any) => {
        // "performance",performance.now()
        ctx.set.headers['X-Powered-By'] = 'false';
        ctx.set.headers['X-Frame-Options'] = 'deny';
        // ctx.set.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'none'; style-src 'self';";
};