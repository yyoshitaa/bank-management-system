import dotenv from 'dotenv';
import path from 'path';
import app from './app.ts';
import { db } from './config/database.ts';
import redisClient from './config/redis.ts';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Validate production environment variables.
if (process.env.NODE_ENV === 'production') {
  const requiredEnvVars = [
    'FRONTEND_URL',
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
  ];

  const missingEnvVars = requiredEnvVars.filter(
    (key) => !process.env[key]?.trim()
  );

  if (missingEnvVars.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missingEnvVars.join(', ')}`
    );
  }

  if (Buffer.byteLength(process.env.JWT_SECRET!, 'utf8') < 32) {
    throw new Error('JWT_SECRET must be at least 32 bytes in production.');
  }
}

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  try {
    const result = await db.query(
      'SELECT current_database(), current_user'
    );

    console.log('Database current_database:', result.rows[0].current_database);
    console.log('Database current_user:', result.rows[0].current_user);

    const server = app.listen(PORT, () => {
      console.log(
        `Bank Management System API is running on port ${PORT}`
      );
    });

    let isShuttingDown = false;

    const shutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.log(`${signal} received. Shutting down gracefully...`);

      server.close(async (error) => {
        if (error) {
          console.error('Error closing HTTP server:', error);
          process.exitCode = 1;
        }

        try {
          await Promise.all([
            db.end(),
            redisClient.quit(),
          ]);

          console.log('Database and Redis connections closed.');
        } catch (shutdownError) {
          console.error('Error during shutdown:', shutdownError);
          process.exitCode = 1;
        }
      });
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));

  } catch (error) {
    console.error('Failed to start server:', error);

    await Promise.allSettled([
      db.end(),
      redisClient.quit(),
    ]);

    process.exitCode = 1;
  }
}

void startServer();
