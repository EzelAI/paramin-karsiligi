import { buildApp } from './app';
import { config } from './config';
import { createContainer } from './container';

const container = createContainer({ log: (m) => console.log(m) });
const app = await buildApp(container);
container.prices.ensureFresh().catch((err) => app.log.warn(`İlk fiyat güncellemesi başarısız: ${err.message}`));

await app.listen({ port: config.port, host: config.host });
