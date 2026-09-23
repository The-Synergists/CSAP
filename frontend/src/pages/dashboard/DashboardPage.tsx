import React from 'react';

import {
  FileText,
  Users,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Clock3,
  Search,
} from 'lucide-react';

import { useNavigate } from 'react-router-dom';

import { useProcurement } from '../../context/ProcurementContext';

import { StatusBadge } from '../../components/ui/StatusBadge';

import { RiskBadge } from '../../components/ui/RiskBadge';

export const DashboardPage: React.FC =
  () => {
    const navigate =
      useNavigate();

    const {
      tenders,
      bids,
      metrics,
      setActiveTenderId,
      selectBid,
    } = useProcurement();

    const pendingBids =
      bids.filter(
        (bid) =>
          bid.status ===
            'UNDER_REVIEW' ||
          bid.status ===
            'CLARIFICATION_SEEKED'
      );

    const riskBids =
      bids.filter(
        (bid) =>
          bid.riskLevel === 'HIGH' ||
          bid.riskLevel === 'CRITICAL'
      );

    const openTenders =
      tenders.filter(
        (tender) =>
          tender.status !==
            'AWARDED' &&
          tender.status !==
            'CANCELLED'
      );

    const openTender = (
      tenderId: string
    ) => {
      setActiveTenderId(
        tenderId
      );

      navigate(
        `/tenders/${tenderId}`
      );
    };

    const openBid = (
      bidId: string,
      tenderId: string
    ) => {
      selectBid(
        bidId,
        tenderId
      );

      navigate(
        `/bids/${bidId}`
      );
    };

    return (
      <div className="space-y-6">

        {/* Header */}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">

          <div>
            <p className="text-xs font-medium text-slate-500">
              Procurement workspace
            </p>

            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              Officer Dashboard
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Cases and bidder checks that need procurement action.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              navigate('/tenders')
            }
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <FileText className="h-4 w-4" />

            Open tenders
          </button>

        </div>

        {/* Summary */}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">

          <Summary
            label="Open tenders"
            value={
              metrics.activeTenders
            }
            icon={
              <FileText className="h-4 w-4" />
            }
          />

          <Summary
            label="Bids to review"
            value={
              metrics.pendingReviews
            }
            icon={
              <Users className="h-4 w-4" />
            }
          />

          <Summary
            label="High-risk bids"
            value={
              metrics.highRisk
            }
            icon={
              <AlertTriangle className="h-4 w-4" />
            }
            danger={
              metrics.highRisk > 0
            }
          />

          <Summary
            label="Compliance ≥95%"
            value={
              metrics.fullyCompliant
            }
            icon={
              <CheckCircle2 className="h-4 w-4" />
            }
          />

          <Summary
            label="Average compliance"
            value={`${metrics.averageCompliance}%`}
            icon={
              <CheckCircle2 className="h-4 w-4" />
            }
          />

        </div>

        {/* Main */}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">

          {/* Tenders */}

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">

            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">

              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Tenders under review
                </h2>

                <p className="mt-0.5 text-xs text-slate-500">
                  Current procurement cases
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  navigate('/tenders')
                }
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                View all
              </button>

            </div>

            {openTenders.length ===
            0 ? (
              <Empty text="No open tenders." />
            ) : (
              <div className="divide-y divide-slate-100">

                {openTenders
                  .slice(0, 6)
                  .map(
                    (tender) => (
                      <button
                        key={
                          tender.id
                        }
                        type="button"
                        onClick={() =>
                          openTender(
                            tender.id
                          )
                        }
                        className="w-full px-5 py-4 text-left hover:bg-slate-50"
                      >

                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

                          <div className="min-w-0">

                            <div className="flex flex-wrap items-center gap-2">

                              <span className="font-mono text-xs font-semibold text-blue-700">
                                {
                                  tender.id
                                }
                              </span>

                              <StatusBadge
                                status={
                                  tender.status
                                }
                                size="sm"
                              />

                            </div>

                            <p className="mt-1 text-sm font-medium text-slate-900">
                              {
                                tender.title
                              }
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              {
                                tender.division
                              }
                            </p>

                          </div>

                          <div className="flex items-center gap-5 text-xs">

                            <div>
                              <p className="text-slate-400">
                                Bids
                              </p>

                              <p className="mt-0.5 font-semibold text-slate-800">
                                {
                                  tender.bidsReceivedCount
                                }
                              </p>
                            </div>

                            <div>
                              <p className="text-slate-400">
                                Compliance
                              </p>

                              <p className="mt-0.5 font-semibold text-slate-800">
                                {
                                  tender.averageCompliance
                                }%
                              </p>
                            </div>

                            <ArrowRight className="h-4 w-4 text-slate-400" />

                          </div>

                        </div>

                      </button>
                    )
                  )}

              </div>
            )}

          </section>

          {/* Work Queue */}

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">

            <div className="border-b border-slate-200 px-5 py-4">

              <h2 className="text-sm font-semibold text-slate-900">
                Officer work queue
              </h2>

              <p className="mt-0.5 text-xs text-slate-500">
                Start with items needing a decision
              </p>

            </div>

            <div className="divide-y divide-slate-100">

              <QueueRow
                icon={
                  <Clock3 className="h-4 w-4" />
                }
                title="Pending bid reviews"
                value={
                  pendingBids.length
                }
                onClick={() =>
                  navigate(
                    '/reviews'
                  )
                }
              />

              <QueueRow
                icon={
                  <AlertTriangle className="h-4 w-4" />
                }
                title="Risk cases"
                value={
                  riskBids.length
                }
                onClick={() =>
                  navigate(
                    '/alerts'
                  )
                }
              />

              <QueueRow
                icon={
                  <Search className="h-4 w-4" />
                }
                title="All bidder submissions"
                value={
                  bids.length
                }
                onClick={() =>
                  navigate(
                    '/bidders'
                  )
                }
              />

            </div>

            <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">

              <p className="text-xs font-medium text-slate-700">
                Quick access
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">

                <button
                  onClick={() =>
                    navigate(
                      '/reviews'
                    )
                  }
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  My reviews
                </button>

                <button
                  onClick={() =>
                    navigate(
                      '/alerts'
                    )
                  }
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Alerts
                </button>

              </div>

            </div>

          </section>

        </div>

        {/* Bids */}

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">

          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">

            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Bids needing attention
              </h2>

              <p className="mt-0.5 text-xs text-slate-500">
                Review the bidder record before taking an officer decision.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate(
                  '/bidders'
                )
              }
              className="text-xs font-medium text-blue-700 hover:underline"
            >
              View bidders
            </button>

          </div>

          {pendingBids.length ===
          0 ? (
            <Empty text="No pending bidder reviews." />
          ) : (
            <div className="divide-y divide-slate-100">

              {pendingBids
                .slice(0, 5)
                .map((bid) => (
                  <button
                    key={
                      bid.id
                    }
                    type="button"
                    onClick={() =>
                      openBid(
                        bid.id,
                        bid.tenderId
                      )
                    }
                    className="w-full px-5 py-3.5 text-left hover:bg-slate-50"
                  >

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

                      <div className="min-w-0">

                        <p className="truncate text-sm font-medium text-slate-900">
                          {
                            bid.companyName
                          }
                        </p>

                        <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                          {
                            bid.id
                          }{' '}
                          ·{' '}
                          {
                            bid.tenderId
                          }
                        </p>

                      </div>

                      <div className="flex items-center gap-3">

                        <span className="text-xs font-semibold text-slate-700">
                          {
                            bid.overallComplianceScore
                          }%
                        </span>

                        <RiskBadge
                          level={
                            bid.riskLevel
                          }
                          score={
                            bid.riskScore
                          }
                        />

                        <ArrowRight className="h-4 w-4 text-slate-400" />

                      </div>

                    </div>

                  </button>
                ))}

            </div>
          )}

        </section>

      </div>
    );
  };

const Summary: React.FC<{
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  danger?: boolean;
}> = ({
  label,
  value,
  icon,
  danger,
}) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4">

    <div className="flex items-center justify-between text-slate-400">

      <span className="text-xs">
        {label}
      </span>

      <span
        className={
          danger
            ? 'text-rose-600'
            : 'text-slate-400'
        }
      >
        {icon}
      </span>

    </div>

    <p
      className={`mt-2 text-2xl font-semibold ${
        danger
          ? 'text-rose-700'
          : 'text-slate-900'
      }`}
    >
      {value}
    </p>

  </div>
);

const QueueRow: React.FC<{
  icon: React.ReactNode;
  title: string;
  value: number;
  onClick: () => void;
}> = ({
  icon,
  title,
  value,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50"
  >

    <span className="text-slate-400">
      {icon}
    </span>

    <span className="flex-1 text-xs font-medium text-slate-700">
      {title}
    </span>

    <span className="text-sm font-semibold text-slate-900">
      {value}
    </span>

    <ArrowRight className="h-3.5 w-3.5 text-slate-400" />

  </button>
);

const Empty: React.FC<{
  text: string;
}> = ({ text }) => (
  <div className="px-5 py-10 text-center text-xs text-slate-500">
    {text}
  </div>
);