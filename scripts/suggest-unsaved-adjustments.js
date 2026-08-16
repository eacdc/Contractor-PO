// ============================================================================
//  SAVE HOYECHE KINTU BILL HOYNI — qty adjustment SUGGESTION   (READ ONLY)
//
//  Contractor_WD er savedInBill:'No' row gulo Work Done page e Bill Details e
//  automatic dekha jay. Egulo jodi ekhon SUBMIT kora hoy, tahole oi qty bill e
//  jog hobe. Kintu kono kono op e live bill diye job er totalOpsQty prai (ba
//  puro) sesh hoye gechhe — tokhon ei row gulo submit korle OVER-BILLING hobe.
//
//  Ei script protita row er jonno hisheb kore:
//      jaega baki  = totalOpsQty - (live bill e ja ache)
//      suggestion  = row er qty ke oi jaegar moddhe rakha
//
//  Niyom: delete na kora bill i final source of truth.
//
//  ⚠  EI SCRIPT KICHUI CHANGE KORE NA. Sudhu pore ar suggestion dey.
//     Qty bodlate hole Work Done page theke korun (niche dekhun) — direct DB
//     edit korle pendingOpsQty ar Contractor_WD abar besamal hoye jabe.
//
//  Chalanor niyom:
//    mongosh "<URI>" --file scripts/suggest-unsaved-adjustments.js > unsaved-suggestions.txt
// ============================================================================

// ---------------------------------------------------------------- settings --
const DB_NAME    = 'Contractor_PO';
const JOB_FILTER = '';    // ekta job dekhte: 'J03724_26_27'.  '' = sob
const TOL        = 0.5;
const SHOW_ROWS  = 200;   // koto ta row dekhabe
const CSV        = false; // true = CSV output (Excel e nite)
// ----------------------------------------------------------------------------

const d = db.getSiblingDB(DB_NAME);

const r2   = v => Math.round((Number(v) || 0) * 100) / 100;
const norm = s => String(s == null ? '' : s).trim();
const dstr = v => (v ? new Date(v).toISOString().slice(0, 10) : '-');

const out = [];
const say = l => out.push(l);

// ---------------------------------------------------- 1. lookup table gulo --
const opById = {};
d.getCollection('operations').find({}, { opsName: 1 }).forEach(o => {
  opById[String(o._id)] = norm(o.opsName);
});

const contractorName = {};
d.getCollection('Contractor').find({}, { contractorId: 1, name: 1 }).forEach(c => {
  contractorName[norm(c.contractorId)] = norm(c.name);
});

// job|opId -> { total, segment, rate }
const jobOpInfo = {};
d.getCollection('JobopsMaster').find(JOB_FILTER ? { jobId: JOB_FILTER } : {}).forEach(j => {
  const jid = norm(j.jobId);
  (j.ops || []).forEach(o => {
    jobOpInfo[jid + '|' + norm(o.opId)] = {
      total: Number(o.totalOpsQty || 0),
      segment: norm(j.segmentName),
      rate: r2(o.valuePerBook)
    };
  });
});

// live bill: job|opsName|rate -> qty
const liveBill = {};
d.getCollection('Bills').find({}).forEach(b => {
  if (Number(b.isDeleted || 0) === 1) return;      // deleted bill dhora hoy na
  (b.jobs || []).forEach(j => {
    if (j.isAdhoc) return;
    const jn = norm(j.jobNumber);
    (j.ops || []).forEach(op => {
      const k = [jn, norm(op.opsName), r2(op.rate)].join('|');
      liveBill[k] = (liveBill[k] || 0) + Number(op.qtyCompleted || 0);
    });
  });
});

// --------------------------------------- 2. savedInBill:'No' row gulo tola --
const rows = [];
let adhocSkipped = 0;

d.getCollection('Contractor_WD').find(JOB_FILTER ? { jobId: JOB_FILTER } : {}).forEach(doc => {
  const cid = norm(doc.contractorId);
  const cname = contractorName[cid] || '(unknown: ' + cid + ')';

  (doc.opsDone || []).forEach(od => {
    if (norm(od.savedInBill) !== 'No') return;

    if (doc.isAdhoc === true) { adhocSkipped++; return; }   // ad-hoc alada hisheb

    const jid = norm(doc.jobId);
    const oid = norm(od.opsId);
    const qty = Number(od.opsDoneQty || 0);
    const rate = r2(od.valuePerBook);
    const info = jobOpInfo[jid + '|' + oid] || null;
    const opsName = opById[oid] || norm(od.opsName) || '(op doc nei)';

    rows.push({
      contractor: cname,
      contractorId: cid,
      jobId: jid,
      opId: oid,
      opsName: opsName,
      rate: rate,
      qty: qty,
      value: r2(qty * rate),
      date: dstr(od.completionDate),
      total: info ? info.total : null,
      segment: info ? info.segment : '',
      billKey: [jid, opsName, rate].join('|'),
      groupKey: jid + '|' + oid
    });
  });
});

