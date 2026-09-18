import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, AlertCircle, X } from 'lucide-react';
import { useProcurement } from '../../context/ProcurementContext';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  evidenceRef?: string;
}

const quickQuestions = [
  'Why is ABC Industrial Solutions under manual review?',
  'What is the discrepancy found in National Safety Systems?',
  'Why was Prime Tech Solutions granted EMD exemption?',
  'How is the risk score calculated?',
];

/** All replies are canned pattern-matches over the same mock/OCR data shown in each bid's
 *  workspace — there is no live model behind this widget yet. Add new branches here as more
 *  common officer questions come up. */
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
    };
  }
  if (lower.includes('oem') || lower.includes('clause 5.1')) {
    return {
      text:
        'Clause 5.1(b) requires all non-manufacturing bidders to provide an OEM Authorization Form directly from the manufacturer guaranteeing back-to-back replacement warranty and service support, valid for at least 90 calendar days from the date of technical bid opening.',
    };
  }
  if (lower.includes('risk') && (lower.includes('score') || lower.includes('calculat') || lower.includes('model'))) {
    return {
      text:
        "Risk scores come from a multi-factor model spanning financial risk (turnover trend, EMD adequacy), statutory risk (GST/PAN/Udyam registry status), and document risk (OCR confidence, clause-level discrepancies). Scores below 25 are LOW, 25–50 MEDIUM, 50–75 HIGH, and above 75 CRITICAL — each factor links to its supporting evidence on the bidder's Risk Analysis tab.",
    };
  }
  if (lower.includes('compliance') && (lower.includes('score') || lower.includes('calculat'))) {
    return {
      text:
        'The compliance score is a weighted rollup of every clause-level requirement on the Compliance tab — statutory registrations, technical qualifications, and commercial terms. Requirements only contribute points when VERIFIED or EXEMPTED; MANUAL_REVIEW and MISMATCH items reduce the score and surface as Evidence findings for officer review.',
    };
  }
  if (lower.includes('emd')) {
    return {
      text:
        'The standard EMD requirement is ₹2,00,000, payable via NEFT/RTGS bank transfer or an unconditional Bank Guarantee from a scheduled bank valid through the bid validity period. Registered Micro/Small Enterprises (MSEs) holding a valid Udyam certificate are exempt under the Public Procurement Policy for MSEs Order, 2012.',
    };
  }
  if (lower.includes('audit')) {
    return {
      text:
        'Every automated verification step and officer decision is written to the Audit Trail with a timestamp, actor, and reference hash — nothing is overwritten. Open the full ledger, filterable by bidder or action type, from Audit Trail in the sidebar.',
    };
  }
  if (lower.includes('gst')) {
    return {
      text:
        'GSTIN status is cross-checked against the GSTN portal during the Government Registry Cross-Check step of AI verification. A match confirms the legal name and "Active" registration status; a mismatch or inactive registration is flagged for manual review before the bid can proceed.',
    };
  }
  if (lower.includes('help') || lower.includes('what can you do')) {
    return {
      text:
        "I can answer questions about a bidder's eligibility and compliance scores, discrepancy or manual-review findings, EMD instrument verification, clause-level tender requirements, and how the risk and compliance models work — all from the same OCR and verification data shown in each bid's workspace.",
    };
  }
  if (lower.includes('thank')) {
    return { text: "You're welcome, Officer. Let me know if there's anything else you would like reviewed." };
  }
  if (/^(hi|hello|hey)\b/.test(lower.trim())) {
    return {
      text:
        "Hello, Officer. Ask me about any bidder's compliance status, EMD reconciliation, risk factors, or a specific tender clause — or use one of the quick questions above.",
    };
  }

  return {
    text: `Based on the current tender data for ${activeTenderTitle || 'this tender'}, 4 bidders are currently evaluated: Prime Tech Solutions (96% Compliant), ABC Industrial Solutions (92% Compliant, 1 discrepancy), Bharat Engineering Works (87% Compliant), and National Safety Systems (74% Compliant, deficient EMD). Officer sign-off is pending.`,
  };
}

