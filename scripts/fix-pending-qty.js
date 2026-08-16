// ============================================================================
//  JobopsMaster pendingOpsQty CLEANUP
//
//  Kaj: protita operation er pendingOpsQty ke thik kore —
//         pendingOpsQty = totalOpsQty - (oi job+op e Contractor_WD te joma
//                                        sob kaj, sob contractor mile)
//       0 ar totalOpsQty er majhe clamp kora hoy.
//
//  DEFAULT E KICHUI CHANGE HOY NA (APPLY = false).  Age dry run cholan,
//  report dekhe santushto hole tarpor APPLY = true korun.
//
//  Chalanor niyom:
//    1) DRY RUN (kichu bodlay na — ei ta age cholan):
//       mongosh "<URI>" --file scripts/fix-pending-qty.js > fix-preview.txt
//
//    2) APPLY (niche APPLY = true korar por):
//       mongosh "<URI>" --file scripts/fix-pending-qty.js > fix-applied.txt
//
//    3) ROLLBACK (kono karone phire jete chaile ROLLBACK = true korun):
//       mongosh "<URI>" --file scripts/fix-pending-qty.js > fix-rollback.txt
//
//  ⚠  APPLY kora somoy keu jeno system ta use na kore — ei script live data
//     bodlay. Ar age MongoDB Atlas e ekta snapshot niye rakhun.
// ============================================================================

// ---------------------------------------------------------------- settings --
const DB_NAME       = 'Contractor_PO';
const APPLY         = false;  // false = sudhu report.  true = data bodlabe.
const ROLLBACK      = false;  // true = backup collection theke purono value phirie ana
const FIX_INCREASES = false;  // niche "pending barano" section dekhun
// true  = kaj hoyeche dhora hobe max(Contractor_WD, live bill).  Purono delete
//         route Contractor_WD row muche felechilo, tai kono kono khetre live
//         bill e WD er cheye BESHI ache. Sudhu WD dhorle oi difference ta abar
//         "pending" hoye jeto — jeta already bill hoye gechhe.
// false = sudhu Contractor_WD dhora hobe (ei ta NIRAPOD NOY, dekhe bujhe korun)
const COUNT_LIVE_BILLS = true;
// Kichu operation e Contractor_WD te KICHUI nei (done = 0) othocho live bill e
// puro qty ache. Oi khetre siddhanto ta puro tai bill er upor dariye — WD er
// kono sakkhyo nei. Bill ta jodi double-billed hoy tahole pending 0 kore dile
// boidho kaj record korai bondho hoye jabe. Tai ei gulo ALADA, default e OFF.
const APPLY_BILL_ONLY = false;
const JOB_FILTER    = '';     // ekta job e seemabodhho rakhte: 'J04070_25_26'
const TOL           = 0.5;    // eto tuku difference ignore kora hobe
const MAX_CHANGES   = 100000; // safety cap — er beshi hole kichui apply hobe na
const SHOW_ROWS     = 60;     // report e koto ta line dekhabe
const BACKUP_COLLECTION = 'JobopsMaster_pending_backup';
// ----------------------------------------------------------------------------

const d = db.getSiblingDB(DB_NAME);

const r2   = v => Math.round((Number(v) || 0) * 100) / 100;
const norm = s => String(s == null ? '' : s).trim();

const out = [];
const say = l => out.push(l);

