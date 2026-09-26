// Writes bid_package/manifest.json (documents + bidder identity) from the shared demo seed, so the
// specimen images always match the database. Run: npx tsx database/sample_documents/export_manifest.ts
import { writeFileSync } from 'node:fs';
import { seedDatabase } from '../../shared/demo/seed.js';

const db = seedDatabase();
const docs = db.documents.map((d) => {
  const bid = db.bids.find((b) => b.id === d.bidId)!;
  const bidder = db.bidders.find((b) => b.id === bid.bidderId)!;
  const req = db.requirements.find((r) => r.id === d.requirementId)!;
  return { id: d.id, bidId: d.bidId, requirement: req.code, name: d.name, text: d.extractedText, bidder: { name: bidder.companyName, pan: bidder.pan, gstin: bidder.gstin, address: bidder.address } };
});
writeFileSync(new URL('./bid_package/manifest.json', import.meta.url), JSON.stringify(docs, null, 2));
console.log(`manifest: ${docs.length} documents`);
