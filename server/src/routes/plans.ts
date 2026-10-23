import { idParam, purchasePlanSchema } from '@paramin-karsiligi/shared';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../container';
import { notFound } from '../errors';

export function planRoutes(app: FastifyInstance, c: Container) {
  const requirePlan = (id: number) => {
    const plan = c.plans.get(id);
    if (!plan) throw notFound('Ürün bulunamadı');
    return plan;
  };

  app.get('/api/plans', async () => c.plans.list());

  app.post('/api/plans', async (req, reply) => {
    reply.code(201);
    return c.plans.create(purchasePlanSchema.parse(req.body));
  });

  app.get('/api/plans/:id', async (req) => requirePlan(idParam.parse(req.params).id));

  app.put('/api/plans/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    requirePlan(id);
    return c.plans.update(id, purchasePlanSchema.parse(req.body));
  });

  app.delete('/api/plans/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    if (!c.plans.delete(id)) throw notFound('Ürün bulunamadı');
    reply.code(204);
  });
}
