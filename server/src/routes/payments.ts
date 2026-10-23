import { idParam, paymentSchema } from '@paramin-karsiligi/shared';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../container';
import { notFound } from '../errors';

export function paymentRoutes(app: FastifyInstance, c: Container) {
  app.put('/api/payments/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const updated = c.payments.update(id, paymentSchema.parse(req.body));
    if (!updated) throw notFound('Ödeme bulunamadı');
    return updated;
  });

  app.delete('/api/payments/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    if (!c.payments.delete(id)) throw notFound('Ödeme bulunamadı');
    reply.code(204);
  });
}
