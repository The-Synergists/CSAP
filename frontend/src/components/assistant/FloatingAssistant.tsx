import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, AlertCircle, X, Loader2, Sparkles, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useProcurement } from '../../context/ProcurementContext';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  evidenceRef?: string;
  modelBadge?: string;
  reasoning?: string;
  isFallback?: boolean;
}

const quickQuestions = [
  'Why is ABC Industrial Solutions under manual review?',
  'What is the discrepancy found in National Safety Systems?',
  'Why was Prime Tech Solutions granted EMD exemption?',
  'How is the risk score calculated?',
];

/** Local fallback if AI Engine cannot be reached */
function getAssistantReply(rawText: string, activeTenderTitle?: string): { text: string; evidence?: string } {
  const lower = rawText.toLowerCase();

  if (lower.includes('abc industrial') || lower.includes('manual review')) {
    return {
      text:
        'ABC Industrial Solutions scored 92% overall compliance with LOW risk. However, under Clause 5.1(b), their Manufacturer Authorization Form (MAF) from Dräger Safety India Ltd expires on 30 October 2026. This provides only 55 days of validity from technical bid opening (05 Sep 2026), whereas the tender stipulates a mandatory 90-day validity window (required until 04 Dec 2026). It is flagged for officer clarification.',
      evidence: 'EVD-001 (OEM Authorization Deficit)',
    };
  }
  if (lower.includes('national safety') || lower.includes('discrepancy')) {
    return {
      text:
        'National Safety Systems exhibits HIGH risk (score: 68). Two primary critical deficits were detected: (1) EMD Shortfall: They submitted ₹1,50,000 via NEFT transaction TXN881294, which is ₹50,000 short of the mandatory ₹2,00,000 requirement. (2) Financial turnover averages ₹3.46 Cr against required ₹5.00 Cr benchmark. Under Clause 3.1, deficient EMD is liable for summary disqualification.',
      evidence: 'EVD-003 (EMD Shortfall)',
    };
  }
  if (lower.includes('bharat engineering') || lower.includes('bharat')) {
    return {
      text:
        'Bharat Engineering Works (BID-002) scored 87% overall compliance with MEDIUM risk (score: 36). All 12 required documents are verified, including a Canara Bank Guarantee (SFMS 760COV) covering the full ₹2,00,000 EMD, valid until 15 Mar 2027. The only scrutiny note is a borderline FY24 turnover of ₹4.90 Cr — the 3-year average of ₹5.02 Cr still clears the ₹5.00 Cr benchmark. Recommended action: APPROVE.',
      evidence: 'AUD-24 (Turnover Scrutiny)',
    };
  }
  if (lower.includes('prime tech') || lower.includes('msme') || lower.includes('exemption')) {
    return {
      text:
        'Prime Tech Solutions (BID-004) submitted Udyam Certificate UDYAM-TN-02-0089142 as a registered Micro/Small Enterprise (MSE) under NIC Manufacturing codes. As per Public Procurement Policy for MSEs Order 2012, they are legally exempt from depositing EMD. Their 3-year turnover is ₹8.40 Cr, and local content is 85%.',
      evidence: 'EVD-004 (MSE Exemption Certificate)',
    };
  }
  if (lower.includes('risk') && (lower.includes('score') || lower.includes('calculat') || lower.includes('model'))) {
    return {
      text:
        "Risk scores come from a multi-factor model spanning financial risk (turnover trend, EMD adequacy), statutory risk (GST/PAN/Udyam registry status), and document risk (OCR confidence, clause-level discrepancies). Scores below 25 are LOW, 25–50 MEDIUM, 50–75 HIGH, and above 75 CRITICAL — each factor links to its supporting evidence on the bidder's Risk Analysis tab.",
    };
  }
  if (lower.includes('emd')) {
    return {
      text:
        'The standard EMD requirement is ₹2,00,000, payable via NEFT/RTGS bank transfer or an unconditional Bank Guarantee from a scheduled bank valid through the bid validity period. Registered Micro/Small Enterprises (MSEs) holding a valid Udyam certificate are exempt under the Public Procurement Policy for MSEs Order, 2012.',
      evidence: 'Rule 170 (GFR 2017)',
    };
  }

  return {
    text: `Based on current tender data for ${activeTenderTitle || 'this tender'}, 4 bidders are evaluated with scrutiny active across statutory registries, EMD instruments, and technical criteria. Officer sign-off is pending.`,
  };
}

