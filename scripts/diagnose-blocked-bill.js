// ============================================================================
//  BILL SUBMIT BLOCK HOLE KI KORBEN  —  READ ONLY
//
//  "N operation(s) would be billed past what the job holds" error ta ele,
//  oi job er protita operation e ki obostha, seta ek jaygay dekhay:
//
//    totalOps     JobopsMaster e ei op er mot qty
//    liveBilled   non-deleted bill gulo te ei op er mot qty (bill number soho)
//    wdBilled     Contractor_WD e savedInBill != 'No' row gulor jog
//    wdUnsaved    Contractor_WD e savedInBill == 'No' row gulor jog
//    VERDICT      kno atke ache, ar ki kora uchit
//
//  DUTO ALADA KARON, PROTIKAR ULTO — tai nije theke kichu korben na:
//
//   A) MARKING FAILED : bill ta toiri hoye geche, kintu Contractor_WD row gulo
//      'No' e e rye geche (liveBilled ache, wdBilled nei, wdUnsaved = liveBilled).
//      => row gulo DELETE korle kaj ta Contractor_WD theke uthe jabe othocho
//         bill e thekei jabe. Tokhon pending abar puro hoye jabe ar keu abar
//         kaj ta dhukiye debe. Thik kaj: row gulo BILLED mark kora.
//
//   B) DUPLICATE ENTRY : kaj ta ekbar bill hoye geche (wdBilled = liveBilled)
//      ar tar uporeo notun kore same qty save hoye ache (wdUnsaved > 0).
//      => Bill Details theke oi row gulo DELETE kora e thik.
//
//  ⚠  KICHUI CHANGE KORE NA.
//
//  Chalanor niyom (backend folder theke):
//    mongosh "<URI>" --file scripts/diagnose-blocked-bill.js > blocked.txt
//
//  Job number ar contractor niche din, ba environment variable diye:
//    JOB_NUMBER="J03018/25-26" mongosh "<URI>" --file scripts/...
// ============================================================================

// ---------------------------------------------------------------- settings --
const DB_NAME       = 'Contractor_PO';
const JOB_NUMBER    = (typeof process !== 'undefined' && process.env && process.env.JOB_NUMBER)
  || 'J03018/25-26';                 // <-- je job er bill atke geche
const CONTRACTOR_ID = (typeof process !== 'undefined' && process.env && process.env.CONTRACTOR_ID)
  || '';                             // <-- faka rakhle sob contractor
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
say('='.repeat(120));
say('  BLOCKED BILL DIAGNOSE   job: ' + JOB_NUMBER +
    (CONTRACTOR_ID ? '   contractor: ' + CONTRACTOR_ID : '   (sob contractor)'));
say('='.repeat(120));

