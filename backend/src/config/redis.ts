
import { Redis } from 'ioredis';

const redisClient = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379'
);

redisClient.on('connect', () => {
  console.log('Connected to Redis successfully.');
});

redisClient.on('error', (err: Error) => {
  console.error('Redis connection error:', err);
});

export default redisClient;
