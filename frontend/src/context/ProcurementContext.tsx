import React, { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { Tender, Bid, Bidder, OfficerDecisionRecord, DashboardMetrics } from '../types';
import { findTenderByIdOrSlug, findBidById } from '../types';
import { supabase } from '../lib/supabaseClient';
import { fetchTenders, fetchBids } from '../lib/procurementData';

interface VerificationProgressState {
  isRunning: boolean;
  currentStep: number;
  steps: { name: string; status: 'pending' | 'in-progress' | 'completed' | 'flagged' }[];
  completed: boolean;
}

interface ProcurementContextType {
  tenders: Tender[];
  bids: Bid[];
  bidders: Bidder[];
  activeTenderId: string;
  activeBidId: string;
  activeBidderId: string;
  setActiveTenderId: (id: string) => void;
  setActiveBidId: (id: string) => void;
  setActiveBidderId: (id: string) => void;
  selectBid: (bidId: string, tenderId?: string) => void;
  selectTender: (tenderId: string) => void;
  activeTender: Tender | undefined;
  activeBid: Bid | undefined;
  activeBidder: Bid | undefined;
  verificationProgress: VerificationProgressState;
  startAiVerification: (bidId: string) => Promise<void>;
  submitOfficerDecision: (decision: OfficerDecisionRecord) => Promise<void>;
  metrics: DashboardMetrics;
  currentUser: {
    name: string;
    designation: string;
    organization: string;
    badgeId: string;
    email: string;
  };
  isAuthenticated: boolean;
  /** True once the initial Supabase session check has resolved (whichever way). Route
   *  guards must wait for this before redirecting, or a hard reload of a deep link
   *  races the async session check and always bounces to /login then /dashboard. */
  authChecked: boolean;
  /** True once tenders/bids have been fetched at least once after login. Pages that list
   *  across all tenders/bids (dashboard, tender/bid lists) gate rendering on this to avoid
   *  a crash on a hard reload of a deep link, before the first fetch resolves. Note that
   *  activeTender/activeBid are NOT auto-populated on load — the officer must explicitly
   *  select a tender or bid; see selectTender/selectBid. */
  dataLoaded: boolean;
  logout: () => void;
}

const initialVerificationSteps = [
  { name: 'Documents OCR Extraction', status: 'pending' as const },
  { name: 'Government Registry Cross-Check (GSTN / MCA21)', status: 'pending' as const },
  { name: 'EMD & Payment Gateway Reconciliation', status: 'pending' as const },
  { name: 'Tender Rule & Eligibility Evaluation', status: 'pending' as const },
  { name: 'Discrepancy & Deficit Detection', status: 'pending' as const },
  { name: 'Compliance & Multi-Vector Risk Calculation', status: 'pending' as const },
];

const EMPTY_USER = { name: '', designation: '', organization: '', badgeId: '', email: '' };

const ProcurementContext = createContext<ProcurementContextType | undefined>(undefined);

export const ProcurementProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [activeTenderId, setActiveTenderId] = useState<string>('');
  const [activeBidId, _setActiveBidId] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState(EMPTY_USER);

  const [verificationProgress, setVerificationProgress] = useState<VerificationProgressState>({
    isRunning: false,
    currentStep: 0,
    steps: initialVerificationSteps,
    completed: true,
  });
  // Synchronous guard against duplicate runs — React state updates (and the button's
  // `disabled` prop) are async, so a rapid double-click/double-invoke can otherwise slip
  // through before the first render reflects isRunning:true, each one writing its own
  // full set of ai_verification_runs / gov_portal_verification_log / audit_events rows.
  const verificationLockRef = useRef(false);

  // Auth session tracking
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(!!data.session);
      setUserId(data.session?.user.id ?? null);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      setUserId(session?.user.id ?? null);
      setAuthChecked(true);
      if (!session) {
        setDataLoaded(false);
        setTenders([]);
        setBids([]);
        setCurrentUser(EMPTY_USER);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const reloadData = useCallback(async () => {
    const [tenderList, bidList] = await Promise.all([fetchTenders(), fetchBids()]);
    setTenders(tenderList);
    setBids(bidList);
    // Deliberately no auto-selection here: the officer must explicitly pick a tender/bid
    // (from the Dashboard, Tenders list, or search) rather than landing on one by default.
    setDataLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load profile + domain data once authenticated
  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    supabase
      .from('profiles')
      .select('full_name, designation, organization, badge_id, email')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) {
          setCurrentUser({
            name: data.full_name ?? '',
            designation: data.designation ?? '',
            organization: data.organization ?? '',
            badgeId: data.badge_id ?? '',
            email: data.email ?? '',
          });
        }
      });
    reloadData().catch((err) => console.error('reloadData failed:', err));
  }, [isAuthenticated, userId, reloadData]);

  // No fallback to tenders[0]/bids[0]: until the officer explicitly selects a case,
  // there is no active tender or bid.
  const activeTender = activeTenderId ? findTenderByIdOrSlug(tenders, activeTenderId) : undefined;
  const activeBid = activeBidId ? findBidById(bids, activeBidId) : undefined;
  const activeBidder = activeBid;

  const setActiveBidId = (id: string) => {
    _setActiveBidId(id);
    const found = findBidById(bids, id);
    if (found && found.tenderId) setActiveTenderId(found.tenderId);
  };
  const setActiveBidderId = setActiveBidId;

  const selectBid = (bidId: string, tenderId?: string) => {
    _setActiveBidId(bidId);
    if (tenderId) {
      setActiveTenderId(tenderId);
    } else {
      const found = findBidById(bids, bidId);
      if (found && found.tenderId) setActiveTenderId(found.tenderId);
    }
  };

  const selectTender = (tenderId: string) => setActiveTenderId(tenderId);

  const logout = () => {
    supabase.auth.signOut();
  };

  const startAiVerification = async (targetBidId: string) => {
    if (!userId || verificationLockRef.current) return;
    verificationLockRef.current = true;
    try {
      await runAiVerification(targetBidId);
    } finally {
      verificationLockRef.current = false;
    }
  };

  const runAiVerification = async (targetBidId: string) => {
    const { data: run, error: runErr } = await supabase
      .from('ai_verification_runs')
      .insert({ bid_id: targetBidId, initiated_by: userId, status: 'RUNNING', steps: initialVerificationSteps })
      .select('id')
      .single();
    if (runErr) throw runErr;

    setVerificationProgress({
      isRunning: true,
      currentStep: 0,
      steps: initialVerificationSteps.map((s, idx) => ({ ...s, status: idx === 0 ? 'in-progress' : 'pending' })),
      completed: false,
    });

    const bid = findBidById(bids, targetBidId);
    let finalSteps: VerificationProgressState['steps'] = initialVerificationSteps;

    for (let step = 0; step < initialVerificationSteps.length; step++) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (step === 1 && bid) {
        // Government Registry Cross-Check — simulate the 5 registry portal calls.
        const now = new Date().toISOString();
        const canned = (portal: string, checkType: string, field: string, value: string) => ({
          ai_verification_run_id: run.id,
          portal_code: portal,
          check_type: checkType,
          requested_at: now,
          responded_at: now,
          request_payload: { [field]: value },
          response_payload: { status: 'VERIFIED', source: `${portal} (simulated)` },
          result_status: 'VERIFIED',
        });
        await supabase.from('gov_portal_verification_log').insert([
          canned('GSTN', 'GSTIN_STATUS', 'gstin', bid.gstin),
          canned('UDYAM', 'UDYAM_STATUS', 'udyam_number', bid.udyamNumber),
          canned('EPFO', 'EPFO_ECR', 'gstin', bid.gstin),
          canned('ESIC', 'ESIC_ECR', 'gstin', bid.gstin),
          canned('INCOME_TAX', 'ITR_FILING_STATUS', 'pan', bid.pan),
        ]);
      }
      if (step === 2 && bid) {
        // EMD & Payment Gateway Reconciliation
        const now = new Date().toISOString();
        await supabase.from('gov_portal_verification_log').insert({
          ai_verification_run_id: run.id,
          portal_code: 'BANK_TREASURY_SFMS',
          check_type: 'EMD_RECONCILIATION',
          requested_at: now,
          responded_at: now,
          request_payload: { transaction_or_bg_no: bid.emd?.transactionOrBgNo ?? '' },
          response_payload: { status: bid.verificationsSummary.emd, source: 'BANK_TREASURY_SFMS (simulated)' },
          result_status: bid.verificationsSummary.emd,
        });
      }

      setVerificationProgress((prev) => {
        const isFlagged =
          (step === 4 && targetBidId === 'BID-001') ||
          (step === 3 && targetBidId === 'BID-002') ||
          ((step === 2 || step === 4) && targetBidId === 'BID-003');
        const nextSteps = prev.steps.map((s, idx) => {
          // A step already marked 'flagged' by an earlier iteration must stay flagged —
          // don't let this iteration's blanket "everything before `step` is completed" pass overwrite it.
          if (idx < step) return { ...s, status: s.status === 'flagged' ? s.status : ('completed' as const) };
          if (idx === step) return { ...s, status: isFlagged ? ('flagged' as const) : ('completed' as const) };
          if (idx === step + 1) return { ...s, status: 'in-progress' as const };
          return s;
        });
        finalSteps = nextSteps;
        return { ...prev, currentStep: step + 1, steps: nextSteps };
      });
    }

    await supabase
      .from('ai_verification_runs')
      .update({ status: 'COMPLETED', completed_at: new Date().toISOString(), steps: finalSteps })
      .eq('id', run.id);

    await supabase.from('audit_events').insert({
      bid_id: targetBidId,
      tender_id: bid?.tenderId,
      actor_profile_id: null,
      actor_display_name: 'CSAP Verification Engine',
      actor_role: 'Automated Service',
      action_type: 'SYSTEM_AI',
      summary: 'AI verification pipeline completed',
      details: 'Simulated government registry cross-check, EMD reconciliation, and compliance scoring completed.',
    });

    setVerificationProgress((prev) => ({ ...prev, isRunning: false, completed: true }));
    await reloadData();
  };

  const submitOfficerDecision = async (decision: OfficerDecisionRecord) => {
    const targetId = decision.bidId || decision.bidderId;
    const { error } = await supabase.rpc('submit_officer_decision', {
      p_bid_id: targetId,
      p_decision: decision.decision,
      p_remarks: decision.remarks,
      p_justification_reason: decision.justificationReason,
      p_conditions_applied: decision.conditionsApplied ?? null,
    });
    if (error) throw error;
    await reloadData();
  };

  const metrics: DashboardMetrics = {
    activeTenders: tenders.filter((t) => t.status !== 'AWARDED' && t.status !== 'CANCELLED').length,
    bidsUnderVerification: bids.length,
    fullyCompliant: bids.filter((b) => b.overallComplianceScore >= 95).length,
    pendingReviews: bids.filter((b) => !b.officerDecision).length,
    highRisk: bids.filter((b) => b.riskLevel === 'HIGH' || b.riskLevel === 'CRITICAL').length,
    averageCompliance: Math.round(
      bids.reduce((sum, b) => sum + b.overallComplianceScore, 0) / (bids.length || 1)
    ),
  };

  return (
    <ProcurementContext.Provider
      value={{
        tenders,
        bids,
        bidders: bids,
        activeTenderId,
        activeBidId,
        activeBidderId: activeBidId,
        setActiveTenderId,
        setActiveBidId,
        setActiveBidderId,
        selectBid,
        selectTender,
        activeTender,
        activeBid,
        activeBidder,
        verificationProgress,
        startAiVerification,
        submitOfficerDecision,
        metrics,
        currentUser,
        isAuthenticated,
        authChecked,
        dataLoaded,
        logout,
      }}
    >
      {children}
    </ProcurementContext.Provider>
  );
};

export const useProcurement = () => {
  const context = useContext(ProcurementContext);
  if (!context) {
    throw new Error('useProcurement must be used within a ProcurementProvider');
  }
  return context;
};
