// Vercel serverless entry for the CSAP backend (Express). All /api/* requests except the
// engine and PAN-registry routes are rewritten here by vercel.json.
import app from '../backend/src/app.js';

export default app;
