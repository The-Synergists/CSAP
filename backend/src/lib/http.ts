import type { NextFunction, Request, RequestHandler, Response } from 'express';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Express 4 does not catch rejected promises from async handlers; this forwards them. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/** Throws a 502 for Supabase/PostgREST errors so callers never continue on bad data. */
/** For single-row lookups (.maybeSingle()): the row, or null when it does not exist. */
export const mustOne = <T>(result: { data: T | null; error: { message: string } | null }, what: string): T | null => {
  if (result.error) throw new HttpError(502, `Database error while loading ${what}: ${result.error.message}`, 'DB_ERROR');
  return result.data ?? null;
};

export const must = <T>(result: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (result.error) throw new HttpError(502, `Database error while loading ${what}: ${result.error.message}`, 'DB_ERROR');
  return (result.data ?? ([] as unknown)) as T;
};
