import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Mount API routes
app.use('/api', routes);

// Global error handler
app.use(errorHandler);

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`[CSAP Backend] Gateway running at http://localhost:${PORT}`);
  console.log(`[CSAP Backend] Environment: ${config.nodeEnv}`);
});

export default app;
