// ============================================================================
//  BILL EDIT ER PORE PENDING KENO BADLAYNI  —  READ ONLY
//
//  Ekta bill e qty komanor pore Work Done page er "Operations Pending" e
//  operation ta ferot ase ni — kno, seta ek jaygay dekhay:
//
//    totalOpsQty        JobopsMaster e ei op er mot qty
//    pendingOpsQty      ekhon DB te ja lekha ache
//    recordedWD         Contractor_WD e joma sob qty (billed + saved-unbilled)
//    liveBilled         non-deleted bill gulo te ei op er mot qty
//    expectedPending    clamp(0, total, total - recordedWD)
//    VERDICT            row ta keno dekhachhe / dekhachhe na
//
//  Backend pending ke ei niyome e boshay:
//      pending = clamp(0, totalOpsQty, totalOpsQty - recorded kaj)
//  Tai recorded kaj >= totalOpsQty hole pending 0 e thake, ar
//  GET /work/pending/jobopsmaster/:jobNumber shudhu pending > 0 row pathay —
//  mane row ta Operations Pending e dekhabei na. Seta bug noy, seta thik.
//
//  ⚠  KICHUI CHANGE KORE NA.
//
//  Chalanor niyom (backend folder theke):
//    mongosh "<URI>" --file scripts/check-pending-after-edit.js > edit.txt
//
//  Niche JOB_NUMBER dite hobe. OPS_FILTER faka rakhle sob op dekhabe.
// ============================================================================

// ---------------------------------------------------------------- settings --
const DB_NAME    = 'Contractor_PO';
const JOB_NUMBER = 'J04307_26_27';   // <-- je job e edit korechen
const OPS_FILTER = '';               // <-- ekta op e dekhte hole tar naam, na hole ''
const BILL_NUMBER = '';              // <-- je bill ta edit korechen (optional)
const PACKAGING_ALLOWANCE_PCT = 5;
const TOL = 0.5;
// ----------------------------------------------------------------------------

const d = db.getSiblingDB(DB_NAME);

const r2   = v => Math.round((Number(v) || 0) * 100) / 100;
const norm = s => String(s == null ? '' : s).trim();
const num  = v => Number(v || 0);
const pad  = (s, n) => String(s == null ? '' : s).padEnd(n).slice(0, n);
const rpad = (v, n) => String(v == null ? '' : v).padStart(n);

const out = [];
const say = l => out.push(l);

say('');
say('='.repeat(118));
say('  PENDING CHECK AFTER BILL EDIT   job: ' + JOB_NUMBER + '   db: ' + DB_NAME);
say('='.repeat(118));