// ----------------------- 3. ekei job+op e ekadhik contractor thakte pare ----
const groupUnsaved = {};
rows.forEach(r => { groupUnsaved[r.groupKey] = (groupUnsaved[r.groupKey] || 0) + r.qty; });

const groupContractors = {};
rows.forEach(r => {
  if (!groupContractors[r.groupKey]) groupContractors[r.groupKey] = {};
  groupContractors[r.groupKey][r.contractor] = true;
});

// ------------------------------------------------- 4. suggestion hisheb -----
const OK = [], TRIM = [], DROP = [], UNKNOWN = [];

rows.forEach(r => {
  if (r.total == null) {
    r.verdict = 'UNKNOWN';
    r.note = 'JobopsMaster e ei job+op paoa jayni — hate dekhte hobe';
    UNKNOWN.push(r);
    return;
  }

  const billed  = liveBill[r.billKey] || 0;
  const room    = r2(r.total - billed);              // ar koto ta bill kora jay
  const groupQty = groupUnsaved[r.groupKey] || 0;    // sob contractor mile dabi
  const shared  = Object.keys(groupContractors[r.groupKey] || {}).length > 1;

  r.billed = billed;
  r.room = room;
  r.groupQty = groupQty;
  r.shared = shared;

  if (room <= TOL) {
    // Job er ei op e ar ek tao bill kora jabe na — puro row tai baad
    r.suggested = 0;
    r.cut = r.qty;
    r.verdict = 'DROP';
    r.note = billed >= r.total
      ? 'Live bill eii totalOpsQty sesh (' + billed + '/' + r.total + ') — ei row submit korle over-billing hobe'
      : 'Jaega nei';
    DROP.push(r);
  } else if (groupQty > room + TOL) {
    // Dabi jaegar cheye beshi — anupate kome ana hobe
    const share = groupQty > 0 ? r.qty / groupQty : 0;
    const suggested = Math.max(0, Math.floor(room * share));
    r.suggested = suggested;
    r.cut = r2(r.qty - suggested);
    r.verdict = 'TRIM';
    r.note = 'billed ' + billed + '/' + r.total + ', jaega baki ' + room +
             ', kintu dabi ' + groupQty + (shared ? ' (ekadhik contractor — anupate bhag kora holo)' : '');
    TRIM.push(r);
  } else {
    r.suggested = r.qty;
    r.cut = 0;
    r.verdict = 'OK';
    r.note = 'jaega ache (' + room + ') — bodlanor dorkar nei';
    OK.push(r);
  }
});

// ------------------------------------------------------------------ output --
const sumV = a => r2(a.reduce((s, x) => s + (x.value || 0), 0));
const sumCutV = a => r2(a.reduce((s, x) => s + (x.cut || 0) * (x.rate || 0), 0));

