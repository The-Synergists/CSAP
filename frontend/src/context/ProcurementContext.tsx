import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type {
  Tender,
  Bid,
  Bidder,
  OfficerDecisionRecord,
  DashboardMetrics,
} from '../types';

import {
  findTenderByIdOrSlug,
  findBidById,
} from '../types';

import { supabase } from '../lib/supabaseClient';

import {
  fetchTenders,
  fetchBids,
} from '../lib/procurementData';

import {
  mockTenders,
  mockBids,
} from '../data/mockData';


/* =========================================================
   TYPES
========================================================= */

interface VerificationStep {
  name: string;
  status:
    | 'pending'
    | 'in-progress'
    | 'completed'
    | 'flagged';
}

interface VerificationProgressState {
  isRunning: boolean;
  currentStep: number;
  steps: VerificationStep[];
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
  activeBidder: Bidder | undefined;

  verificationProgress: VerificationProgressState;

  startAiVerification: (bidId: string) => Promise<void>;

  submitOfficerDecision: (
    decision: OfficerDecisionRecord
  ) => Promise<void>;

  metrics: DashboardMetrics;

  currentUser: {
    name: string;
    designation: string;
    organization: string;
    badgeId: string;
    email: string;
  };

  isAuthenticated: boolean;
  authChecked: boolean;
  dataLoaded: boolean;

  logout: () => void;
}


/* =========================================================
   VERIFICATION STEPS
========================================================= */

const initialVerificationSteps: VerificationStep[] = [
  {
    name: 'Documents OCR Extraction',
    status: 'pending',
  },
  {
    name: 'Government Registry Cross-Check',
    status: 'pending',
  },
  {
    name: 'EMD & Payment Reconciliation',
    status: 'pending',
  },
  {
    name: 'Tender Rule & Eligibility Evaluation',
    status: 'pending',
  },
  {
    name: 'Discrepancy Detection',
    status: 'pending',
  },
  {
    name: 'Compliance & Risk Calculation',
    status: 'pending',
  },
];


/* =========================================================
   DEFAULT USER
========================================================= */

const EMPTY_USER = {
  name: '',
  designation: '',
  organization: '',
  badgeId: '',
  email: '',
};


/* =========================================================
   CONTEXT
========================================================= */

const ProcurementContext =
  createContext<ProcurementContextType | undefined>(
    undefined
  );


/* =========================================================
   PROVIDER
========================================================= */

