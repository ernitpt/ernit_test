// One-off migration for partner "Vertente Natural".
//
// Context: partner was seeded with placeholder partnerId (OLD_UID) used in 5
// experiences and owned 3 auto-generated coupons. They then onboarded via
// invite and got a fresh auth UID (NEW_UID). The signup flow deleted the old
// parent doc but did NOT migrate the coupons subcollection or rewrite the
// experience.partnerId references. This script repairs that state.
//
// Run dry-run:  node scripts/migrateVertenteNatural.js
// Apply:        node scripts/migrateVertenteNatural.js --apply

import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, cert } from "firebase-admin/app";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, "..", "ernit-3fc0b-firebase-adminsdk.json"), "utf8")
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ---- Constants (intentionally hardcoded for safety) ----
const OLD_UID = "YPmHH5uVdgdukobTZFqNjpEFfKo1";
const NEW_UID = "Qbu0ws11qaVzeFSL9dZuRrSyF3S2";
const EXPECTED_NAME = "Vertente Natural";
const EXPECTED_INVITE = "vnVBgmItGUckXmGZIwub";
const EXPECTED_EXPERIENCES = ["adv3", "adv4", "adv6", "adv7", "adv8"];

const APPLY = process.argv.includes("--apply");
const log = (...a) => console.log(...a);
const section = (t) => log(`\n==== ${t} ====`);

function abort(msg) {
  console.error(`\n❌ ABORT: ${msg}`);
  process.exit(1);
}

