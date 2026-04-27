// run: node scripts/scanPartnerRefs.js
// Scans top-level collections for references to the old partnerId.

import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, cert } from "firebase-admin/app";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, "..", "ernit-3fc0b-firebase-adminsdk.json"), "utf8")
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const OLD = "YPmHH5uVdgdukobTZFqNjpEFfKo1";
const NEW = "Qbu0ws11qaVzeFSL9dZuRrSyF3S2";

// List all top-level collections
const collections = await db.listCollections();
console.log("Top-level collections:", collections.map((c) => c.id).join(", "));
console.log();

// For each, scan every doc and look for OLD anywhere in the serialized data.
// For large collections this would be expensive, but this is a one-off diagnostic.
for (const col of collections) {
  const snap = await col.get();
  const hits = [];
  for (const doc of snap.docs) {
    const json = JSON.stringify(doc.data());
    if (json.includes(OLD)) {
      hits.push(doc.id);
    }
  }
  if (hits.length > 0) {
    console.log(`[${col.id}] ${hits.length} docs reference OLD partnerId:`);
    for (const id of hits) console.log(`  - ${id}`);
  }
}

// Also check: does NEW partnerUsers doc exist? What about OLD?
console.log();
const oldPu = await db.collection("partnerUsers").doc(OLD).get();
const newPu = await db.collection("partnerUsers").doc(NEW).get();
console.log(`partnerUsers/${OLD} parent doc exists: ${oldPu.exists}`);
console.log(`partnerUsers/${NEW} parent doc exists: ${newPu.exists}`);

// Sub-collections under OLD partnerUsers
const oldSubs = await db.collection("partnerUsers").doc(OLD).listCollections();
console.log(`partnerUsers/${OLD} subcollections:`, oldSubs.map((c) => c.id).join(", ") || "(none)");
for (const sub of oldSubs) {
  const s = await sub.get();
  console.log(`  ${sub.id}: ${s.size} docs`);
}

// Also check 'partners' collection for a doc with OLD id
const oldPartnerDoc = await db.collection("partners").doc(OLD).get();
console.log(`\npartners/${OLD} exists: ${oldPartnerDoc.exists}`);
if (oldPartnerDoc.exists) console.log("  data:", JSON.stringify(oldPartnerDoc.data()));

process.exit(0);
