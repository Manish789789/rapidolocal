import { createClient } from 'redis';
import { Elysia } from 'elysia';
import { redisMigrateWithDb } from '@/utils/redisHelper';

let redisClient: ReturnType<typeof createClient> | null = null;
let isConnected = false;

// Initialize Redis connection
async function initRedis() {
    try {
        if (isConnected && redisClient) return redisClient;

        redisClient = createClient({
            username: process.env.REDIS_USERNAME,
            password: process.env.REDIS_PASSWORD,
            socket: {
                host: process.env.REDIS_SOCKET_HOST || "",
                port: Number(process.env.REDIS_SOCKET_PORT) || 16648
            }
        });

        redisClient.on('error', (err) => {
            console.log('Redis Client Error:', err)
        });
        redisClient.on('connect', () => {
            console.log('Redis connected successfully')
        });
        redisClient.on('disconnect', () => {
            console.log('Redis disconnected')
            isConnected = false;
        });

        await redisClient.connect();
        isConnected = true;

        // redisMigrateWithDb()
        // Enable keyspace notifications for key events
        await redisClient.configSet('notify-keyspace-events', 'KEA');

        return redisClient;
    } catch (error) {
        return null;
    }
}

// Simple helper to get Redis client
export function getRedis() {
    if (!redisClient || !isConnected) {
        return null;
    }
    return redisClient;
}

// Elysia plugin - just provide the Redis client directly
export const redisPlugin = new Elysia({ name: 'redis' })
    .derive({ as: 'scoped' }, () => ({
        redis: getRedis()
    }))
    .onStart(async () => {
        await initRedis();
    });

// Export for manual initialization
export { initRedis, getRedis as redis };