export const FloatingAssistant: React.FC = () => {
  const { activeTender, bids, activeBid } = useProcurement();
  const [open, setOpen] = useState(false);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [engineStatus, setEngineStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [activeModel, setActiveModel] = useState<string>('Reasoning Engine');
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Record<string, boolean>>({});

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'MSG-1',
      sender: 'assistant',
      text: activeTender
        ? `Good day, Officer. I am your CSAP Procurement Advisory Assistant, connected to the live Reasoning Model. I evaluate eligibility benchmarks, clause compliance, and statutory reconciliation for ${activeTender.id}. How may I assist your scrutiny today?`
        : 'Good day, Officer. I am your CSAP Procurement Advisory Assistant, connected to the live Reasoning Model. Select an active tender case from the Tenders workspace and I can answer inquiries regarding its eligibility benchmarks, bidder discrepancy findings, EMD reconciliation data, and clause-level compliance scores.',
      timestamp: '10:00 AM',
      modelBadge: 'Reasoning Engine',
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const aiEngineUrl = import.meta.env.VITE_AI_ENGINE_URL || 'http://localhost:8000';

  // Check health and active model of AI Engine
  useEffect(() => {
    let isMounted = true;
    const checkEngine = async () => {
      try {
        const res = await fetch(`${aiEngineUrl}/api/v1/health`, { method: 'GET' });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setEngineStatus('online');
            const cleanModel = data.reasoning_model
              ? data.reasoning_model.replace('nvidia/', '').replace('meta/', '')
              : 'Nemotron';
            setActiveModel(cleanModel);
          }
        } else {
          if (isMounted) setEngineStatus('offline');
        }
      } catch {
        if (isMounted) setEngineStatus('offline');
      }
    };
    checkEngine();
    return () => {
      isMounted = false;
    };
  }, [aiEngineUrl, open]);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, open, isThinking]);

  const toggleReasoning = (msgId: string) => {
    setExpandedReasoningIds((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputPrompt;
    if (!text.trim() || isThinking) return;

    const userMsg: ChatMessage = {
      id: `USER-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    setIsThinking(true);

    try {
      const payload = {
        question: text,
        tenderContext: activeTender
          ? {
              id: activeTender.id,
              title: activeTender.title,
              category: activeTender.category,
              estimatedValue: activeTender.estimatedValue,
              emdAmountFormatted: activeTender.emdAmountFormatted,
              requirements: activeTender.requirements,
            }
          : null,
        bidderContext: activeBid
          ? {
              id: activeBid.id,
              companyName: activeBid.companyName,
              gstin: activeBid.gstin,
              pan: activeBid.pan,
              udyamNumber: activeBid.udyamNumber,
              overallComplianceScore: activeBid.overallComplianceScore,
              riskLevel: activeBid.riskLevel,
              riskScore: activeBid.riskScore,
              emd: activeBid.emd,
            }
          : null,
        biddersSummary: bids.map((b) => ({
          id: b.id,
          companyName: b.companyName,
          complianceScore: b.overallComplianceScore,
          riskLevel: b.riskLevel,
          riskScore: b.riskScore,
          status: b.status,
        })),
        chatHistory: messages.slice(-6).map((m) => ({
          sender: m.sender,
          text: m.text,
        })),
      };

      const response = await fetch(`${aiEngineUrl}/api/v1/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`AI Engine HTTP ${response.status}`);
      }

      const data = await response.json();
      setEngineStatus('online');

      const modelName = data.model
        ? data.model.replace('nvidia/', '').replace('meta/', '')
        : 'Reasoning Model';

      const aiMsg: ChatMessage = {
        id: `AI-${Date.now()}`,
        sender: 'assistant',
        text: data.answer || 'Analysis recorded in scrutiny ledger.',
        timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        evidenceRef: data.evidence || undefined,
        modelBadge: data.is_fallback ? 'Rule Engine (Fallback)' : modelName,
        reasoning: data.reasoning || undefined,
        isFallback: data.is_fallback,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.warn('[FloatingAssistant] Calling AI Engine failed, using deterministic audit assistant:', err);
      setEngineStatus('offline');
      const fallback = getAssistantReply(text, activeTender?.title);
      const fallbackMsg: ChatMessage = {
        id: `AI-${Date.now()}`,
        sender: 'assistant',
        text: fallback.text,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        evidenceRef: fallback.evidence,
        modelBadge: 'Offline Audit Rules',
        isFallback: true,
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <div className="w-[430px] max-w-[92vw] h-[600px] max-h-[80vh] bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-700 via-indigo-800 to-slate-900 text-white px-4 py-3 flex items-center justify-between shrink-0 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1.5 bg-white/15 rounded-lg shrink-0">
                <Bot className="w-4 h-4 text-indigo-200" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate flex items-center gap-1.5">
                  CSAP Reasoning Assistant
                  <Sparkles className="w-3 h-3 text-amber-300 shrink-0" />
                </div>
                <div className="text-[10px] text-indigo-200 flex items-center gap-1 font-mono">
                  <span>{activeModel}</span>
                  <span>•</span>
                  {engineStatus === 'online' ? (
                    <span className="text-emerald-300 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                      Live AI Online
                    </span>
                  ) : engineStatus === 'checking' ? (
                    <span className="text-amber-200 font-semibold">Connecting...</span>
                  ) : (
                    <span className="text-rose-300 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" />
                      Offline Mode (Rules)
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="p-1 rounded hover:bg-white/15 shrink-0 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Engine Status Banner */}
          <div
            className={`px-3 py-1.5 text-[10px] flex items-center justify-between border-b shrink-0 ${
              engineStatus === 'online'
                ? 'bg-emerald-50/80 text-emerald-800 border-emerald-100'
                : 'bg-amber-50/80 text-amber-800 border-amber-100'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              {engineStatus === 'online' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="truncate">Active AI Reasoning Model ({activeModel}) connected</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="truncate">AI Engine offline on port 8000; using local audit rules</span>
                </>
              )}
            </div>
          </div>

          {/* Quick questions */}
          <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-slate-100 shrink-0 bg-slate-50/50">
            {quickQuestions.map((q) => (
              <button
                key={q}
                type="button"
                disabled={isThinking}
                onClick={() => handleSendMessage(q)}
                className="text-[10.5px] bg-white hover:bg-indigo-50 hover:border-indigo-300 border border-slate-200 text-slate-700 px-2 py-1 rounded-full transition-colors font-medium disabled:opacity-50 text-left"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-2 text-xs ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.sender === 'assistant' && (
                  <div className="w-6 h-6 rounded bg-indigo-700 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  className={`p-2.5 rounded-lg max-w-[85%] ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white font-medium shadow-xs'
                      : 'bg-slate-50 border border-slate-200 text-slate-800 shadow-xs'
                  }`}
                >
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                  {/* Collapsible Reasoning Chain (Chain of Thought) */}
                  {msg.reasoning && (
                    <div className="mt-2 border border-indigo-200/80 rounded-md bg-indigo-50/40 overflow-hidden text-[10px]">
                      <button
                        type="button"
                        onClick={() => toggleReasoning(msg.id)}
                        className="w-full px-2 py-1 flex items-center justify-between text-indigo-800 font-semibold hover:bg-indigo-100/50 transition-colors"
                      >
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-indigo-600" />
                          View AI Model Reasoning Process
                        </span>
                        {expandedReasoningIds[msg.id] ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                      </button>
                      {expandedReasoningIds[msg.id] && (
                        <div className="p-2 border-t border-indigo-100 bg-white font-mono text-[9.5px] text-slate-700 max-h-40 overflow-y-auto whitespace-pre-wrap leading-tight">
                          {msg.reasoning}
                        </div>
                      )}
                    </div>
                  )}

                  {msg.evidenceRef && (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-200 text-[10px] font-mono text-indigo-700 font-semibold flex items-center gap-1">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200">
                        Evidence: {msg.evidenceRef}
                      </span>
                    </div>
                  )}

                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[9px] opacity-70">
                    <span>{msg.timestamp}</span>
                    {msg.modelBadge && (
                      <span
                        className={`font-mono text-[8px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                          msg.isFallback
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {msg.modelBadge}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="flex gap-2 text-xs justify-start">
                <div className="w-6 h-6 rounded bg-indigo-700 text-white flex items-center justify-center shrink-0 mt-0.5 animate-pulse">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 flex items-center gap-2 shadow-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  <span className="text-[11px] font-medium text-slate-700">
                    Reasoning model evaluating tender evidence...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-2 border-t border-slate-200 flex items-center gap-1.5 shrink-0 bg-white">
            <input
              type="text"
              placeholder={isThinking ? 'Reasoning model is evaluating...' : 'Ask about a bidder, clause, or EMD status...'}
              value={inputPrompt}
              disabled={isThinking}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendMessage();
              }}
              className="flex-1 px-2.5 py-1.5 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-600 focus:bg-white disabled:opacity-50"
            />
            <button
              type="button"
              disabled={isThinking || !inputPrompt.trim()}
              onClick={() => handleSendMessage()}
              aria-label="Send"
              className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg transition-colors shrink-0 shadow-xs"
            >
              {isThinking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-full shadow-lg hover:shadow-xl transition-all font-semibold text-xs border border-white/20"
      >
        <Bot className="w-4 h-4 text-indigo-200" />
        <span>Procurement AI</span>
        <span
          className={`w-2 h-2 rounded-full ${
            engineStatus === 'online' ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
          }`}
        />
      </button>
    </div>
  );
};