const jom = d.JobopsMaster.findOne({ jobId: JOB_NUMBER });
if (!jom) {
  say('');
  say('  JobopsMaster e ei job nei: ' + JOB_NUMBER);
  say('  job number ta hubohu milche to? (slash / underscore kheyal korun)');
  print(out.join('\n'));
} else {

  const segment   = norm(jom.segmentName);
  const totalQty  = num(jom.totalQty);
  const allowance = segment === 'Packaging' && totalQty > 0
    ? Math.round(totalQty * PACKAGING_ALLOWANCE_PCT / 100)
    : 0;

  say('');
  say('  segmentName : ' + (segment || '(faka)') + '     totalQty: ' + totalQty +
      '     allowance: ' + allowance);

  // ------------------------------------------------------- operation names --
  const opObjIds = [];
  (jom.ops || []).forEach(o => { try { opObjIds.push(new ObjectId(norm(o.opId))); } catch (e) {} });
  const nameById = {};
  d.operations.find({ _id: { $in: opObjIds } }).forEach(o => {
    nameById[o._id.toString()] = norm(o.opsName);
  });

  // ------------------------------------------- Contractor_WD e joma kaj ----
  const wdFilter = { jobId: JOB_NUMBER, isAdhoc: { $ne: true } };
  if (CONTRACTOR_ID) wdFilter.contractorId = CONTRACTOR_ID;

  const wdByOp = {};
  d.Contractor_WD.find(wdFilter).forEach(doc => {
    (doc.opsDone || []).forEach(od => {
      const k = norm(od.opsId);
      if (!k) return;
      if (!wdByOp[k]) wdByOp[k] = { billed: 0, unsaved: 0, rows: [] };
      const q = num(od.opsDoneQty);
      const unsaved = /^\s*No\s*$/i.test(String(od.savedInBill == null ? '' : od.savedInBill));
      if (unsaved) wdByOp[k].unsaved += q; else wdByOp[k].billed += q;
      wdByOp[k].rows.push({
        contractorId: norm(doc.contractorId),
        qty: q,
        rate: r2(od.valuePerBook),
        savedInBill: String(od.savedInBill == null ? '(nei)' : od.savedInBill),
        on: od.completionDate
          ? new Date(od.completionDate).toISOString().slice(0, 19).replace('T', ' ') : '(nei)'
      });
    });
  });

  // --------------------------------------------- live bill e ei op er qty --
  const billedByOp   = {};
  const billedByName = {};
  const billsByOp    = {};
  const billFilter = { isDeleted: { $ne: true }, 'jobs.jobNumber': JOB_NUMBER };
  d.Bills.find(billFilter).forEach(b => {
    if (CONTRACTOR_ID && norm(b.contractorId) && norm(b.contractorId) !== CONTRACTOR_ID) return;
    (b.jobs || []).forEach(j => {
      if (norm(j.jobNumber) !== JOB_NUMBER) return;
      (j.ops || []).forEach(op => {
        const q  = num(op.qtyCompleted);
        const id = norm(op.opId);
        const nk = norm(op.opsName) + '|' + r2(op.rate);
        if (id) billedByOp[id] = (billedByOp[id] || 0) + q;
        billedByName[nk] = (billedByName[nk] || 0) + q;
        const key = id || nk;
        if (!billsByOp[key]) billsByOp[key] = [];
        billsByOp[key].push(b.billNumber + (b.paymentStatus === 'Yes' ? '(PAID)' : '') + ':' + q);
      });
    });
  });

  // ------------------------------------------------------------ per op ----
  say('');
  say('-'.repeat(120));
  say('  ' + pad('OPERATION', 30) + rpad('totalOps', 10) + rpad('liveBilled', 12) +
      rpad('wdBilled', 10) + rpad('wdUnsaved', 11) + '  VERDICT');
  say('-'.repeat(120));

  const counts = { A: 0, B: 0, OK: 0, OTHER: 0 };

  (jom.ops || []).forEach(op => {
    const id   = norm(op.opId);
    const name = nameById[id] || '(naam pai ni)';
    const total = num(op.totalOpsQty);
    const wd    = wdByOp[id] || { billed: 0, unsaved: 0, rows: [] };
    const live  = billedByOp[id] != null
      ? billedByOp[id]
      : (billedByName[name + '|' + r2(op.valuePerBook)] || 0);

    let verdict;
    if (wd.unsaved <= TOL) {
      verdict = 'OK — unbilled kichu nei';
      counts.OK++;
    } else if (live > TOL && wd.billed <= TOL && Math.abs(wd.unsaved - live) <= TOL) {
      verdict = 'A) MARKING FAILED — bill ache kintu row ta ekhono No. Row ta BILLED mark korte hobe, DELETE noy';
      counts.A++;
    } else if (live > TOL && Math.abs(wd.billed - live) <= TOL) {
      verdict = 'B) DUPLICATE ENTRY — ei kaj ekbar bill hoye geche. Bill Details theke oi row ' + wd.unsaved + ' DELETE korun';
      counts.B++;
    } else if (live <= TOL) {
      verdict = 'NOTUN KAJ — kono bill e nei, ei row ta bill kora jabe';
      counts.OTHER++;
    } else {
      verdict = 'DEKHTE HOBE — wdBilled(' + wd.billed + ') ar liveBilled(' + live + ') mileni';
      counts.OTHER++;
    }
    if (live + wd.unsaved > total + allowance + TOL) {
      verdict += '  |  submit korle ' + r2(live + wd.unsaved - total - allowance) + ' beshi hoye jabe';
    }

    say('  ' + pad(name, 30) + rpad(total, 10) + rpad(live, 12) +
        rpad(wd.billed, 10) + rpad(wd.unsaved, 11) + '  ' + verdict);
  });

  // ------------------------------------------------------- WD row detail --
  say('');
  say('-'.repeat(120));
  say('  CONTRACTOR_WD ROWS  (jonno: kon row ta No, kobe save hoyeche)');
  say('-'.repeat(120));
  let any = false;
  Object.keys(wdByOp).forEach(id => {
    const name = nameById[id] || '(naam pai ni)';
    const billNums = (billsByOp[id] || []).join(', ') || '(kono live bill nei)';
    say('  ' + name + '   [opId ' + id + ']   bills: ' + billNums);
    wdByOp[id].rows.forEach(r => {
      any = true;
      say('      ' + pad(r.contractorId, 26) + rpad(r.qty, 10) + '  rate ' + rpad(r.rate, 8) +
          '  savedInBill=' + pad(r.savedInBill, 8) + '  ' + r.on);
    });
  });
  if (!any) say('  (ei job e Contractor_WD te kono row nei)');

  say('');
  say('='.repeat(120));
  say('  JOG: A) marking failed = ' + counts.A + '    B) duplicate entry = ' + counts.B +
      '    OK = ' + counts.OK + '    onnanno = ' + counts.OTHER);
  say('');
  say('  A beshi hole  : bill ta toiri hoye geche, shudhu mark hoyni. Row DELETE korben NA.');
  say('  B beshi hole  : Bill Details theke oi row gulo delete korai thik.');
  say('  Mishe gele    : output ta pathiye den, ek ek kore dekhe bola jabe.');
  say('='.repeat(120));
  say('');

  print(out.join('\n'));
}
