import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DEMO_PASSWORD, seedDatabase } from '@shared/demo/seed';
import { getBidView } from '@shared/domain/selectors';
import type { Database } from '@shared/domain/types';
import { buildSteps, pendingSteps, type VerificationRun } from '@shared/domain/verification';
import { api, ApiError, sessionStore, sessionUserId } from './api';
import { AppContext, type AppContextValue, type DataSource, type DecisionInput, type LoginResult } from './appContext';
import { appendAudit, applyDecision } from './demoStore';
import { subscribeToTables } from './realtime';

const SOURCE: DataSource = import.meta.env.VITE_DATA_SOURCE === 'demo' ? 'demo' : 'api';
const DEMO_DB_KEY = 'csap.demo-db.v4';
const DEMO_SESSION_KEY = 'csap.demo-session.v1';
const STEP_MS = 450;

const EMPTY_DB: Database = {
  users: [], tenders: [], requirements: [], bidders: [], bids: [], documents: [], emdTransactions: [],
  complianceChecks: [], findings: [], riskFactors: [], recommendations: [], decisions: [], auditEvents: [], portalVerifications: [],
};

const read = <T,>(key: string): T | null => {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — state still works in memory */
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isDemo = SOURCE === 'demo';
  const [db, setDb] = useState<Database>(() => (isDemo ? read<Database>(DEMO_DB_KEY) ?? seedDatabase() : EMPTY_DB));
  const [status, setStatus] = useState<AppContextValue['status']>(isDemo ? 'ready' : 'loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(() =>
    isDemo ? read<{ userId: string }>(DEMO_SESSION_KEY)?.userId ?? null : sessionUserId(sessionStore.get()),
  );
  const [restoring, setRestoring] = useState(!isDemo && !!sessionStore.get());
  const [verificationRuns, setVerificationRuns] = useState<Record<string, VerificationRun>>({});
  const [activeTenderId, setActiveTenderId] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const running = useRef(new Set<string>());
  // Mutations read the latest dataset from this ref (kept in sync after each commit).
  const dbRef = useRef(db);
  useLayoutEffect(() => {
    dbRef.current = db;
  }, [db]);

  useEffect(() => {
    if (isDemo) write(DEMO_DB_KEY, db);
  }, [db, isDemo]);

  const logout = useCallback(() => {
    if (isDemo) write(DEMO_SESSION_KEY, null);
    else {
      sessionStore.set(null);
      setDb(EMPTY_DB);
      setStatus('loading');
    }
    setUserId(null);
    setAssistantOpen(false);
    setActiveTenderId(null);
    setVerificationRuns({});
  }, [isDemo]);

  const reload = useCallback(async () => {
    if (isDemo) return;
    try {
      const next = await api.workspace();
      setDb(next);
      setStatus('ready');
      setLoadError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setLoadError(message(err));
      setStatus('error');
    } finally {
      setRestoring(false);
    }
  }, [isDemo, logout]);

  // API source: fetch the workspace whenever a session exists (external data sync; state is
  // only set once the request resolves).
  useEffect(() => {
    if (isDemo || !userId) return;
    let cancelled = false;
    api
      .workspace()
      .then((next) => {
        if (cancelled) return;
        setDb(next);
        setStatus('ready');
        setLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) logout();
        else {
          setLoadError(message(err));
          setStatus('error');
        }
      })
      .finally(() => !cancelled && setRestoring(false));
    return () => {
      cancelled = true;
    };
  }, [isDemo, userId, logout]);

  // Realtime: when any officer (or the verification service) changes decisions, audit
  // events, verification runs or portal checks, refresh the workspace so every open screen stays current.
  const [realtimeLive, setRealtimeLive] = useState(false);
  useEffect(() => {
    if (isDemo || !userId) return;
    let timer: number | undefined;
    const unsubscribe = subscribeToTables(
      'workspace',
      [{ table: 'officer_decisions' }, { table: 'audit_events' }, { table: 'ai_verification_runs' }, { table: 'portal_verifications' }],
      () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          api.workspace().then(setDb).catch(() => {});
        }, 400);
      },
      setRealtimeLive,
    );
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [isDemo, userId]);

  const currentUser = useMemo(() => (userId ? db.users.find((u) => u.id === userId) ?? null : null), [userId, db.users]);

  const login = useCallback(
    async (identifier: string, password: string): Promise<LoginResult> => {
      if (isDemo) {
        await sleep(300);
        const id = identifier.trim().toLowerCase();
        const user = dbRef.current.users.find((u) => u.employeeId.toLowerCase() === id || u.email.toLowerCase() === id);
        if (!user || password !== DEMO_PASSWORD) return { ok: false, error: 'Employee ID / email or password is incorrect.' };
        write(DEMO_SESSION_KEY, { userId: user.id });
        setUserId(user.id);
        return { ok: true };
      }
      try {
        const session = await api.login(identifier, password);
        sessionStore.set(session);
        setStatus('loading');
        setRestoring(true);
        setUserId(sessionUserId(session));
        return { ok: true };
      } catch (err) {
        return { ok: false, error: message(err) };
      }
    },
    [isDemo],
  );

  const submitDecision = useCallback(
    async (input: DecisionInput) => {
      if (isDemo) {
        const user = dbRef.current.users.find((u) => u.id === userId);
        if (!user) throw new Error('Your session has ended. Please sign in again.');
        const next = applyDecision(dbRef.current, user, input);
        dbRef.current = next;
        setDb(next);
        return;
      }
      await api.submitDecision(input);
      await reload();
    },
    [isDemo, userId, reload],
  );

  const revealSteps = useCallback(async (bidId: string, final: VerificationRun) => {
    for (let i = 0; i < final.steps.length; i++) {
      await sleep(STEP_MS);
      setVerificationRuns((prev) => ({
        ...prev,
        [bidId]: {
          ...final,
          done: i === final.steps.length - 1,
          steps: final.steps.map((s, idx) => (idx <= i ? s : { ...s, status: idx === i + 1 ? 'running' : 'pending', detail: '' })),
        },
      }));
    }
  }, []);

  const startVerification = useCallback(
    async (bidId: string) => {
      if (running.current.has(bidId)) return;
      const view = getBidView(dbRef.current, bidId);
      if (!view) return;
      running.current.add(bidId);
      const startedAt = new Date().toISOString();
      setVerificationRuns((prev) => ({ ...prev, [bidId]: { bidId, startedAt, done: false, steps: pendingSteps(view) } }));
      try {
        let final: VerificationRun;
        if (isDemo) {
          final = {
            bidId,
            startedAt,
            finishedAt: new Date().toISOString(),
            done: true,
            steps: buildSteps(view),
            outcome: {
              engineVersion: 'demo (recorded result replayed)',
              met: view.counts.met,
              exceptions: view.counts.exceptions,
              total: view.counts.total,
              riskLevel: view.bid.riskLevel,
              suggestedDecision: view.recommendation?.suggestedDecision ?? 'COMMITTEE_REVIEW',
              differences: [],
              simulatedRegistryChecks: 0,
            },
          };
          const user = dbRef.current.users.find((u) => u.id === userId);
          setDb(
            appendAudit(dbRef.current, [
              { timestamp: startedAt, tenderId: view.tender.id, bidId, actorType: 'SYSTEM', actor: 'Verification service', summary: 'Verification re-run started', details: `Re-run requested by ${user?.name ?? 'officer'}.` },
              { timestamp: final.finishedAt!, tenderId: view.tender.id, bidId, actorType: 'SYSTEM', actor: 'Verification service', summary: 'Verification re-run completed', details: `${view.counts.met} of ${view.counts.total} requirements met; ${view.counts.exceptions} flagged for officer review. Consistent with the recorded result.` },
            ]),
          );
        } else {
          final = await api.runVerification(bidId);
        }
        await revealSteps(bidId, final);
        if (!isDemo) await reload();
      } catch (err) {
        setVerificationRuns((prev) => ({
          ...prev,
          [bidId]: { bidId, startedAt, done: true, steps: [], error: message(err) },
        }));
        if (!isDemo) await reload();
      } finally {
        running.current.delete(bidId);
      }
    },
    [isDemo, userId, reload, revealSteps],
  );

  const resetDemoData = useCallback(() => {
    setDb(seedDatabase());
    setVerificationRuns({});
  }, []);

  const value: AppContextValue = {
    source: SOURCE,
    db,
    status,
    loadError,
    reload,
    signedIn: !!userId,
    realtimeLive,
    currentUser,
    restoring,
    login,
    logout,
    submitDecision,
    verificationRuns,
    startVerification,
    resetDemoData: isDemo ? resetDemoData : undefined,
    activeTenderId,
    setActiveTenderId,
    assistantOpen,
    setAssistantOpen,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
