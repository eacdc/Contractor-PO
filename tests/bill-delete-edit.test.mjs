// Bill delete / edit-qty behaviour, for packaging and non-packaging jobs.
//
// The blocks under test are extracted from the backend's routes.js and run as
// they are written there, so this checks the shipped source rather than a
// re-typing of it. If a block is edited in a way that changes behaviour, these
// fail; if it is moved or renamed, extraction throws instead of silently
// passing.
//
//   node tests/bill-delete-edit.test.mjs
import { readFileSync } from 'fs';

// Path to the backend checkout. Override with ROUTES_JS when it lives elsewhere:
//   ROUTES_JS="C:/Users/User/Desktop/CDC Site/backend/src/routes.js" node tests/bill-delete-edit.test.mjs
const ROUTES_JS = process.env.ROUTES_JS || '/workspace/cdc-site/src/routes.js';
const SRC = readFileSync(ROUTES_JS, 'utf8');

function extract(startAnchor, endAnchor, label) {
  const s = SRC.indexOf(startAnchor);
  if (s < 0) throw new Error('start anchor not found: ' + label);
  const e = SRC.indexOf(endAnchor, s);
  if (e < 0) throw new Error('end anchor not found: ' + label);
  return SRC.slice(s, e + endAnchor.length);
}

const isOpsDoneUnsaved = od => String(od?.savedInBill ?? '').trim() === 'No';
const isOpsDoneBilled  = od => !isOpsDoneUnsaved(od);
const packagingAllowanceFor = m => (String(m?.segmentName || '').trim() === 'Packaging' && Number(m?.totalQty || 0) > 0)
  ? Math.round(Number(m.totalQty) * 5 / 100) : 0;

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (ok ? '' : `\n           got  ${JSON.stringify(got)}\n           want ${JSON.stringify(want)}`));
  ok ? pass++ : fail++;
};

// ===========================================================================
// 1. DELETE — JobopsMaster pending recompute (real block)
// ===========================================================================
const deletePendingSrc = extract(
  'for (const opIdStr of Object.keys(billQtyByOp)) {',
  "jobOpsMaster.markModified('ops');", 'delete pending');

const runDeletePending = (jobOpsMaster, totalCompletedByOp, billQtyByOp) => {
  const fn = new Function('jobOpsMaster', 'totalCompletedByOp', 'billQtyByOp',
    deletePendingSrc.replace("jobOpsMaster.markModified('ops');", ''));
  fn(jobOpsMaster, totalCompletedByOp, billQtyByOp);
  return jobOpsMaster.ops.map(o => o.pendingOpsQty);
};

console.log('\n1) BILL DELETE  ->  JobopsMaster pendingOpsQty');
console.log('   (real block from routes.js)\n');

// non-packaging: whole bill reversed, nothing else recorded
check('non-packaging: full reversal -> pending back to total',
  runDeletePending({ ops: [{ opId: 'A', totalOpsQty: 10000, pendingOpsQty: 2000 }] },
                   { A: 8000 }, { A: 8000 }), [10000]);

// non-packaging: another contractor still has work recorded
check('non-packaging: other work stays -> pending 10000-3000',
  runDeletePending({ ops: [{ opId: 'A', totalOpsQty: 10000, pendingOpsQty: 2000 }] },
                   { A: 8000 }, { A: 5000 }), [7000]);

// packaging: overshoot 5% exactly, whole bill reversed
check('packaging: +5% overshoot fully reversed -> pending back to total',
  runDeletePending({ ops: [{ opId: 'A', totalOpsQty: 5000, pendingOpsQty: 0 }] },
                   { A: 5250 }, { A: 5250 }), [5000]);

// packaging: overshoot 1% only (old code lost 4% here)
check('packaging: +1% overshoot fully reversed -> pending back to total',
  runDeletePending({ ops: [{ opId: 'A', totalOpsQty: 10000, pendingOpsQty: 0 }] },
                   { A: 10100 }, { A: 10100 }), [10000]);

// packaging: two contractors, only one bill deleted
check('packaging: two contractors, one bill deleted -> pending 10000-4400',
  runDeletePending({ ops: [{ opId: 'A', totalOpsQty: 10000, pendingOpsQty: 0 }] },
                   { A: 10400 }, { A: 6000 }), [5600]);

