import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useMatch } from 'react-router-dom';
import { AlertCircle, Bot, Loader2, Send, X } from 'lucide-react';
import { getBidView, listBidViews, type BidView } from '@shared/domain/selectors';
import type { Database } from '@shared/domain/types';
import { useApp } from '../../state/appContext';
import { api } from '../../state/api';
import { DECISION, EMD_INSTRUMENT } from '../../domain/labels';
import { bidPath, formatINR } from '../../lib/format';

interface Answer {
  text: string;
  links?: { label: string; to: string }[];
}
interface Message extends Answer {
  id: number;
  from: 'officer' | 'assistant';
  fallback?: boolean;
}

const findBidInText = (db: Database, text: string): BidView | undefined => {
  const lower = text.toLowerCase();
  const byId = /bid-\d{3}/i.exec(text)?.[0];
  if (byId) return getBidView(db, byId.toUpperCase());
  const bidder = db.bidders.find((b) => {
    const words = b.companyName.toLowerCase().split(/\s+/).slice(0, 2).join(' ');
    return lower.includes(words) || lower.includes(b.companyName.toLowerCase().split(/\s+/)[0] + ' ');
  });
  const bid = bidder && db.bids.find((b) => b.bidderId === bidder.id);
  return bid ? getBidView(db, bid.id) : undefined;
};

/** Rule-based answers assembled from the case data. No language model is involved. */
const answer = (db: Database, question: string, context?: BidView): Answer => {
  const q = question.toLowerCase();
  const v = findBidInText(db, question) ?? context;

  if (/^(hi|hello|hey)\b|help|what can you/.test(q)) {
    return {
      text: 'I can summarise a bid, explain its findings, EMD, documents and risk, and show the AI recommendation — using the verification data on record. Open a bid or name one (e.g. "BID-003" or "National Safety").',
    };
  }
  if (/all bids|compare|tender|every bid|overview/.test(q) || !v) {
    const views = listBidViews(db);
    if (!views.length) return { text: 'There are no bids in the dataset.' };
    return {
      text:
        (v ? '' : 'Open or name a bid for specifics. ') +
        'Bids on record: ' +
        views.map((x) => `${x.bid.id} ${x.bidder.companyName} — compliance ${x.bid.complianceScore}, ${x.bid.riskLevel.toLowerCase()} risk, ${x.counts.exceptions} exception(s)`).join('; ') +
        '.',
      links: views.map((x) => ({ label: x.bid.id, to: bidPath(x.bid.id) })),
    };
  }

  const name = `${v.bidder.companyName} (${v.bid.id})`;
  if (/emd|earnest|deposit|guarantee|exempt/.test(q)) {
    const e = v.emd;
    if (!e) return { text: `${name} has no EMD on record.` };
    const detail =
      e.instrument === 'MSME_EXEMPTION'
        ? `claimed an MSE exemption (Udyam ${e.reference}). ${e.note}`
        : `submitted ${formatINR(e.submittedAmount)} by ${EMD_INSTRUMENT[e.instrument].toLowerCase()} (${e.reference}) against ${formatINR(e.requiredAmount)} required. ${e.note}`;
    return { text: `${name} ${detail}`, links: [{ label: 'EMD details', to: bidPath(v.bid.id, 'emd') }] };
  }
  if (/missing|document/.test(q)) {
    const missing = v.checks.filter((c) => !c.document);
    return {
      text: missing.length
        ? `${name} submitted ${v.documents.length} of ${v.documentsRequired} documents. Not found: ${missing.map((m) => `${m.requirement.code} ${m.requirement.title}`).join('; ')}.`
        : `${name} submitted all ${v.documentsRequired} required documents.`,
      links: [{ label: 'Documents', to: bidPath(v.bid.id, 'documents') }],
    };
  }
  if (/risk/.test(q)) {
    const top = [...v.riskFactors].filter((r) => r.level !== 'LOW').map((r) => `${r.title} (${r.level.toLowerCase()}): ${r.description}`);
    return {
      text: `${name} is ${v.bid.riskLevel.toLowerCase()} risk (score ${v.bid.riskScore}/100). ${top.length ? `Main factors — ${top.join(' ')}` : 'No medium or high risk factors.'}`,
      links: [{ label: 'Risk assessment', to: bidPath(v.bid.id, 'risk') }],
    };
  }
  if (/recommend|suggest|should i|approve|reject|decision/.test(q)) {
    const rec = v.recommendation;
    return {
      text: rec
        ? `The AI recommendation for ${name} is "${DECISION[rec.suggestedDecision].label}": ${rec.summary} This is advisory — the decision is yours.`
        : `No recommendation has been generated for ${name}.`,
      links: [{ label: 'Recommendation & decision', to: bidPath(v.bid.id, 'decision') }],
    };
  }
  if (/why|finding|issue|discrepanc|problem|flag|review/.test(q)) {
    if (!v.findings.length) return { text: `${name} has no findings — every requirement is met or validly exempted.` };
    return {
      text: `${name} has ${v.findings.length} finding(s). ` + v.findings.slice(0, 3).map((f) => `${f.title}: required ${f.expected}; submitted ${f.submitted || '—'}${f.comparison ? ` (${f.comparison})` : ''}.`).join(' '),
      links: v.findings.slice(0, 3).map((f) => ({ label: f.id, to: `${bidPath(v.bid.id, 'evidence')}?finding=${f.id}` })),
    };
  }
  return {
    text: `${name}: compliance ${v.bid.complianceScore}/100, ${v.bid.riskLevel.toLowerCase()} risk, ${v.counts.met} of ${v.counts.total} requirements met. ${v.bid.primaryConcern}`,
    links: [
      { label: 'Findings', to: bidPath(v.bid.id, 'evidence') },
      { label: 'Decision', to: bidPath(v.bid.id, 'decision') },
    ],
  };
};