const jom = d.JobopsMaster.findOne({ jobId: JOB_NUMBER });
if (!jom) {
  say('');
  say('  JobopsMaster e ei job nei: ' + JOB_NUMBER);
  print(out.join('\n'));
} else {

  const segment   = norm(jom.segmentName);
  const totalQty  = num(jom.totalQty);
  const allowance = segment === 'Packaging' && totalQty > 0
    ? Math.round(totalQty * PACKAGING_ALLOWANCE_PCT / 100)
    : 0;

  say('');
  say('  segmentName : ' + (segment || '(faka)'));
  say('  totalQty    : ' + totalQty);
  say('  allowance   : ' + allowance + (allowance ? '  (packaging ' + PACKAGING_ALLOWANCE_PCT + '% of totalQty)' : '  (packaging noy)'));

  // ------------------------------------------------------- operation names --
  const opIds = (jom.ops || []).map(o => norm(o.opId)).filter(Boolean);
  const opObjIds = [];
  opIds.forEach(id => { try { opObjIds.push(new ObjectId(id)); } catch (e) {} });
  const nameById = {};
  d.operations.find({ _id: { $in: opObjIds } }).forEach(o => {
    nameById[o._id.toString()] = norm(o.opsName);
  });

  // ------------------------------------------- Contractor_WD e joma kaj ----
  const wdByOp = {};        // opId -> { billed, unsaved, rows: [] }
  d.Contractor_WD.find({ jobId: JOB_NUMBER, isAdhoc: { $ne: true } }).forEach(doc => {
    (doc.opsDone || []).forEach(od => {
      const k = norm(od.opsId);
      if (!k) return;
      if (!wdByOp[k]) wdByOp[k] = { billed: 0, unsaved: 0, rows: [] };
      const q = num(od.opsDoneQty);
      const unsaved = /^\s*No\s*$/i.test(String(od.savedInBill == null ? '' : od.savedInBill));
      if (unsaved) wdByOp[k].unsaved += q; else wdByOp[k].billed += q;
      wdByOp[k].rows.push({
        contractorId: norm(doc.contractorId),
        opsName: norm(od.opsName),
        qty: q,
        rate: r2(od.valuePerBook),
        savedInBill: String(od.savedInBill == null ? '(nei)' : od.savedInBill),
        on: od.completionDate ? new Date(od.completionDate).toISOString().slice(0, 19).replace('T', ' ') : '(nei)'
      });
    });
  });

  // --------------------------------------------- live bill e ei op er qty --
  const billedByOp = {};    // opId -> qty ; opId na thakle naam|rate key
  const billedByName = {};
  const billLines = [];
  d.Bills.find({ isDeleted: { $ne: true }, 'jobs.jobNumber': JOB_NUMBER }).forEach(b => {
    (b.jobs || []).forEach(j => {
      if (norm(j.jobNumber) !== JOB_NUMBER) return;
      (j.ops || []).forEach(op => {
        const q = num(op.qtyCompleted);
        const id = norm(op.opId);
        if (id) billedByOp[id] = (billedByOp[id] || 0) + q;
        const nk = norm(op.opsName) + '|' + r2(op.rate);
        billedByName[nk] = (billedByName[nk] || 0) + q;
        billLines.push({
          bill: b.billNumber,
          contractor: norm(b.contractorName),
          paid: b.paymentStatus === 'Yes' ? 'PAID' : '-',
          opsName: norm(op.opsName),
          opId: id || '(nei)',
          qty: q,
          rate: r2(op.rate)
        });
      });
    });
  });

  // ------------------------------------------------------------ per op ----
  say('');
  say('-'.repeat(118));
  say('  ' + pad('OPERATION', 34) + rpad('totalOps', 10) + rpad('pendingDB', 11) +
      rpad('recordedWD', 12) + rpad('liveBilled', 12) + rpad('expPending', 12) + '  VERDICT');
  say('-'.repeat(118));

  (jom.ops || []).forEach(op => {
    const id   = norm(op.opId);
    const name = nameById[id] || '(naam pai ni)';
    if (OPS_FILTER && name.toLowerCase().indexOf(OPS_FILTER.toLowerCase()) === -1) return;

    const total   = num(op.totalOpsQty);
    const pendDB  = num(op.pendingOpsQty);
    const wd      = wdByOp[id] || { billed: 0, unsaved: 0, rows: [] };
    const recWD   = wd.billed + wd.unsaved;
    const live    = billedByOp[id] != null
      ? billedByOp[id]
      : (billedByName[name + '|' + r2(op.valuePerBook)] || 0);
    const expPend = Math.min(total, Math.max(0, total - recWD));

    let verdict;
    if (recWD >= total - TOL) {
      verdict = 'PENDING 0 THIK — recorded kaj (' + recWD + ') total (' + total + ') puron kore diyeche, ' +
                'tai Operations Pending e row ta dekhabe na';
    } else if (Math.abs(pendDB - expPend) <= TOL) {
      verdict = 'THIK — pending ' + pendDB + ' hoyeche, row ta dekhano uchit';
    } else {
      verdict = 'MISMATCH — DB te ' + pendDB + ' ache, kintu recorded kaj onujayi ' + expPend + ' hoya uchit';
    }
    if (Math.abs(recWD - live) > TOL) {
      verdict += '  |  ⚠ WD (' + recWD + ') ar live bill (' + live + ') mileni, differ ' + r2(recWD - live);
    }
    if (pendDB <= 0) verdict = '[ROW HIDDEN] ' + verdict;

    say('  ' + pad(name, 34) + rpad(total, 10) + rpad(pendDB, 11) +
        rpad(recWD, 12) + rpad(live, 12) + rpad(expPend, 12) + '  ' + verdict);
  });

  // ------------------------------------------------------- WD row detail --
  say('');
  say('-'.repeat(118));
  say('  CONTRACTOR_WD ROWS');
  say('-'.repeat(118));
  let anyRow = false;
  Object.keys(wdByOp).forEach(id => {
    const name = nameById[id] || '(naam pai ni)';
    if (OPS_FILTER && name.toLowerCase().indexOf(OPS_FILTER.toLowerCase()) === -1) return;
    say('  ' + name + '   [opId ' + id + ']   billed=' + wdByOp[id].billed + '  unbilled=' + wdByOp[id].unsaved);
    wdByOp[id].rows.forEach(r => {
      anyRow = true;
      say('      ' + pad(r.contractorId, 26) + rpad(r.qty, 10) + '  rate ' + rpad(r.rate, 8) +
          '  savedInBill=' + pad(r.savedInBill, 8) + '  ' + r.on);
    });
  });
  if (!anyRow) say('  (ei job e Contractor_WD te kono row nei)');

  // ---------------------------------------------------------- bill lines --
  say('');
  say('-'.repeat(118));
  say('  LIVE BILL LINES (non-deleted)');
  say('-'.repeat(118));
  if (!billLines.length) {
    say('  (ei job er kono live bill nei)');
  } else {
    billLines
      .filter(l => !OPS_FILTER || l.opsName.toLowerCase().indexOf(OPS_FILTER.toLowerCase()) !== -1)
      .filter(l => !BILL_NUMBER || String(l.bill) === String(BILL_NUMBER))
      .forEach(l => {
        say('  bill ' + pad(l.bill, 12) + pad(l.contractor, 24) + pad(l.paid, 6) +
            pad(l.opsName, 32) + rpad(l.qty, 10) + '  rate ' + rpad(l.rate, 8) +
            '  opId ' + l.opId);
      });
  }

  say('');
  say('='.repeat(118));
  say('  KI DEKHBEN:');
  say('   1. recordedWD >= totalOps hole pending 0 — row ta dekhabe na, ETA THIK.');
  say('      6000 komanor por o jodi recorded = totalOps hoy, tobe ferot asar kichu nei.');
  say('   2. totalOps > recordedWD holeo pendingDB 0 thakle => MISMATCH, tokhon');
  say('      backend er notun build deploy hoyeche kina dekhun.');
  say('   3. WD ar live bill na mille bill edit e Contractor_WD row ta khuje pay ni —');
  say('      seta alada kore janaben, oi row ta hate thik korte hobe.');
  say('='.repeat(118));
  say('');

  print(out.join('\n'));
}
