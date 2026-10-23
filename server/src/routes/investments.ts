import { bulkPaymentSchema, dateInMonth, idParam, investmentSchema, monthRange, paymentSchema } from '@paramin-karsiligi/shared';
import { buildInvestmentWorkbook, exportFilename } from '@paramin-karsiligi/shared/excel';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../container';
import { notFound } from '../errors';

export function investmentRoutes(app: FastifyInstance, c: Container) {
  const requireInvestment = (id: number) => {
    const inv = c.investments.get(id);
    if (!inv) throw notFound('Yatırım bulunamadı');
    return inv;
  };

  app.get('/api/investments', async () => c.investments.list());

  app.post('/api/investments', async (req, reply) => {
    reply.code(201);
    return c.investments.create(investmentSchema.parse(req.body));
  });

  app.get('/api/investments/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    return { ...requireInvestment(id), payments: c.payments.listByInvestment(id) };
  });

  app.put('/api/investments/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    requireInvestment(id);
    return c.investments.update(id, investmentSchema.parse(req.body));
  });

  app.delete('/api/investments/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    if (!c.investments.delete(id)) throw notFound('Yatırım bulunamadı');
    reply.code(204);
  });

  app.post('/api/investments/:id/payments', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    requireInvestment(id);
    reply.code(201);
    return c.payments.createMany(id, [paymentSchema.parse(req.body)])[0];
  });

  app.post('/api/investments/:id/payments/bulk', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    requireInvestment(id);
    const b = bulkPaymentSchema.parse(req.body);
    const inputs = monthRange(b.startMonth, b.endMonth).map((m) => ({
      date: dateInMonth(m, b.day),
      amount: b.amount,
      note: b.note,
    }));
    reply.code(201);
    return c.payments.createMany(id, inputs);
  });

  app.get('/api/investments/:id/analysis', async (req) => {
    const { id } = idParam.parse(req.params);
    requireInvestment(id);
    return c.analysis.forInvestment(id);
  });

  app.get('/api/investments/:id/export.xlsx', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const inv = requireInvestment(id);
    const buffer = Buffer.from(await buildInvestmentWorkbook(inv, await c.analysis.forInvestment(id), c.settings.get()));
    const filename = exportFilename(inv);
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return buffer;
  });
}
