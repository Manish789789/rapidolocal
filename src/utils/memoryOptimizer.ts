/**
 * Memory optimization utilities for the RapidoRide backend
 */

import { logger } from "./logger";

// Database readiness check
export const waitForDatabaseReady = async (timeoutMs = 30000): Promise<boolean> => {
    try {
        const { isDbConnected } = await import('./db.config');
        const startTime = Date.now();
        
        while (!isDbConnected() && (Date.now() - startTime) < timeoutMs) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        return isDbConnected();
    } catch (error: any) {
        logger.error({ error, msg: 'Error checking database readiness' });
        return false;
    }
};

// Safe database operation wrapper
export const withDatabaseReady = async <T>(
    operation: () => Promise<T>,
    context = 'Unknown operation'
): Promise<T | null> => {
    try {
        const isReady = await waitForDatabaseReady(10000);
        if (!isReady) {
            logger.warn({ msg: `Skipping ${context} - database not ready` });
            return null;
        }
        
        return await operation();
    } catch (error: any) {
        logger.error({ error, msg: `Error in ${context}`, context });
        return null;
    }
};

// Batch processing utility
export const processBatch = async <T>(
    items: T[],
    batchSize: number,
    processor: (batch: T[]) => Promise<void>,
    delayMs = 10
): Promise<void> => {
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        
        try {
            await processor(batch);
            
            // Prevent event loop blocking
            if (i % (batchSize * 5) === 0) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        } catch (error: any) {
            logger.error({ 
                error, 
                msg: `Batch processing failed for items ${i}-${i + batchSize}`,
                batchIndex: Math.floor(i / batchSize)
            });
        }
    }
};

// Memory usage monitoring
export const logMemoryUsage = (context: string) => {
    const used = process.memoryUsage();
    logger.info({
        context,
        memory: {
            rss: `${Math.round(used.rss / 1024 / 1024 * 100) / 100} MB`,
            heapTotal: `${Math.round(used.heapTotal / 1024 / 1024 * 100) / 100} MB`,
            heapUsed: `${Math.round(used.heapUsed / 1024 / 1024 * 100) / 100} MB`,
            external: `${Math.round(used.external / 1024 / 1024 * 100) / 100} MB`
        }
    });
};

// Debounced function executor
export const createDebounced = <T extends (...args: any[]) => any>(
    func: T,
    delay: number
): T => {
    let timeoutId: NodeJS.Timeout | null = null;
    
    return ((...args: Parameters<T>) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        
        timeoutId = setTimeout(() => {
            func(...args);
        }, delay);
    }) as T;
};

// Circuit breaker for Redis operations
export class CircuitBreaker {
    private failures = 0;
    private lastFailureTime = 0;
    private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
    
    constructor(
        private failureThreshold = 5,
        private recoveryTimeoutMs = 60000
    ) {}
    
    async execute<T>(operation: () => Promise<T>): Promise<T | null> {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime < this.recoveryTimeoutMs) {
                logger.warn({ msg: 'Circuit breaker is OPEN, operation blocked' });
                return null;
            } else {
                this.state = 'HALF_OPEN';
            }
        }
        
        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }
    
    private onSuccess() {
        this.failures = 0;
        this.state = 'CLOSED';
    }
    
    private onFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        
        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
            logger.error({ 
                msg: 'Circuit breaker opened due to failures',
                failures: this.failures 
            });
        }
    }
}

// Resource cleanup utility
export class ResourceManager {
    private resources: Set<() => Promise<void>> = new Set();
    
    register(cleanup: () => Promise<void>) {
        this.resources.add(cleanup);
    }
    
    async cleanup() {
        const cleanupPromises = Array.from(this.resources).map(async (cleanup) => {
            try {
                await cleanup();
            } catch (error: any) {
                logger.error({ error, msg: 'Resource cleanup failed' });
            }
        });
        
        await Promise.allSettled(cleanupPromises);
        this.resources.clear();
    }
}

// Global resource manager instance
export const globalResourceManager = new ResourceManager();

// Graceful shutdown handler
export const setupGracefulShutdown = () => {
    const shutdown = async (signal: string) => {
        logger.info({ msg: `Received ${signal}, shutting down gracefully...` });
        
        try {
            await globalResourceManager.cleanup();
            logger.info({ msg: 'Graceful shutdown completed' });
            process.exit(0);
        } catch (error: any) {
            logger.error({ error, msg: 'Error during shutdown' });
            process.exit(1);
        }
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon
};