let seq = 0;

type Corner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
const CORNER_KEY = 'csap.assistantCorner';
const readCorner = (): Corner => {
  try {
    const c = localStorage.getItem(CORNER_KEY);
    return c === 'bottom-left' || c === 'top-right' || c === 'top-left' ? c : 'bottom-right';
  } catch {
    return 'bottom-right';
  }
};
const MARGIN = 20;

/**
 * The assistant's floating button. Drag it anywhere; on release it settles in the nearest of the
 * four corners (remembered in this browser). A click without dragging opens the assistant.
 */
const FloatingAssistantButton: React.FC<{ onOpen: () => void; onCorner: (c: Corner) => void }> = ({ onOpen, onCorner }) => {
  const [corner, setCorner] = useState<Corner>(readCorner);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ px: number; py: number; moved: boolean } | null>(null);
  const size = 56;

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { px: e.clientX, py: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s0 = start.current;
    if (!s0) return;
    if (!s0.moved && Math.hypot(e.clientX - s0.px, e.clientY - s0.py) < 6) return;
    s0.moved = true;
    setDrag({ x: e.clientX - size / 2, y: e.clientY - size / 2 });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s0 = start.current;
    start.current = null;
    if (!s0?.moved) {
      onOpen();
      return;
    }
    const next: Corner = `${e.clientY < window.innerHeight / 2 ? 'top' : 'bottom'}-${e.clientX < window.innerWidth / 2 ? 'left' : 'right'}`;
    setCorner(next);
    onCorner(next);
    try {
      localStorage.setItem(CORNER_KEY, next);
    } catch {
      /* not remembered */
    }
    setDrag(null);
  };

  const pos: React.CSSProperties = drag
    ? { left: drag.x, top: drag.y, transition: 'none' }
    : {
        [corner.startsWith('top') ? 'top' : 'bottom']: corner.startsWith('top') ? 80 : MARGIN,
        [corner.endsWith('left') ? 'left' : 'right']: corner.endsWith('left') && window.innerWidth >= 1024 ? 256 + MARGIN : MARGIN,
      };

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      aria-label="Open AI Assistant"
      title="AI Assistant: click to open, drag to move to another corner"
      style={pos}
      className={`fixed z-40 flex h-14 w-14 touch-none select-none items-center justify-center rounded-full bg-indigo-700 text-white shadow-lg transition-[top,left,right,bottom] duration-300 ease-out hover:bg-indigo-800 ${drag ? 'cursor-grabbing' : 'cursor-grab'}`}
    >
      <Bot className="h-6 w-6" />
      <span className="absolute -right-1 -top-1 rounded-full border border-indigo-200 bg-white px-1.5 py-0.5 text-[8px] font-bold leading-none text-indigo-700 shadow-xs">AI</span>
    </button>
  );
};