if (CSV) {
  say('verdict,contractor,job,operation,rate,savedOn,currentQty,suggestedQty,cutQty,cutValue,liveBilled,totalOpsQty,roomLeft,note');
  [].concat(DROP, TRIM, OK, UNKNOWN).forEach(r => {
    const esc = v => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, "'") + '"' : s;
    };
    say([r.verdict, r.contractor, r.jobId, r.opsName, r.rate, r.date, r.qty,
         r.suggested, r.cut, r2((r.cut || 0) * r.rate), r.billed, r.total, r.room, r.note]
        .map(esc).join(','));
  });
} else {
  const line = r =>
    '  ' + r.date + '  ' + String(r.contractor).slice(0, 22).padEnd(24) +
    r.jobId.padEnd(17) + String(r.opsName).slice(0, 26).padEnd(28) +
    'qty ' + String(r.qty).padEnd(9) + '-> ' + String(r.suggested).padEnd(9) +
    'kombe ' + String(r.cut).padEnd(9) + 'value ' + r2((r.cut || 0) * r.rate);

  say('');
  say('='.repeat(120));
  say('  SAVE HOYECHE KINTU BILL HOYNI — qty adjustment SUGGESTION   db: ' + DB_NAME +
      (JOB_FILTER ? '   job: ' + JOB_FILTER : '   (sob job)'));
  say('='.repeat(120));
  say('  NIYOM: delete na kora bill i final truth.  jaega baki = totalOpsQty - live bill er qty');
  say('');
  say('  savedInBill:"No" row (job)     : ' + rows.length + '   mot value ' + sumV(rows));
  say('  ad-hoc row (ekhane dhora hoyni): ' + adhocSkipped);
  say('');
  say('  OK      — jemon ache temon i thakuk : ' + OK.length + '   value ' + sumV(OK));
  say('  TRIM    — qty kombe                 : ' + TRIM.length + '   kombe value ' + sumCutV(TRIM));
  say('  DROP    — puro row baad deoa uchit  : ' + DROP.length + '   kombe value ' + sumCutV(DROP));
  say('  UNKNOWN — hate dekhte hobe          : ' + UNKNOWN.length);
  say('');
  say('  jodi kichui na kora hoy ar sob submit kore deoa hoy, tahole OVER-BILLING hobe: ' +
      r2(sumCutV(TRIM) + sumCutV(DROP)));

  say('');
  say('-'.repeat(120));
  say('1)  DROP  —  ei op e live bill diye totalOpsQty sesh, ar ek tao bill kora jabe na');
  say('-'.repeat(120));
  if (!DROP.length) say('  (kichu nei)');
  DROP.slice(0, SHOW_ROWS).forEach(r => { say(line(r)); say('        ' + r.note); });
  if (DROP.length > SHOW_ROWS) say('  ... aro ' + (DROP.length - SHOW_ROWS) + ' ta');

  say('');
  say('-'.repeat(120));
  say('2)  TRIM  —  jaega ache kintu dabi tar cheye beshi');
  say('-'.repeat(120));
  if (!TRIM.length) say('  (kichu nei)');
  TRIM.slice(0, SHOW_ROWS).forEach(r => { say(line(r)); say('        ' + r.note); });
  if (TRIM.length > SHOW_ROWS) say('  ... aro ' + (TRIM.length - SHOW_ROWS) + ' ta');

  say('');
  say('-'.repeat(120));
  say('3)  UNKNOWN  —  JobopsMaster e job+op paoa jayni');
  say('-'.repeat(120));
  if (!UNKNOWN.length) say('  (kichu nei)');
  UNKNOWN.slice(0, SHOW_ROWS).forEach(r =>
    say('  ' + r.date + '  ' + String(r.contractor).slice(0, 22).padEnd(24) + r.jobId.padEnd(17) +
        String(r.opsName).slice(0, 26).padEnd(28) + 'qty ' + r.qty + '   ' + r.note));

  say('');
  say('-'.repeat(120));
  say('4)  OK  —  ei gulo nirbighne submit kora jay');
  say('-'.repeat(120));
  if (!OK.length) say('  (kichu nei)');
  const byContractor = {};
  OK.forEach(r => {
    if (!byContractor[r.contractor]) byContractor[r.contractor] = { n: 0, v: 0 };
    byContractor[r.contractor].n++;
    byContractor[r.contractor].v = r2(byContractor[r.contractor].v + r.value);
  });
  Object.keys(byContractor).sort().forEach(c =>
    say('  ' + String(c).slice(0, 30).padEnd(32) + byContractor[c].n + ' row,  value ' + byContractor[c].v));

  say('');
  say('='.repeat(120));
  say('  KIVABE ADJUST KORBEN');
  say('='.repeat(120));
  say('  Direct DB edit korben NA — tahole pendingOpsQty ar Contractor_WD abar besamal hobe.');
  say('  Work Done page theke korun, tahole backend nijei pending thik kore debe:');
  say('');
  say('    DROP er jonno :  contractor + job search korun -> Bill Details e oi row er');
  save_hint();
  say('    TRIM er jonno :  age oi bhabe Delete korun (pending phire ashbe), tarpor');
  say('                     Operations Pending e suggested qty ta likhe abar SAVE korun.');
  say('');
  say('  Sob adjust hoye gele fix-pending-qty.js abar ekbar dry run cholan — tokhon');
  say('  pending er hisheb notun obostha onujayi mile jabe.');
  say('');
  say('  NOTE: ei script kichui change kore ni.');
  say('='.repeat(120));
  say('');
}

function save_hint() {
  say('                     "Delete" tipun. Eta /work/unsave call kore, row muche debe');
  say('                     ar pending qty ferot debe.');
}

print(out.join('\n'));
