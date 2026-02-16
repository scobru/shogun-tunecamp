import { jest } from '@jest/globals';
import { rateLimit } from './rateLimit.js';

describe('rateLimit middleware', () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    jest.useFakeTimers();
    req = {
      ip: '127.0.0.1',
      headers: {},
      socket: { remoteAddress: '127.0.0.1' }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should allow requests under the limit', () => {
    const middleware = rateLimit({ windowMs: 1000, max: 2 });

    middleware(req, res as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();

    middleware(req, res as any, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should block requests over the limit', () => {
    const middleware = rateLimit({ windowMs: 1000, max: 2 });

    middleware(req, res as any, next);
    middleware(req, res as any, next);

    middleware(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('Too many requests')
    }));
    expect(next).toHaveBeenCalledTimes(2); // Only for allowed requests
  });

  it('should allow requests after window expires', () => {
    const middleware = rateLimit({ windowMs: 1000, max: 1 });

    middleware(req, res as any, next);
    expect(next).toHaveBeenCalledTimes(1);

    middleware(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(429);

    // Advance time by 1.1 seconds
    jest.advanceTimersByTime(1100);

    // Clear mocks
    next.mockClear();
    res.status.mockClear();

    middleware(req, res as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should track IPs separately', () => {
    const middleware = rateLimit({ windowMs: 1000, max: 1 });

    middleware(req, res as any, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Different IP
    const req2 = { ...req, ip: '192.168.0.1' };
    const next2 = jest.fn();
    const res2 = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    middleware(req2, res2 as any, next2);
    expect(next2).toHaveBeenCalledTimes(1);
    expect(res2.status).not.toHaveBeenCalled();
  });
});