// pending was already wrong -> delete corrects it
check('pending already wrong -> recompute corrects it',
  runDeletePending({ ops: [{ opId: 'A', totalOpsQty: 30000, pendingOpsQty: 30000 }] },
                   { A: 22000 }, { A: 22000 }), [30000]);

// still-overshot after reversal -> clamp at 0, never negative
check('still overshot after reversal -> clamped to 0',
  runDeletePending({ ops: [{ opId: 'A', totalOpsQty: 5000, pendingOpsQty: 0 }] },
                   { A: 12000 }, { A: 5000 }), [0]);

// an op on the bill that the job no longer has -> skipped, others untouched
check('op missing from job -> skipped, other op untouched',
  runDeletePending({ ops: [{ opId: 'A', totalOpsQty: 10000, pendingOpsQty: 4000 }] },
                   { A: 6000, B: 999 }, { A: 6000, B: 999 }), [10000]);

// ===========================================================================
// 2. DELETE — Contractor_WD reversal (real block)
// ===========================================================================
// Brace-matched so the block ends exactly where the source block ends.
function extractBraceBlock(startAnchor, label) {
  const s = SRC.indexOf(startAnchor);
  if (s < 0) throw new Error('anchor not found: ' + label);
  let depth = 0, seen = false;
  for (let i = s; i < SRC.length; i++) {
    if (SRC[i] === '{') { depth++; seen = true; }
    else if (SRC[i] === '}') { depth--; if (seen && depth === 0) return SRC.slice(s, i + 1); }
  }
  throw new Error('unbalanced block: ' + label);
}

const deleteWdSrc = extractBraceBlock(
  'const wdOp = contractorWD.opsDone.find(od => isOpsDoneBilled(od) && String(od.opsId) === opIdStr);',
  'delete wd');

const runDeleteWd = (opsDone, opIdStr, qtyCompleted) => {
  const contractorWD = { opsDone };
  const fn = new Function('contractorWD', 'opIdStr', 'op', 'isOpsDoneBilled', deleteWdSrc);
  fn(contractorWD, opIdStr, { qtyCompleted }, isOpsDoneBilled);
  return contractorWD.opsDone.map(o => `${o.opsId}:${o.opsDoneQty}:${o.savedInBill}`);
};

console.log('\n2) BILL DELETE  ->  Contractor_WD reversal');
console.log('   (real block from routes.js)\n');

check('billed row fully reversed -> removed',
  runDeleteWd([{ opsId: 'A', opsDoneQty: 8000, savedInBill: 'Yes' }], 'A', 8000), []);

check('leftover stays BILLED (no resurrection to No)',
  runDeleteWd([{ opsId: 'A', opsDoneQty: 8000, savedInBill: 'Yes' }], 'A', 5000), ['A:3000:Yes']);

check('unsaved row is never touched',
  runDeleteWd([{ opsId: 'A', opsDoneQty: 500, savedInBill: 'No' },
               { opsId: 'A', opsDoneQty: 8000, savedInBill: 'Yes' }], 'A', 8000), ['A:500:No']);

check('only the matched row is removed, other opsId survives',
  runDeleteWd([{ opsId: 'A', opsDoneQty: 8000, savedInBill: 'Yes' },
               { opsId: 'B', opsDoneQty: 100, savedInBill: 'Yes' }], 'A', 8000), ['B:100:Yes']);

check('two billed rows same opsId -> only one removed',
  runDeleteWd([{ opsId: 'A', opsDoneQty: 8000, savedInBill: 'Yes' },
               { opsId: 'A', opsDoneQty: 2000, savedInBill: 'Yes' }], 'A', 8000), ['A:2000:Yes']);

// ===========================================================================
// 3. EDIT-QTY — pending delta with the packaging allowance (real block)
// ===========================================================================
// Whole per-op loop body, so the recorded-work lookups it now depends on are
// declared inside the extracted block.
const editPendingSrc = extract(
  'const totalOpsQty = Number(jobOp.totalOpsQty || 0);\n        const opKey = String(jobOp.opId);',
  'const newPending = Math.max(0, Math.min(totalOpsQty, totalOpsQty - recordedAfter));', 'edit pending');