// ============================================================================
//  ROLLBACK MODE
// ============================================================================
if (ROLLBACK) {
  const backups = d.getCollection(BACKUP_COLLECTION).find({}).toArray();

  say('');
  say('='.repeat(104));
  say('  ROLLBACK  —  backup collection: ' + BACKUP_COLLECTION);
  say('='.repeat(104));
  say('  backup entries: ' + backups.length);

  if (backups.length === 0) {
    say('  Kichu nei — rollback korar moto kono backup pawa jayni.');
  } else {
    const byDoc = {};
    backups.forEach(b => {
      if (!byDoc[String(b.docId)]) byDoc[String(b.docId)] = [];
      byDoc[String(b.docId)].push(b);
    });

    let restored = 0;
    Object.keys(byDoc).forEach(docIdStr => {
      const entries = byDoc[docIdStr];
      const setDoc = {};
      entries.forEach(e => { setDoc['ops.' + e.opIndex + '.pendingOpsQty'] = e.oldPending; });
      d.getCollection('JobopsMaster').updateOne({ _id: entries[0].docId }, { $set: setDoc });
      restored += entries.length;
    });

    say('  restored operations: ' + restored);
    say('');
    say('  Backup collection ta MUCHE FELA HOYNI. Santushto hole nije muchun:');
    say('    db.getSiblingDB("' + DB_NAME + '").' + BACKUP_COLLECTION + '.drop()');
  }
  say('='.repeat(104));
  say('');
  print(out.join('\n'));
} else {

// ============================================================================
//  NORMAL MODE  (dry run / apply)
// ============================================================================

// ------------------------------------------------- 1. operation naam map ----
const opById = {};
d.getCollection('operations').find({}, { opsName: 1 }).forEach(o => {
  opById[String(o._id)] = norm(o.opsName);
});

// --------------------------------- 2. Contractor_WD e joma kaj (job|opId) ---
// savedInBill nirbishese SOB row dhora hoy: 'No' row gulor qty o pending
// theke age i baad diye deoa hoyeche, tai duto i "kaj hoye geche" bojhay.
const wdByJobOp = {};
d.getCollection('Contractor_WD').find(JOB_FILTER ? { jobId: JOB_FILTER } : {}).forEach(doc => {
  if (doc.isAdhoc === true) return;              // ad-hoc alada collection e, ekhane noy
  const jid = norm(doc.jobId);
  if (!jid) return;
  (doc.opsDone || []).forEach(od => {
    const oid = norm(od.opsId);
    if (!oid || oid === 'null') return;
    const k = jid + '|' + oid;
    if (!wdByJobOp[k]) wdByJobOp[k] = { total: 0, billed: 0, unsaved: 0 };
    const q = Number(od.opsDoneQty || 0);
    wdByJobOp[k].total += q;
    if (norm(od.savedInBill) === 'No') wdByJobOp[k].unsaved += q;
    else wdByJobOp[k].billed += q;
  });
});

// ------------------------------------- 3. context er jonno bill er hisheb ---
const billQty = {};
d.getCollection('Bills').find({}).forEach(b => {
  const dead = Number(b.isDeleted || 0) === 1;
  (b.jobs || []).forEach(j => {
    if (j.isAdhoc) return;
    const jn = norm(j.jobNumber);
    (j.ops || []).forEach(op => {
      const k = [jn, norm(op.opsName), r2(op.rate)].join('|');
      if (!billQty[k]) billQty[k] = { live: 0, dead: 0 };
      if (dead) billQty[k].dead += Number(op.qtyCompleted || 0);
      else      billQty[k].live += Number(op.qtyCompleted || 0);
    });
  });
});

// ------------------------------------------------- 4. ki ki bodlate hobe ----
const decreases = [];   // pending komano, Contractor_WD e sakkhyo ache
const billOnly  = [];   // pending komano, kintu Contractor_WD te KICHUI nei
const increases = [];   // pending barano — pending dorkarer cheye beshi komeche
let opsScanned = 0;
let billHigherCount = 0;   // koto khetre live bill > Contractor_WD
let billHigherQty = 0;     // oi khetre koto qty bill er karone rokkha pelo
let ambiguousCount = 0;    // ekei job e ekei naam+rate er ekadhik op

const jobDocs = d.getCollection('JobopsMaster').find(JOB_FILTER ? { jobId: JOB_FILTER } : {}).toArray();

// Bill gulo (jobNumber, opsName, rate) diye khuje pawa jay — opId diye noy.
// Tai ekei job e ekei naam+rate er duto op thakle kon bill kar seta bola jay na;
// oi khetre bill er hisheb bad diye sudhu Contractor_WD dhora hobe.
const opKeyCount = {};
jobDocs.forEach(j => {
  const jid = norm(j.jobId);
  (j.ops || []).forEach(o => {
    const k = [jid, opById[norm(o.opId)] || '(op doc nei)', r2(o.valuePerBook)].join('|');
    opKeyCount[k] = (opKeyCount[k] || 0) + 1;
  });
});

jobDocs.forEach(j => {
  const jid = norm(j.jobId);

  (j.ops || []).forEach((o, idx) => {
    opsScanned++;
    const oid     = norm(o.opId);
    const total   = Number(o.totalOpsQty || 0);
    const pending = Number(o.pendingOpsQty || 0);
    const done    = (wdByJobOp[jid + '|' + oid] || { total: 0, billed: 0, unsaved: 0 });

    const opsName = opById[oid] || '(op doc nei)';
    const billKey = [jid, opsName, r2(o.valuePerBook)].join('|');
    const bq = billQty[billKey] || { live: 0, dead: 0 };
    const ambiguous = (opKeyCount[billKey] || 0) > 1;

    // Live bill e ja ache seta obosshoi kaj hoye gechhe. Contractor_WD er
    // cheye beshi hole seti i dhora hobe, na hole WD.
    let effectiveDone = done.total;
    if (COUNT_LIVE_BILLS && !ambiguous && bq.live > done.total + TOL) {
      billHigherCount++;
      billHigherQty += r2(bq.live - done.total);
      effectiveDone = bq.live;
    }
    if (ambiguous) ambiguousCount++;

    // Packaging segment e kaj total er cheye beshi hote pare, tai clamp.
    const newPending = Math.max(0, Math.min(total, total - effectiveDone));
    const delta = r2(newPending - pending);
    if (Math.abs(delta) <= TOL) return;

    const rec = {
      docId: j._id,
      jobId: jid,
      opId: oid,
      opIndex: idx,
      opsName: opsName,
      total: total,
      oldPending: pending,
      newPending: newPending,
      delta: delta,
      done: done.total,
      effectiveDone: effectiveDone,
      usedBill: effectiveDone !== done.total,
      ambiguous: ambiguous,
      doneBilled: done.billed,
      doneUnsaved: done.unsaved,
      billLive: bq.live,
      billDead: bq.dead
    };

    if (delta > 0) increases.push(rec);
    else if (rec.done > TOL) decreases.push(rec);   // Contractor_WD e sakkhyo ache
    else billOnly.push(rec);                        // sudhu bill er upor dariye
  });
});

let planned = decreases.slice();
if (APPLY_BILL_ONLY) planned = planned.concat(billOnly);
if (FIX_INCREASES)   planned = planned.concat(increases);

// ---------------------------------------------------------------- report ----
const line = r =>
  '  ' + r.jobId.padEnd(17) + String(r.opsName).slice(0, 26).padEnd(28) +
  'total=' + String(r.total).padEnd(10) +
  'pending ' + String(r.oldPending).padEnd(10) + '-> ' + String(r.newPending).padEnd(10) +
  'done=' + String(r.done).padEnd(10) +
  'bill[live=' + r.billLive + ' del=' + r.billDead + ']' +
  (r.usedBill ? '  <- bill>wd, bill er hisheb dhora holo' : '') +
  (r.ambiguous ? '  <- ekei naam+rate er ekadhik op, bill bad deoa holo' : '');

say('');
say('='.repeat(104));
say('  JobopsMaster pendingOpsQty CLEANUP   db: ' + DB_NAME +
    (JOB_FILTER ? '   job: ' + JOB_FILTER : '   (sob job)'));
say('  MODE: ' + (APPLY ? '*** APPLY — data bodlabe ***' : 'DRY RUN — kichui bodlabe na'));
say('='.repeat(104));
say('  kaj hoyeche hisheb              : ' +
    (COUNT_LIVE_BILLS ? 'max(Contractor_WD, live bill)' : 'sudhu Contractor_WD  ⚠ NIRAPOD NOY'));
say('  JobopsMaster operations scanned : ' + opsScanned);
say('  live bill > Contractor_WD       : ' + billHigherCount + ' operation, ' + r2(billHigherQty) + ' qty');
say('     ^ ei qty ta purono delete bug e Contractor_WD theke hariye gechhilo.');
say('       Bill dhora na hole ei tuku abar pending hoye jeto — othocho already bill hoye gechhe.');
say('  ekei naam+rate er ekadhik op    : ' + ambiguousCount + '  (ei gulo te bill bad diye sudhu WD dhora hoyeche)');
say('');
say('  A1) pending komano, WD te sakkhyo ache : ' + decreases.length + '  (apply hobe)');
say('  A2) pending komano, SUDHU bill er vitti : ' + billOnly.length +
    (APPLY_BILL_ONLY ? '  (apply hobe)' : '  (apply hobe NA — APPLY_BILL_ONLY = false)'));
say('  B)  pending barano                     : ' + increases.length +
    (FIX_INCREASES ? '  (apply hobe)' : '  (apply hobe NA — FIX_INCREASES = false)'));
say('  ------------------------------------------------------');
say('  mot je gulo bodlano hobe               : ' + planned.length);

say('');
say('-'.repeat(104));
say('A1)  PENDING KOMANO  —  Contractor_WD te kaj er sakkhyo ACHE   [apply hobe]');
say('-'.repeat(104));
say('  Contractor_WD bolche kaj hoyeche, othocho pending kome ni. Ei gulo tei asol somossa:');
say('  pending beshi dekhacche, tai ekei kaj abar record ar bill kora jachhe.');
say('');
if (!decreases.length) say('  (kichu nei)');
decreases.slice(0, SHOW_ROWS).forEach(r => say(line(r)));
if (decreases.length > SHOW_ROWS) say('  ... aro ' + (decreases.length - SHOW_ROWS) + ' ta');

say('');
say('-'.repeat(104));
say('A2)  PENDING KOMANO  —  Contractor_WD te KICHUI NEI (done=0), sudhu live bill ache' +
    (APPLY_BILL_ONLY ? '   [apply hobe]' : '   [apply hobe NA]'));
say('-'.repeat(104));
say('  Ei gulo te WD er kono sakkhyo nei — siddhanto ta puro bill er upor dariye.');
say('  Sombhabbo karon: purono delete bug WD row muche diye pending puro phirie diyechhilo,');
say('  kintu live bill ta thekei geche. Seta thik hole pending 0 kora sothik.');
say('  KINTU bill ta jodi DOUBLE-BILLED hoy, tahole pending 0 kore dile boidho kaj record');
say('  korai atke jabe. Tai age double-billing check ta sere nin.');
say('');
if (!billOnly.length) say('  (kichu nei)');
billOnly.slice(0, SHOW_ROWS).forEach(r => say(line(r)));
if (billOnly.length > SHOW_ROWS) say('  ... aro ' + (billOnly.length - SHOW_ROWS) + ' ta');

say('');
say('-'.repeat(104));
say('B)   PENDING BARANO DORKAR  —  pending dorkarer cheye beshi kome geche');
say('-'.repeat(104));
say('  Ei gulo te boidho kaj thakleo pending kom dekhabe. Pending BARANO mane notun kaj record');
say('  korar sujog toiri kora, tai ei ta default e apply kora hoy NA. Hate dekhe nishchit hoye');
say('  tarpor FIX_INCREASES = true korun.');
say('');
if (!increases.length) say('  (kichu nei)');
increases.slice(0, SHOW_ROWS).forEach(r => say(line(r)));
if (increases.length > SHOW_ROWS) say('  ... aro ' + (increases.length - SHOW_ROWS) + ' ta');

// ----------------------------------------------------------------- apply ----
say('');
say('='.repeat(104));

if (!APPLY) {
  say('  DRY RUN sesh — DATABASE E KICHUI BODLANO HOYNI.');
  say('');
  say('  Upor er list ta dekhe santushto hole:');
  say('    1. Atlas e ekta snapshot niye rakhun');
  say('    2. keu jeno system use na kore seta nishchit korun');
  say('    3. ei file e APPLY = true korun, tarpor abar cholan');
  say('');
  say('  Apply korle purono value gulo "' + BACKUP_COLLECTION + '" collection e rakha hobe,');
  say('  jate ROLLBACK = true diye phire asa jay.');
} else if (planned.length === 0) {
  say('  Bodlanor moto kichu nei.');
} else if (planned.length > MAX_CHANGES) {
  say('  THAMANO HOLO: ' + planned.length + ' ta change, kintu MAX_CHANGES = ' + MAX_CHANGES + '.');
  say('  KICHUI APPLY KORA HOYNI. Ei songkhya ta expected kina dekhe MAX_CHANGES baran.');
} else {
  // 1. purono value backup
  const stamp = new Date();
  const backupDocs = planned.map(r => ({
    docId: r.docId,
    jobId: r.jobId,
    opId: r.opId,
    opIndex: r.opIndex,
    opsName: r.opsName,
    oldPending: r.oldPending,
    newPending: r.newPending,
    totalOpsQty: r.total,
    recordedDone: r.done,
    runAt: stamp
  }));
  d.getCollection(BACKUP_COLLECTION).insertMany(backupDocs);

  // 2. per-document e sudhu pendingOpsQty field ta bodlano hoy —
  //    puro ops array replace kora hoy na, tai onno kono field e hat pore na.
  const byDoc = {};
  planned.forEach(r => {
    const k = String(r.docId);
    if (!byDoc[k]) byDoc[k] = { _id: r.docId, set: {} };
    byDoc[k].set['ops.' + r.opIndex + '.pendingOpsQty'] = r.newPending;
  });

  const bulk = Object.keys(byDoc).map(k => ({
    updateOne: { filter: { _id: byDoc[k]._id }, update: { $set: byDoc[k].set } }
  }));

  let modified = 0;
  for (let i = 0; i < bulk.length; i += 500) {
    const res = d.getCollection('JobopsMaster').bulkWrite(bulk.slice(i, i + 500));
    modified += res.modifiedCount || 0;
  }

  say('  APPLY sesh.');
  say('    operations bodlano hoyeche : ' + planned.length);
  say('    JobopsMaster document      : ' + modified);
  say('    backup rakha hoyeche       : ' + BACKUP_COLLECTION + ' (' + backupDocs.length + ' entry)');
  say('');
  say('  Phire jete chaile ei file e ROLLBACK = true kore abar cholan.');
}

say('='.repeat(104));
say('');
print(out.join('\n'));

}
