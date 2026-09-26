import cors from 'cors';
import express from 'express';
import { config } from './config/env.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import routes from './routes/index.js';

/** The CSAP API. Served by `server.ts` locally and by `api/index.ts` on Vercel. */
const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: config.corsOrigins }));
// PAN document uploads arrive as base64. The raw body is kept for webhook signature checks (GeM intake).
app.use(
  express.json({
    limit: '8mb',
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);

app.use('/api', routes);
app.use('/api', notFound);
app.use(errorHandler);

export default app;