export const ProcurementProvider: React.FC<{
  children: ReactNode;
}> = ({ children }) => {

  /* -------------------------------------------------------
     DATA
  ------------------------------------------------------- */

  const [tenders, setTenders] = useState<Tender[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);

  /* -------------------------------------------------------
     ACTIVE ITEMS
  ------------------------------------------------------- */

  const [activeTenderId, setActiveTenderId] =
    useState('');

  const [activeBidId, setInternalActiveBidId] =
    useState('');

  /* -------------------------------------------------------
     AUTH
  ------------------------------------------------------- */

  const [isAuthenticated, setIsAuthenticated] =
    useState(false);

  const [authChecked, setAuthChecked] =
    useState(false);

  const [dataLoaded, setDataLoaded] =
    useState(false);

  const [userId, setUserId] =
    useState<string | null>(null);

  const [currentUser, setCurrentUser] =
    useState(EMPTY_USER);

  /* -------------------------------------------------------
     AI VERIFICATION
  ------------------------------------------------------- */

  const [verificationProgress, setVerificationProgress] =
    useState<VerificationProgressState>({
      isRunning: false,
      currentStep: 0,
      steps: initialVerificationSteps,
      completed: true,
    });

  const verificationLockRef =
    useRef(false);


  /* =======================================================
     AUTHENTICATION
  ======================================================= */

  useEffect(() => {

    const syncDemoAuth = () => {

      const loggedIn =
        sessionStorage.getItem('csap_logged_in') === 'true';

      setIsAuthenticated(loggedIn);
      setAuthChecked(true);

      if (loggedIn) {

        setUserId('demo-procurement-officer');

        setCurrentUser({
          name: 'Procurement Officer',
          designation: 'Procurement Officer',
          organization:
            'Chennai Petroleum Corporation Limited',
          badgeId: 'CPCL-PROC-001',
          email: 'officer@cpcl.co.in',
        });

      } else {

        setUserId(null);
        setDataLoaded(false);
        setTenders([]);
        setBids([]);
        setCurrentUser(EMPTY_USER);
      }
    };

    syncDemoAuth();

    window.addEventListener(
      'csap-auth-change',
      syncDemoAuth
    );

    return () => {
      window.removeEventListener(
        'csap-auth-change',
        syncDemoAuth
      );
    };

  }, []);


  /* =======================================================
     LOAD PROCUREMENT DATA
  ======================================================= */

  const reloadData = useCallback(async () => {

    try {

      const [tenderList, bidList] =
        await Promise.all([
          fetchTenders(),
          fetchBids(),
        ]);

      setTenders(
        tenderList.length
          ? tenderList
          : mockTenders
      );

      setBids(
        bidList.length
          ? bidList
          : mockBids
      );

    } catch (error) {

      console.warn(
        'Live procurement data unavailable. Using prototype data.',
        error
      );

      setTenders(mockTenders);
      setBids(mockBids);

    } finally {

      setDataLoaded(true);
    }

  }, []);


  useEffect(() => {

    if (!isAuthenticated) {
      return;
    }

    reloadData().catch((error) => {
      console.error(
        'Failed to load procurement data:',
        error
      );
    });

  }, [isAuthenticated, reloadData]);


  /* =======================================================
     ACTIVE TENDER / BID
  ======================================================= */

  const activeTender = activeTenderId
    ? findTenderByIdOrSlug(
        tenders,
        activeTenderId
      )
    : undefined;

  const activeBid = activeBidId
    ? findBidById(
        bids,
        activeBidId
      )
    : undefined;

  /*
   * In this prototype, bidder workspace is connected
   * to the selected bid.
   */
  const activeBidder =
    activeBid as unknown as Bidder | undefined;


  /* =======================================================
     SELECT BID
  ======================================================= */

  const setActiveBidId = (id: string) => {

    setInternalActiveBidId(id);

    const found =
      findBidById(bids, id);

    if (found?.tenderId) {
      setActiveTenderId(found.tenderId);
    }
  };


  const setActiveBidderId =
    (id: string) => {
      setActiveBidId(id);
    };


  const selectBid = (
    bidId: string,
    tenderId?: string
  ) => {

    setInternalActiveBidId(bidId);

    if (tenderId) {

      setActiveTenderId(tenderId);
      return;
    }

    const found =
      findBidById(
        bids,
        bidId
      );

    if (found?.tenderId) {
      setActiveTenderId(
        found.tenderId
      );
    }
  };


  /* =======================================================
     SELECT TENDER
  ======================================================= */

  const selectTender = (
    tenderId: string
  ) => {

    setActiveTenderId(tenderId);
  };


  /* =======================================================
     LOGOUT
  ======================================================= */

  const logout = () => {

    sessionStorage.removeItem(
      'csap_logged_in'
    );

    setIsAuthenticated(false);
    setAuthChecked(true);

    setDataLoaded(false);

    setTenders([]);
    setBids([]);

    setActiveTenderId('');
    setInternalActiveBidId('');

    setCurrentUser(EMPTY_USER);
    setUserId(null);

    window.dispatchEvent(
      new Event('csap-auth-change')
    );
  };


  /* =======================================================
     AI VERIFICATION
  ======================================================= */

  const startAiVerification = async (
    targetBidId: string
  ) => {

    if (verificationLockRef.current) {
      return;
    }

    verificationLockRef.current = true;

    try {

      await runAiVerification(
        targetBidId
      );

    } finally {

      verificationLockRef.current = false;
    }
  };


  const runAiVerification = async (
    targetBidId: string
  ) => {

    const bid =
      findBidById(
        bids,
        targetBidId
      );


    /* -----------------------------------------------------
       Create verification run
    ----------------------------------------------------- */

    let runId: string | null = null;

    if (userId) {

      const {
        data: run,
        error: runErr,
      } = await supabase
        .from('ai_verification_runs')
        .insert({
          bid_id: targetBidId,
          initiated_by: userId,
          status: 'RUNNING',
          steps: initialVerificationSteps,
        })
        .select('id')
        .single();

      if (runErr) {
        console.warn(
          'Could not create AI verification run:',
          runErr
        );
      } else if (run) {
        runId = run.id;
      }
    }


    /* -----------------------------------------------------
       Start UI progress
    ----------------------------------------------------- */

    setVerificationProgress({
      isRunning: true,
      currentStep: 0,
      steps: initialVerificationSteps.map(
        (step, index) => ({
          ...step,
          status:
            index === 0
              ? 'in-progress'
              : 'pending',
        })
      ),
      completed: false,
    });


    /* -----------------------------------------------------
       Run each step
    ----------------------------------------------------- */

    let finalSteps: VerificationStep[] =
      initialVerificationSteps.map(
        (step) => ({
          ...step,
          status: 'pending',
        })
      );


    for (
      let stepIndex = 0;
      stepIndex < initialVerificationSteps.length;
      stepIndex++
    ) {

      await new Promise<void>(
        (resolve) =>
          setTimeout(resolve, 500)
      );


      /* ---------------------------------------------------
         Government registry simulation
      --------------------------------------------------- */

      if (
        stepIndex === 1 &&
        bid &&
        runId
      ) {

        const now =
          new Date().toISOString();

        const makeLog = (
          portal: string,
          checkType: string,
          field: string,
          value: string
        ) => ({
          ai_verification_run_id:
            runId,

          portal_code:
            portal,

          check_type:
            checkType,

          requested_at:
            now,

          responded_at:
            now,

          request_payload: {
            [field]: value,
          },

          response_payload: {
            status: 'VERIFIED',
            source:
              `${portal} (simulated)`,
          },

          result_status:
            'VERIFIED',
        });


        try {

          await supabase
            .from(
              'gov_portal_verification_log'
            )
            .insert([
              makeLog(
                'GSTN',
                'GSTIN_STATUS',
                'gstin',
                bid.gstin
              ),

              makeLog(
                'UDYAM',
                'UDYAM_STATUS',
                'udyam_number',
                bid.udyamNumber
              ),

              makeLog(
                'EPFO',
                'EPFO_ECR',
                'gstin',
                bid.gstin
              ),

              makeLog(
                'ESIC',
                'ESIC_ECR',
                'gstin',
                bid.gstin
              ),

              makeLog(
                'INCOME_TAX',
                'ITR_FILING_STATUS',
                'pan',
                bid.pan
              ),
            ]);

        } catch (error) {

          console.warn(
            'Government verification logging failed:',
            error
          );
        }
      }


      /* ---------------------------------------------------
         Update progress
      --------------------------------------------------- */

      const updatedSteps: VerificationStep[] =
        initialVerificationSteps.map(
          (item, index) => {

            if (index < stepIndex) {

              return {
                ...item,
                status: 'completed',
              };
            }

            if (index === stepIndex) {

              return {
                ...item,
                status:
                  stepIndex ===
                  initialVerificationSteps.length - 1
                    ? 'completed'
                    : 'in-progress',
              };
            }

            return {
              ...item,
              status: 'pending',
            };
          }
        );


      finalSteps = updatedSteps;


      setVerificationProgress({
        isRunning: true,
        currentStep: stepIndex + 1,
        steps: updatedSteps,
        completed:
          stepIndex ===
          initialVerificationSteps.length - 1,
      });
    }


    /* -----------------------------------------------------
       Complete Supabase run
    ----------------------------------------------------- */

    if (runId) {

      try {

        await supabase
          .from('ai_verification_runs')
          .update({
            status: 'COMPLETED',
            completed_at:
              new Date().toISOString(),
            steps: finalSteps,
          })
          .eq('id', runId);

      } catch (error) {

        console.warn(
          'Could not update verification run:',
          error
        );
      }
    }


    /* -----------------------------------------------------
       Audit event
    ----------------------------------------------------- */

    try {

      await supabase
        .from('audit_events')
        .insert({
          bid_id: targetBidId,
          tender_id: bid?.tenderId ?? null,
          actor_profile_id: null,
          actor_display_name:
            'CSAP Verification Engine',
          actor_role:
            'Automated Service',
          action_type:
            'SYSTEM_AI',
          summary:
            'AI verification pipeline completed',
          details:
            'Government registry and compliance checks completed.',
        });

    } catch (error) {

      console.warn(
        'Audit event could not be created:',
        error
      );
    }


    /* -----------------------------------------------------
       Final UI state
    ----------------------------------------------------- */

    setVerificationProgress({
      isRunning: false,
      currentStep:
        initialVerificationSteps.length,
      steps: finalSteps,
      completed: true,
    });


    await reloadData();
  };


  /* =======================================================
     OFFICER DECISION
  ======================================================= */

  const submitOfficerDecision = async (
    decision: OfficerDecisionRecord
  ) => {

    const targetId =
      decision.bidId ||
      decision.bidderId;

    const { error } =
      await supabase.rpc(
        'submit_officer_decision',
        {
          p_bid_id: targetId,
          p_decision:
            decision.decision,
          p_remarks:
            decision.remarks,
          p_justification_reason:
            decision.justificationReason,
          p_conditions_applied:
            decision.conditionsApplied ??
            null,
        }
      );

    if (error) {
      throw error;
    }

    await reloadData();
  };


  /* =======================================================
     DASHBOARD METRICS
  ======================================================= */

  const metrics: DashboardMetrics = {

    activeTenders:
      tenders.filter(
        (tender) =>
          tender.status !== 'AWARDED' &&
          tender.status !== 'CANCELLED'
      ).length,

    bidsUnderVerification:
      bids.length,

    fullyCompliant:
      bids.filter(
        (bid) =>
          bid.overallComplianceScore >= 95
      ).length,

    pendingReviews:
      bids.filter(
        (bid) =>
          !bid.officerDecision
      ).length,

    highRisk:
      bids.filter(
        (bid) =>
          bid.riskLevel === 'HIGH' ||
          bid.riskLevel === 'CRITICAL'
      ).length,

    averageCompliance:
      Math.round(
        bids.reduce(
          (sum, bid) =>
            sum +
            bid.overallComplianceScore,
          0
        ) /
          (bids.length || 1)
      ),
  };


  /* =======================================================
     PROVIDER
  ======================================================= */

  return (
    <ProcurementContext.Provider
      value={{
        tenders,
        bids,

        /*
         * The existing prototype treats the selected bid
         * as the bidder workspace record.
         */
        bidders:
          bids as unknown as Bidder[],

        activeTenderId,
        activeBidId,
        activeBidderId:
          activeBidId,

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


/* =========================================================
   HOOK
========================================================= */

export const useProcurement = () => {

  const context =
    useContext(
      ProcurementContext
    );

  if (!context) {

    throw new Error(
      'useProcurement must be used within a ProcurementProvider'
    );
  }

  return context;
};