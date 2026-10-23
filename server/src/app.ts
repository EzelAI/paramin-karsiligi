import fs from 'node:fs';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { config } from './config';
import type { Container } from './container';
import { HttpError } from './errors';
import { investmentRoutes } from './routes/investments';
import { paymentRoutes } from './routes/payments';
import { priceRoutes } from './routes/prices';
import { settingsRoutes } from './routes/settings';

export async function buildApp(c: Container) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: err.issues.map((i) => i.message).join(', ') });
    }
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: (err as Error).message || 'Sunucu hatası' });
  });

  investmentRoutes(app, c);
  paymentRoutes(app, c);
  priceRoutes(app, c);
  settingsRoutes(app, c);

  // Derlenmiş arayüz varsa aynı sunucudan yayınla (npm run build && npm start)
  if (fs.existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Bulunamadı' }) : reply.sendFile('index.html'),
    );
  }

  return app;
}