async function main() {
  log(`Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}`);
  log(`OLD_UID: ${OLD_UID}`);
  log(`NEW_UID: ${NEW_UID}\n`);

  // === 1. PRECONDITION CHECKS ===
  section("1. Precondition checks");

  const newParent = await db.collection("partnerUsers").doc(NEW_UID).get();
  if (!newParent.exists) abort(`partnerUsers/${NEW_UID} does not exist`);
  const newData = newParent.data();
  if (newData.name !== EXPECTED_NAME)
    abort(`partnerUsers/${NEW_UID}.name is "${newData.name}", expected "${EXPECTED_NAME}"`);
  if (newData.createdFromInvite !== EXPECTED_INVITE)
    abort(`partnerUsers/${NEW_UID}.createdFromInvite is "${newData.createdFromInvite}", expected "${EXPECTED_INVITE}"`);
  log(`✓ New partner doc exists, name + invite match`);

  const newCouponsSnap = await db.collection("partnerUsers").doc(NEW_UID).collection("coupons").get();
  log(`  partnerUsers/${NEW_UID}/coupons size: ${newCouponsSnap.size}`);

  const oldCouponsSnap = await db.collection("partnerUsers").doc(OLD_UID).collection("coupons").get();
  log(`  partnerUsers/${OLD_UID}/coupons size: ${oldCouponsSnap.size}`);

  const oldParent = await db.collection("partnerUsers").doc(OLD_UID).get();
  log(`  partnerUsers/${OLD_UID} parent exists: ${oldParent.exists}`);

  // Idempotency check: if old is empty AND all expected experiences point to NEW → already migrated.
  const expDocs = await Promise.all(
    EXPECTED_EXPERIENCES.map((id) => db.collection("experiences").doc(id).get())
  );
  const oldRefs = [];
  const newRefs = [];
  const missingExp = [];
  for (const d of expDocs) {
    if (!d.exists) missingExp.push(d.id);
    else if (d.data().partnerId === OLD_UID) oldRefs.push(d.id);
    else if (d.data().partnerId === NEW_UID) newRefs.push(d.id);
    else log(`  ⚠ experience ${d.id} has unexpected partnerId: ${d.data().partnerId}`);
  }
  if (missingExp.length) abort(`expected experiences not found: ${missingExp.join(", ")}`);
  log(`  experiences pointing to OLD: [${oldRefs.join(", ")}]`);
  log(`  experiences pointing to NEW: [${newRefs.join(", ")}]`);

  if (oldCouponsSnap.empty && oldRefs.length === 0) {
    log("\n✅ Already migrated. Nothing to do. Exiting.");
    process.exit(0);
  }

  // If new subcollection is non-empty, refuse to proceed unless codes don't collide.
  const newCodes = new Set(newCouponsSnap.docs.map((d) => d.id));
  const collisions = oldCouponsSnap.docs.filter((d) => newCodes.has(d.id)).map((d) => d.id);
  if (collisions.length) abort(`coupon code collisions under NEW_UID: ${collisions.join(", ")}`);

  // Verify NO other collection references OLD (besides invite's createdFromInvite).
  log(`  scanning all top-level collections for unexpected OLD refs...`);
  const unexpectedRefs = [];
  const collections = await db.listCollections();
  const ALLOWED_OLD_REFS = new Set([
    // experiences — expected
    ...EXPECTED_EXPERIENCES.map((id) => `experiences/${id}`),
  ]);
  for (const col of collections) {
    const snap = await col.get();
    for (const d of snap.docs) {
      const json = JSON.stringify(d.data());
      if (json.includes(OLD_UID)) {
        const path = `${col.id}/${d.id}`;
        if (col.id === "partnerInvites") continue; // audit trail, allowed
        if (!ALLOWED_OLD_REFS.has(path)) unexpectedRefs.push(path);
      }
    }
  }
  if (unexpectedRefs.length) {
    log(`  unexpected OLD refs found:`);
    unexpectedRefs.forEach((p) => log(`    - ${p}`));
    abort("refusing to proceed with unexpected references");
  }
  log(`  ✓ no unexpected references to OLD_UID`);

  // === 2. PLAN ===
  section("2. Migration plan");
  log(`Copy ${oldCouponsSnap.size} coupons: partnerUsers/${OLD_UID}/coupons/* → partnerUsers/${NEW_UID}/coupons/*`);
  oldCouponsSnap.docs.forEach((d) => log(`  - ${d.id}  (userId=${d.data().userId}, status=${d.data().status})`));
  log(`Update ${oldRefs.length} experiences: partnerId OLD → NEW`);
  oldRefs.forEach((id) => log(`  - experiences/${id}`));
  log(`Delete ${oldCouponsSnap.size} old coupon docs after verify`);
  if (oldParent.exists) log(`  (old parent partnerUsers/${OLD_UID} exists — will NOT touch)`);

  // === 3. BACKUP ===
  section("3. Backup");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(__dirname, `.backup-vertente-${ts}.json`);
  const backup = {
    timestamp: ts,
    OLD_UID,
    NEW_UID,
    oldCoupons: oldCouponsSnap.docs.map((d) => ({ id: d.id, path: d.ref.path, data: d.data() })),
    experiences: expDocs.map((d) => ({ id: d.id, path: d.ref.path, data: d.data() })),
    newParent: { path: newParent.ref.path, data: newParent.data() },
    oldParent: oldParent.exists ? { path: oldParent.ref.path, data: oldParent.data() } : null,
  };
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  log(`✓ Backup written: ${backupPath}`);

  if (!APPLY) {
    log("\n✅ Dry-run complete. Re-run with --apply to execute.");
    process.exit(0);
  }

  // === 4. APPLY ===
  section("4. Applying writes");

  // Step A: set new coupons
  log("A. Writing new coupons...");
  const writtenCoupons = [];
  for (const d of oldCouponsSnap.docs) {
    const newRef = db.collection("partnerUsers").doc(NEW_UID).collection("coupons").doc(d.id);
    const data = { ...d.data(), partnerId: NEW_UID };
    await newRef.set(data);
    writtenCoupons.push({ ref: newRef, expected: data });
    log(`  ✓ set partnerUsers/${NEW_UID}/coupons/${d.id}`);
  }

  // Step B: verify
  log("B. Verifying new coupons...");
  for (const { ref, expected } of writtenCoupons) {
    const got = await ref.get();
    if (!got.exists) abort(`verify failed: ${ref.path} missing after write`);
    const gotData = got.data();
    for (const k of ["code", "status", "userId", "goalId", "partnerId"]) {
      const e = expected[k];
      const g = gotData[k];
      if (e !== g) abort(`verify failed: ${ref.path}.${k} expected "${e}", got "${g}"`);
    }
    log(`  ✓ verified ${ref.path}`);
  }

  // Step C: update experiences
  log("C. Updating experiences.partnerId...");
  const batch = db.batch();
  for (const id of oldRefs) {
    batch.update(db.collection("experiences").doc(id), { partnerId: NEW_UID });
    log(`  → experiences/${id}`);
  }
  await batch.commit();
  log(`  ✓ committed ${oldRefs.length} experience updates`);

  // Step D: verify experiences
  log("D. Verifying experiences...");
  for (const id of oldRefs) {
    const d = await db.collection("experiences").doc(id).get();
    if (d.data().partnerId !== NEW_UID) abort(`verify failed: experiences/${id}.partnerId = ${d.data().partnerId}`);
    log(`  ✓ experiences/${id}.partnerId = NEW`);
  }

  // Step E: delete old coupons
  log("E. Deleting old coupon docs...");
  for (const d of oldCouponsSnap.docs) {
    await d.ref.delete();
    log(`  ✓ deleted ${d.ref.path}`);
  }

  // === 5. POST-VERIFY ===
  section("5. Post-verification");
  const postOld = await db.collection("partnerUsers").doc(OLD_UID).collection("coupons").get();
  const postNew = await db.collection("partnerUsers").doc(NEW_UID).collection("coupons").get();
  log(`  OLD subcollection size: ${postOld.size} (expected 0)`);
  log(`  NEW subcollection size: ${postNew.size} (expected ${oldCouponsSnap.size})`);
  if (postOld.size !== 0) abort("post-verify: OLD subcollection not empty");
  if (postNew.size !== oldCouponsSnap.size) abort("post-verify: NEW subcollection size mismatch");

  log(`\n✅ Migration complete. Backup at ${backupPath}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
