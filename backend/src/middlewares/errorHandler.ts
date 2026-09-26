import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/http.js';

export function notFound(req: Request, res: Response) {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: `No API route for ${req.method} ${req.path}` });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : 'Internal server error';
  if (status >= 500) console.error(`[api] ${req.method} ${req.path} →`, err);
  res.status(status).json({
    success: false,
    code: err instanceof HttpError ? err.code : 'INTERNAL',
    message: status >= 500 && !(err instanceof HttpError) ? 'Internal server error' : message,
  });
}
