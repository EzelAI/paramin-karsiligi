import { ASSETS, isAssetId } from '@paramin-karsiligi/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../container';
import { notFound } from '../errors';

export function priceRoutes(app: FastifyInstance, c: Container) {
  app.get('/api/assets', async () => Object.values(ASSETS));

  app.get('/api/prices/status', async () => {
    await c.prices.ensureFresh();
    return c.prices.status();
  });

  app.post('/api/prices/refresh', async () => {
    await c.prices.ensureFresh(true);
    return c.prices.status();
  });

  app.get('/api/prices/:assetId/monthly', async (req) => {
    const { assetId } = z.object({ assetId: z.string() }).parse(req.params);
    const { from } = z.object({ from: z.string().optional() }).parse(req.query);
    if (!isAssetId(assetId)) throw notFound('Bilinmeyen varlık');
    await c.prices.ensureFresh();
    return c.prices.monthly(assetId, from);
  });
}
