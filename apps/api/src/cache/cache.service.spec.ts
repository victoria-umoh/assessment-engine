import { ConfigService } from '@nestjs/config';

const mockClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
  disconnect: jest.fn(),
  on: jest.fn(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockClient),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { CacheService } from './cache.service';

const config = {
  get: (key: string) =>
    ({ NODE_ENV: 'test', REDIS_URL: 'redis://cache-test:6379' })[key as never],
} as unknown as ConfigService;

describe('CacheService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CACHE_TEST = '1'; // unit tests opt in; e2e suites stay cache-off
  });

  afterAll(() => {
    delete process.env.CACHE_TEST;
  });

  it('wrap computes on miss and stores the JSON value with the TTL', async () => {
    mockClient.get.mockResolvedValue(null);
    const service = new CacheService(config);
    const result = await service.wrap('k1', 300, async () => ({ hello: 'world' }));
    expect(result).toEqual({ hello: 'world' });
    expect(mockClient.get).toHaveBeenCalledWith('k1');
    expect(mockClient.set).toHaveBeenCalledWith('k1', JSON.stringify({ hello: 'world' }), 'EX', 300);
  });

  it('wrap returns the cached JSON value without computing on a hit', async () => {
    mockClient.get.mockResolvedValue(JSON.stringify({ cached: true }));
    const fn = jest.fn();
    const service = new CacheService(config);
    const result = await service.wrap('k1', 300, fn);
    expect(result).toEqual({ cached: true });
    expect(fn).not.toHaveBeenCalled();
    expect(mockClient.set).not.toHaveBeenCalled();
  });

  it('degrades to a miss (never throws) when redis errors', async () => {
    mockClient.get.mockRejectedValue(new Error('ECONNREFUSED'));
    mockClient.set.mockRejectedValue(new Error('ECONNREFUSED'));
    mockClient.del.mockRejectedValue(new Error('ECONNREFUSED'));
    const service = new CacheService(config);
    await expect(service.wrap('k1', 60, async () => 'fresh')).resolves.toBe('fresh');
    await expect(service.del('k1', 'k2')).resolves.toBeUndefined();
  });

  it('is disabled in the jest env unless CACHE_TEST is set', async () => {
    delete process.env.CACHE_TEST;
    mockClient.get.mockResolvedValue(JSON.stringify('stale'));
    const service = new CacheService(config);
    await expect(service.wrap('k1', 60, async () => 'fresh')).resolves.toBe('fresh');
    expect(mockClient.get).not.toHaveBeenCalled();
    process.env.CACHE_TEST = '1';
  });
});