export const FloatingAssistant: React.FC = () => {
  const { activeTender } = useProcurement();
  const [open, setOpen] = useState(false);
  const [inputPrompt, setInputPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'MSG-1',
      sender: 'assistant',
      text: activeTender
        ? `Good day, Officer Ramanathan. I am your CSAP Procurement Assistant. I can answer inquiries regarding tender eligibility benchmarks, bidder discrepancy findings, EMD reconciliation data, and clause-level compliance scores based on your active tender case (${activeTender.id}). How may I assist your scrutiny today?`
        : 'Good day, Officer Ramanathan. I am your CSAP Procurement Assistant. Select an active tender case from the Tenders workspace and I can answer inquiries regarding its eligibility benchmarks, bidder discrepancy findings, EMD reconciliation data, and clause-level compliance scores. How may I assist your scrutiny today?',
      timestamp: '10:00 AM',
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, open]);

  const handleSendMessage = (textToSend?: string) => {
    const text = textToSend || inputPrompt;
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: `USER-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    };

    const reply = getAssistantReply(text, activeTender?.title);
    const aiMsg: ChatMessage = {
      id: `AI-${Date.now()}`,
      sender: 'assistant',
      text: reply.text,
      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      evidenceRef: reply.evidence,
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInputPrompt('');
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <div className="w-[380px] max-w-[92vw] h-[560px] max-h-[75vh] bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-indigo-700 text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 bg-white/15 rounded shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">CSAP Procurement Assistant</div>
                <div className="text-[10px] text-indigo-200 uppercase tracking-wider font-semibold">Advisory</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="p-1 rounded hover:bg-white/15 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-3 pt-2.5 pb-1.5 border-b border-slate-100 text-[10px] text-slate-500 flex items-start gap-1.5 shrink-0">
            <AlertCircle className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
            <span>Responses are generated from submitted bid OCR text and CPPP rules.</span>
          </div>

          {/* Quick questions */}
          <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-slate-100 shrink-0">
            {quickQuestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleSendMessage(q)}
                className="text-[10.5px] bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 border border-slate-200 text-slate-700 px-2 py-1 rounded-full transition-colors font-medium"
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
                  <div className="w-6 h-6 rounded bg-indigo-700 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  className={`p-2.5 rounded-md max-w-[85%] ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white font-medium'
                      : 'bg-slate-50 border border-slate-200 text-slate-800'
                  }`}
                >
                  <p className="leading-relaxed">{msg.text}</p>
                  {msg.evidenceRef && (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-200 text-[10px] font-mono text-indigo-700 font-semibold">
                      Linked Evidence: {msg.evidenceRef}
                    </div>
                  )}
                  <div className="mt-1 text-[9px] opacity-60">{msg.timestamp}</div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-2 border-t border-slate-200 flex items-center gap-1.5 shrink-0">
            <input
              type="text"
              placeholder="Ask about a bidder, clause, or EMD status..."
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendMessage();
              }}
              className="flex-1 px-2.5 py-1.5 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
            />
            <button
              type="button"
              onClick={() => handleSendMessage()}
              aria-label="Send"
              className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Floating toggle button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? 'Close AI Assistant' : 'Open AI Assistant'}
        title="AI Assistant (Advisory)"
        className="relative w-14 h-14 rounded-full bg-indigo-700 hover:bg-indigo-800 text-white shadow-lg flex items-center justify-center transition-colors"
      >
        {open ? <X className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
        {!open && (
          <span className="absolute -top-1 -right-1 text-[8px] font-bold bg-white text-indigo-700 border border-indigo-200 rounded-full px-1.5 py-0.5 leading-none shadow-xs">
            AI
          </span>
        )}
      </button>
    </div>
  );
};
