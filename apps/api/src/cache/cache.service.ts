import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// Spec §6 read cache. Fail-open by design: any Redis unavailability degrades
// to a cache miss — reads must never break because the cache is down.
// Deterministically OFF in Jest e2e (NODE_ENV=test without CACHE_TEST): a dev
// machine's live Redis must not leak state across suites.
@Injectable()
export class CacheService implements OnModuleDestroy {
  private client: Redis | null = null;

  constructor(config: ConfigService) {
    const enabled = config.get('NODE_ENV') !== 'test' || !!process.env.CACHE_TEST;
    if (enabled) {
      this.client = new Redis(config.get<string>('REDIS_URL')!, {
        lazyConnect: true, // e2e/boot without Redis stays possible (QueuesService posture)
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      this.client.on('error', () => undefined); // errors surface as misses, never throws
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      const value = await this.client.get(key);
      return value === null ? null : (JSON.parse(value) as T);
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSec: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSec);
    } catch {
      // cache write failure is not an application failure
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.client || keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch {
      // stale entries expire via TTL if the del is lost
    }
  }

  // NOTE: a hit is detected by `get() !== null`, so wrap() treats a cached
  // `null` as a miss and recomputes. Callers cache arrays/objects/views (never
  // a bare null), so this is safe today — don't use wrap() for nullable values.
  async wrap<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const value = await fn();
    await this.set(key, value, ttlSec);
    return value;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