export const AssistantPanel: React.FC = () => {
  const { db, source, assistantOpen, setAssistantOpen } = useApp();
  const location = useLocation();
  const [corner, setCorner] = useState<Corner>(readCorner);
  const [thinking, setThinking] = useState(false);
  const match = useMatch('/bids/:bidId/*');
  const context = match?.params.bidId ? getBidView(db, match.params.bidId) : undefined;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, assistantOpen]);
  useEffect(() => {
    if (assistantOpen) inputRef.current?.focus();
  }, [assistantOpen]);

  const ask = async (text: string) => {
    const t = text.trim();
    if (!t || thinking) return;
    setMessages((m) => [...m, { id: ++seq, from: 'officer', text: t }]);
    setInput('');
    if (source !== 'api') {
      setMessages((m) => [...m, { id: ++seq, from: 'assistant', ...answer(db, t, context) }]);
      return;
    }
    setThinking(true);
    try {
      const history = messages.slice(-6).map((m) => ({ role: m.from === 'officer' ? 'user' : 'assistant', content: m.text }));
      const r = await api.assistant({ message: t, path: location.pathname, bidId: context?.bid.id, history });
      setMessages((m) => [...m, { id: ++seq, from: 'assistant', text: r.answer, links: r.actions.map((a) => ({ label: a.label, to: a.path })) }]);
    } catch {
      // NVIDIA unreachable: fall back to the rule-based answers so the officer is never left without help.
      setMessages((m) => [...m, { id: ++seq, from: 'assistant', ...answer(db, t, context), fallback: true }]);
    } finally {
      setThinking(false);
    }
  };

  const suggestions = context
    ? ['Why was this bid flagged?', 'Explain the EMD', 'Help me ask for clarification', "Check this bidder's PAN"]
    : ['Which bids need my decision?', 'Why is BID-003 high risk?', 'Where do I verify the audit trail?'];

  if (!assistantOpen) {
    return <FloatingAssistantButton onOpen={() => setAssistantOpen(true)} onCorner={setCorner} />;
  }

  return (
    <aside
      aria-label="AI assistant"
      className={`fixed inset-x-2 z-40 flex h-[70vh] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:h-[560px] sm:w-[380px] ${
        corner.startsWith('top') ? 'top-20 sm:top-20' : 'bottom-2 sm:bottom-5'
      } ${corner.endsWith('left') ? 'sm:left-5 lg:left-[272px]' : 'sm:right-5'}`}
    >
      <header className="flex items-center justify-between gap-2 bg-indigo-700 px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-2">
          <div className="shrink-0 rounded bg-white/15 p-1.5">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xs font-bold">CSAP Procurement Assistant</h2>
            <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-indigo-200">
              {context ? `Advisory · ${context.bid.id}` : 'Advisory · all bids'}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setAssistantOpen(false)} aria-label="Close assistant" className="shrink-0 rounded p-1 hover:bg-white/15">
          <X className="h-4 w-4" />
        </button>
      </header>
      <p className="flex items-start gap-1.5 border-b border-slate-100 px-3 pb-1.5 pt-2.5 text-[10px] text-slate-500">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
        {source === 'api'
          ? 'Answers by CSAP AI from the case data you can see, with links to where you can act. It never acts for you. Advisory only.'
          : 'Answers are assembled from the case data on record by fixed rules. Advisory only.'}
      </p>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-xs" aria-live="polite">
        {messages.length === 0 && <p className="text-slate-500">Ask about a bid's findings, EMD, documents, risk or the AI recommendation.</p>}
        {messages.map((m) => (
          <div key={m.id} className={m.from === 'officer' ? 'flex justify-end' : ''}>
            <div className={`max-w-[88%] rounded-md p-2.5 ${m.from === 'officer' ? 'bg-blue-600 font-medium text-white' : 'border border-slate-200 bg-slate-50 text-slate-800'}`}>
              <p className="leading-relaxed">{m.text}</p>
              {m.fallback && <p className="mt-1 text-[10px] text-amber-700">CSAP AI was unreachable; this answer comes from CSAP's built-in rules.</p>}
              {m.links && m.links.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {m.links.map((l) => (
                    <Link key={l.to + l.label} to={l.to} className="text-xs font-medium text-blue-700 hover:underline">
                      {l.label} →
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <p className="flex items-center gap-1.5 text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…</p>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-3 pt-2">
        {suggestions.map((s) => (
          <button key={s} type="button" onClick={() => void ask(s)} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10.5px] font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50">
            {s}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="flex gap-2 p-3"
      >
        <input
          ref={inputRef}
          aria-label="Ask a question"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this bid…"
          className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
        />
        <button type="submit" aria-label="Send" className="rounded bg-blue-600 px-3 text-white transition-colors hover:bg-blue-700">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </aside>
  );
};
