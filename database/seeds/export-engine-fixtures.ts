/**
 * Writes ai_engine/tests/fixtures/demo_bids.json from the demo dataset so the engine's
 * pytest suite checks its rules against exactly the same scenarios the app shows.
 * Run: npx tsx database/seeds/export-engine-fixtures.ts
 */
import { writeFileSync } from 'node:fs';
import { seedDatabase } from '../../shared/demo/seed.js';

const db = seedDatabase();
const cases = db.bids.map((bid) => {
  const tender = db.tenders.find((t) => t.id === bid.tenderId)!;
  const bidder = db.bidders.find((b) => b.id === bid.bidderId)!;
  const requirements = db.requirements.filter((r) => r.tenderId === tender.id);
  const emd = db.emdTransactions.find((e) => e.bidId === bid.id);
  return {
    payload: {
      bidId: bid.id,
      tender: { id: tender.id, title: tender.title, technicalOpeningDate: tender.technicalOpeningDate, emdAmount: tender.emdAmount },
      requirements: requirements.map((r) => ({ code: r.code, title: r.title, category: r.category, criterion: r.criterion, benchmark: r.benchmark, mandatory: r.mandatory })),
      bidder: { companyName: bidder.companyName, gstin: bidder.gstin, pan: bidder.pan, udyamNumber: bidder.udyamNumber, msmeCategory: bidder.msmeCategory, turnover: bidder.turnover },
      makeInIndiaPercentage: bid.makeInIndiaPercentage,
      documents: db.documents.filter((d) => d.bidId === bid.id).map((d) => ({ id: d.id, requirementCode: db.requirements.find((r) => r.id === d.requirementId)!.code, name: d.name, fileName: d.fileName, extractedText: d.extractedText })),
      emd: emd && { requiredAmount: emd.requiredAmount, submittedAmount: emd.submittedAmount, instrument: emd.instrument, reference: emd.reference, bankName: emd.bankName, validUntil: emd.validUntil },
    },
    expected: {
      checks: Object.fromEntries(db.complianceChecks.filter((c) => c.bidId === bid.id).map((c) => [db.requirements.find((r) => r.id === c.requirementId)!.code, c.status])),
      riskLevel: bid.riskLevel,
      suggestedDecision: db.recommendations.find((r) => r.bidId === bid.id)?.suggestedDecision,
    },
  };
});
writeFileSync(new URL('../../ai_engine/tests/fixtures/demo_bids.json', import.meta.url), JSON.stringify(cases, null, 2) + '\n');
console.log(`Wrote ${cases.length} cases`);
