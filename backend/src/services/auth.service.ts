import { HttpError } from '../lib/http.js';
import { anonClient, serviceClient } from '../lib/supabase.js';

const INVALID = new HttpError(401, 'Employee ID / email or password is incorrect.', 'INVALID_CREDENTIALS');

/**
 * Officers sign in with their employee ID (profiles.badge_id) or email. The employee ID is
 * resolved to the account email server-side; the password check itself is done by Supabase Auth.
 * Every failure returns the same message so the endpoint does not reveal which IDs exist.
 */
export async function login(identifier: string, password: string) {
  const id = identifier?.trim();
  if (!id || !password) throw new HttpError(400, 'Employee ID / email and password are required.', 'VALIDATION');

  let email = id;
  if (!id.includes('@')) {
    const { data } = await serviceClient.from('profiles').select('email').ilike('badge_id', id).maybeSingle();
    if (!data?.email) throw INVALID;
    email = data.email;
  }

  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) throw INVALID;

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
  };
}

export async function refresh(refreshToken: string) {
  if (!refreshToken) throw new HttpError(400, 'refreshToken is required.', 'VALIDATION');
  const { data, error } = await anonClient().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) throw new HttpError(401, 'Your session has expired. Please sign in again.', 'UNAUTHENTICATED');
  return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token, expiresAt: data.session.expires_at };
}
