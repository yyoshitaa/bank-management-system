
import type { Response, NextFunction } from 'express';
import redisClient from '../config/redis.ts';
import type { AuthenticatedRequest } from './auth.middleware.ts';

export const idempotencyMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const idempotencyKey = req.headers['x-idempotency-key'] as string;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      error: 'Authentication required.'
    });
  }

  if (!idempotencyKey) {
    return res.status(400).json({
      error: 'Missing mandatory X-Idempotency-Key header.'
    });
  }

  // Each user's idempotency keys are isolated.
  const redisKey = `idempotency:${userId}:${idempotencyKey}`;

  try {
    const cachedResponse = await redisClient.get(redisKey);

    if (cachedResponse) {
      const parsed = JSON.parse(cachedResponse);

      return res.status(parsed.status).json({
        ...parsed.body,
        _cached: true
      });
    }

    const originalJson = res.json.bind(res);

    res.json = (body: any) => {
  // Cache successful responses only (HTTP 2xx).
  if (res.statusCode >= 200 && res.statusCode < 300) {
    const responseData = {
      status: res.statusCode,
      body
    };

    redisClient.setex(
      redisKey,
      86400,
      JSON.stringify(responseData)
   ).catch((err: Error) => {
      console.error('Failed to cache idempotency response:', err);
    });
  }

  return originalJson(body);
};

    next();
  } catch (error) {
    console.error('Idempotency middleware error:', error);

    return res.status(500).json({
      error: 'Internal server error during idempotency check.'
    });
  }
};
