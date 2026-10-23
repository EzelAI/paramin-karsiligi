import { settingsSchema } from '@paramin-karsiligi/shared';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../container';

export function settingsRoutes(app: FastifyInstance, c: Container) {
  app.get('/api/settings', async () => c.settings.get());

  app.put('/api/settings', async (req) => {
    const saved = c.settings.save(settingsSchema.parse(req.body));
    c.prices.invalidate();
    return saved;
  });
}
