import app from './app.js';
import { config } from './config/env.js';

app.listen(config.port, () => {
  console.log(`[csap-backend] listening on http://localhost:${config.port} (${config.nodeEnv})`);
  console.log(`[csap-backend] verification engine: ${config.aiEngineUrl}`);
});