const runEditPending = (jobOpsMaster, recordedBeforeQty, totalOpsQty, deltaQty) => {
  const body = editPendingSrc
    .replace(/await session\.abortTransaction\(\);/g, '')
    .replace(/session\.endSession\(\);/g, '')
    .replace(/return res\.status\(400\)\.json\(\{[\s\S]*?\}\);/, 'return { rejected: true };');
  const fn = new Function('jobOpsMaster', 'jobOp', 'recordedByOpForEdit', 'appliedDeltaByOp',
    'deltaQty', 'jobNumber', 'normalizedName', 'packagingAllowanceFor',
    body + '\n return { rejected: false, newPending };');
  const r = fn(jobOpsMaster, { opId: 'A', totalOpsQty }, { A: recordedBeforeQty }, {},
               deltaQty, 'J1', 'Op', packagingAllowanceFor);
  return r.rejected ? 'REJECT' : r.newPending;
};

console.log('\n3) BILL EDIT-QTY  ->  pending, derived from recorded work');
console.log('   (real block from routes.js)\n');

const nonPkg = { segmentName: 'Commercial', totalQty: 10000 };
const pkg    = { segmentName: 'Packaging',  totalQty: 10000 };   // allowance 500

check('non-packaging: increase within what is left',
  runEditPending(nonPkg, 6000, 10000, 3000), 1000);
check('non-packaging: increase beyond what is left -> reject',
  runEditPending(nonPkg, 6000, 10000, 5000), 'REJECT');
check('non-packaging: decrease -> pending grows',
  runEditPending(nonPkg, 8000, 10000, -8000), 10000);

check('packaging: increase inside allowance (10000 recorded, +400 of 500)',
  runEditPending(pkg, 10000, 10000, 400), 0);
check('packaging: increase to exactly the allowance (+500)',
  runEditPending(pkg, 10000, 10000, 500), 0);
check('packaging: increase beyond allowance (+600) -> reject',
  runEditPending(pkg, 10000, 10000, 600), 'REJECT');
check('packaging: normal increase within what is left',
  runEditPending(pkg, 6000, 10000, 3000), 1000);

// The gap the walkthrough exposed: an operation past its total, then reduced.
// pending clamps at 0, so a delta-based update overstated it by the overshoot.
check('packaging: overshot 21000/20000, bill cut by 2000 -> pending 1000, not 2000',
  runEditPending({ segmentName: 'Packaging', totalQty: 20000 }, 21000, 20000, -2000), 1000);
check('packaging: overshot then reduced below total -> pending from recorded work',
  runEditPending({ segmentName: 'Packaging', totalQty: 20000 }, 21000, 20000, -6000), 5000);

// ===========================================================================
// 4. EDIT-QTY — Contractor_WD adjustment (real block)
// ===========================================================================
// Whole loop body, so adjName / adjValue / adjOpId are declared inside it.
const editWdSrc = extractBraceBlock('for (const adj of contractorWDAdjustments) {', 'edit wd');

const runEditWd = (opsDone, adj) => {
  const contractorWD = { opsDone };
  const round2 = v => parseFloat(Number(v || 0).toFixed(2));
  const fn = new Function('contractorWD', 'contractorWDAdjustments', 'round2', 'isOpsDoneUnsaved', editWdSrc);
  fn(contractorWD, [adj], round2, isOpsDoneUnsaved);
  return contractorWD.opsDone.map(o => `${o.opsId || '-'}:${o.opsName}:${o.opsDoneQty}:${o.savedInBill}`);
};

console.log('\n4) BILL EDIT-QTY  ->  Contractor_WD adjustment');
console.log('   (real block from routes.js)\n');

check('increase folds into the BILLED row',
  runEditWd([{ opsId: 'A', opsName: 'Op', valuePerBook: 2, opsDoneQty: 5000, savedInBill: 'Yes' }],
            { opId: 'A', opsName: 'Op', valuePerBook: 2, deltaQty: 1000 }),
  ['A:Op:6000:Yes']);

check('unsaved row is skipped, a new BILLED row is created',
  runEditWd([{ opsId: 'A', opsName: 'Op', valuePerBook: 2, opsDoneQty: 700, savedInBill: 'No' }],
            { opId: 'A', opsName: 'Op', valuePerBook: 2, deltaQty: 1000 }),
  ['A:Op:700:No', 'A:Op:1000:Yes']);

check('no matching row -> new row is billed, with a real opsId',
  runEditWd([], { opId: 'A', opsName: 'Op', valuePerBook: 2, deltaQty: 1000 }),
  ['A:Op:1000:Yes']);

