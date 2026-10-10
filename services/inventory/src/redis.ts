import Redis from 'ioredis';
import promClient from 'prom-client';

export const cacheHitsTotal = new promClient.Counter({ name: 'cache_hits_total', help: 'Cache hits' });
export const cacheMissesTotal = new promClient.Counter({ name: 'cache_misses_total', help: 'Cache misses' });

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => {
        return Math.min(times * 50, 2000);
    }
});

redis.on('error', (err) => {
    console.error('Redis error:', err);
});
