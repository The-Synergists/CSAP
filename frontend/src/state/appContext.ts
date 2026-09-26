import { createContext, useContext } from 'react';
import type { Database, DecisionType, User } from '@shared/domain/types';
import type { VerificationRun } from '@shared/domain/verification';

export type DataSource = 'api' | 'demo';
export type LoginResult = { ok: true } | { ok: false; error: string };

export interface DecisionInput {
  bidId: string;
  decision: DecisionType;
  reason: string;
  remarks: string;
}

export interface AppContextValue {
  /** 'api' = backend + Supabase; 'demo' = in-browser demo dataset. */
  source: DataSource;
  db: Database;
  status: 'loading' | 'ready' | 'error';
  loadError: string | null;
  reload: () => Promise<void>;

  /** True while the Supabase Realtime channel is connected. */
  realtimeLive: boolean;
  /** A session exists (the workspace may still be loading). */
  signedIn: boolean;
  /** The signed-in officer; null until the workspace has loaded. */
  currentUser: User | null;
  /** True while a restored session is being validated on first load. */
  restoring: boolean;
  login: (identifier: string, password: string) => Promise<LoginResult>;
  logout: () => void;

  /** Records the officer decision; resolves once it is saved and the data is refreshed. Throws with a readable message on failure. */
  submitDecision: (input: DecisionInput) => Promise<void>;
  verificationRuns: Record<string, VerificationRun>;
  startVerification: (bidId: string) => Promise<void>;
  /** Demo source only — restores the built-in dataset. */
  resetDemoData?: () => void;

  activeTenderId: string | null;
  setActiveTenderId: (id: string) => void;
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
}

export const AppContext = createContext<AppContextValue | undefined>(undefined);

export const useApp = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
};