check('decrease reduces the billed row',
  runEditWd([{ opsId: 'A', opsName: 'Op', valuePerBook: 2, opsDoneQty: 5000, savedInBill: 'Yes' }],
            { opId: 'A', opsName: 'Op', valuePerBook: 2, deltaQty: -2000 }),
  ['A:Op:3000:Yes']);

check('decrease to zero removes the billed row, unsaved row survives',
  runEditWd([{ opsId: 'A', opsName: 'Op', valuePerBook: 2, opsDoneQty: 5000, savedInBill: 'Yes' },
             { opsId: 'A', opsName: 'Op', valuePerBook: 2, opsDoneQty: 700, savedInBill: 'No' }],
            { opId: 'A', opsName: 'Op', valuePerBook: 2, deltaQty: -5000 }),
  ['A:Op:700:No']);

check('matched by opId even when the name differs',
  runEditWd([{ opsId: 'A', opsName: 'Old Name', valuePerBook: 2, opsDoneQty: 5000, savedInBill: 'Yes' }],
            { opId: 'A', opsName: 'New Name', valuePerBook: 2, deltaQty: 1000 }),
  ['A:Old Name:6000:Yes']);

// ===========================================================================
// 5. UNSAVE — pending after deleting a saved-but-not-billed row (real block)
// ===========================================================================
// This is the Delete button in Work Done > Bill Details, which reverses a
// Contractor_WD row with savedInBill:'No'. It used to add the quantity back to
// pending; pending floors at 0, so a Packaging operation saved past its total
// under the 5% allowance came back with the overshoot as fresh pending.
const unsavePendingSrc = extract(
  'const wdDocsAfterUnsave = await ContractorWD.find(',
  'jobOp.pendingOpsQty = Math.min(totalOpsQtyForUnsave, Math.max(0, totalOpsQtyForUnsave - recordedAfterUnsave));',
  'unsave pending');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// wdDocs is the Contractor_WD state AFTER the row has been removed, which is
// what the route reads: it saves the reversal before recomputing pending.
const runUnsavePending = async (jobOp, wdDocs) => {
  const ContractorWD = { find: () => ({ lean: async () => wdDocs }) };
  const fn = new AsyncFunction('jobOp', 'jobNumber', 'ContractorWD',
    unsavePendingSrc + '\n return jobOp.pendingOpsQty;');
  return fn(jobOp, 'J1', ContractorWD);
};

console.log('\n5) SAVED-WORK DELETE (unsave)  ->  pending from recorded work');
console.log('   (real block from routes.js)\n');

// The reported case: 120000 total, 20000 already recorded by someone else,
// 106000 saved under the packaging allowance and then deleted.
check('packaging overshoot deleted -> pending back to 100000, not 106000',
  await runUnsavePending({ opId: 'A', totalOpsQty: 120000, pendingOpsQty: 0 },
                         [{ opsDone: [{ opsId: 'A', opsDoneQty: 20000 }] }]), 100000);

check('only saved row deleted -> pending back to the full total',
  await runUnsavePending({ opId: 'A', totalOpsQty: 10000, pendingOpsQty: 2000 }, []), 10000);

check('work recorded by another contractor stays out of pending',
  await runUnsavePending({ opId: 'A', totalOpsQty: 10000, pendingOpsQty: 0 },
                         [{ opsDone: [{ opsId: 'A', opsDoneQty: 3000 }] },
                          { opsDone: [{ opsId: 'A', opsDoneQty: 1000 }] }]), 6000);

check('other operations are not counted',
  await runUnsavePending({ opId: 'A', totalOpsQty: 10000, pendingOpsQty: 0 },
                         [{ opsDone: [{ opsId: 'B', opsDoneQty: 9000 }] }]), 10000);

check('still overshot after the reversal -> clamped to 0',
  await runUnsavePending({ opId: 'A', totalOpsQty: 10000, pendingOpsQty: 0 },
                         [{ opsDone: [{ opsId: 'A', opsDoneQty: 10400 }] }]), 0);

check('pending was already wrong -> the reversal corrects it',
  await runUnsavePending({ opId: 'A', totalOpsQty: 30000, pendingOpsQty: 30000 },
                         [{ opsDone: [{ opsId: 'A', opsDoneQty: 22000 }] }]), 8000);

console.log(`\n${'='.repeat(70)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(70));
process.exit(fail ? 1 : 0);
