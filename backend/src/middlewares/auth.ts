import type { SupabaseClient } from '@supabase/supabase-js';
import type { Response } from 'express';
import { asyncHandler, HttpError } from '../lib/http.js';
import { serviceClient, userClient } from '../lib/supabase.js';

export interface AuthContext {
  userId: string;
  email: string;
  db: SupabaseClient;
}

/** Validates the Supabase access token sent by the frontend and attaches an officer-scoped client. */
export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Sign in required.', 'UNAUTHENTICATED');

  const { data, error } = await serviceClient.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Please sign in again.', 'UNAUTHENTICATED');

  res.locals.auth = { userId: data.user.id, email: data.user.email ?? '', db: userClient(token) } satisfies AuthContext;
  next();
});

export const authOf = (res: Response): AuthContext => res.locals.auth as AuthContext;
