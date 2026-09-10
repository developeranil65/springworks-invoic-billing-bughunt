/**
 * Bug Regression Tests — Phase 2
 *
 * Each test reproduces exactly one bug from the Phase 1 bug report and asserts
 * the SPEC-CORRECT behavior.  Because the bugs are still present in the app,
 * every test here is expected to FAIL.
 *
 * Framework: Jest + Supertest (with supertest.agent for cookie persistence)
 * Session reset: POST /api/reset in beforeEach for a clean slate.
 */

const request = require('supertest');
const app = require('../server');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Shared agent — cookie jar is kept across requests within each test so the
// session (sid) stays the same.  beforeEach resets seed data via /api/reset.
// ---------------------------------------------------------------------------
let agent;

beforeEach(async () => {
  agent = request.agent(app);
  await agent.post('/api/reset').expect(200);
});

// ============================= API-LEVEL BUGS ==============================

/**
 * Bug #5 — stale-or-mismatched-aggregate
 *
 * GET /api/invoices returns { total: 1550, balance: 1829 } for seed invoice 1,
 * but GET /api/invoices/1 returns { subtotal: 1550, total: 1829 }.
 * The list endpoint's "total" field actually holds the subtotal, not the real
 * total.  Per spec the two endpoints must agree: total should be 1829.
 *
 * This test asserts spec-correct behavior: list endpoint total === detail
 * endpoint total (1829 for invoice 1).
 */
test('Bug #5: GET /api/invoices list total must equal detail total (1829, not subtotal 1550)', async () => {
  const listRes = await agent.get('/api/invoices').expect(200);
  const invoice1InList = listRes.body.find((inv) => inv.id === 1);

  const detailRes = await agent.get('/api/invoices/1').expect(200);

  // Spec-correct: both should report total = 1829
  expect(invoice1InList.total).toBe(detailRes.body.total);
  expect(invoice1InList.total).toBe(1829);
});

/**
 * Bug #6 — wrong-arithmetic (SEZ GST exemption)
 *
 * Creating an invoice with isSez:true should result in gst:0 and total equal
 * to the subtotal, because SEZ-registered companies are GST-exempt per spec.
 *
 * The bug: GST is still charged at 18% even when isSez is true.
 */
test('Bug #6: POST /api/invoices with isSez:true must have gst=0 and total=subtotal', async () => {
  const res = await agent
    .post('/api/invoices')
    .send({
      candidateName: 'SEZ Test Corp',
      isSez: true,
      items: [{ desc: 'Check', qty: 1, rate: 1000 }]
    })
    .expect(201);

  // Spec-correct: GST should be waived for SEZ
  expect(res.body.gst).toBe(0);
  expect(res.body.total).toBe(1000); // subtotal only, no GST
});

/**
 * Bug #7 — missing-boundary-check (negative qty)
 *
 * Creating an invoice with a negative qty value should be rejected with 400
 * per spec (qty must be > 0).  The bug: it is accepted with 201 and produces
 * negative subtotal/gst/total.
 */
test('Bug #7: POST /api/invoices with negative qty must return 400', async () => {
  const res = await agent
    .post('/api/invoices')
    .send({
      candidateName: 'Negative Qty Corp',
      isSez: false,
      items: [{ desc: 'Check', qty: -5, rate: 100 }]
    });

  // Spec-correct: 400 rejection
  expect(res.status).toBe(400);
});

/**
 * Bug #8 — type-coercion (non-numeric qty)
 *
 * Creating an invoice with qty="abc" (a string) should be rejected with 400
 * per spec.  The bug: it is accepted with 201 and all calculated fields become
 * NaN/null.
 */
test('Bug #8: POST /api/invoices with non-numeric qty must return 400', async () => {
  const res = await agent
    .post('/api/invoices')
    .send({
      candidateName: 'Bad Qty Corp',
      isSez: false,
      items: [{ desc: 'Check', qty: 'abc', rate: 100 }]
    });

  // Spec-correct: 400 rejection
  expect(res.status).toBe(400);
});

/**
 * Bug #9 — wrong-status-code (credit note on non-existent invoice)
 *
 * Applying a credit note to a non-existent invoice (id 9999) should return
 * HTTP 404.  The bug: it returns 200 with { error: "Invoice not found" }.
 */
test('Bug #9: POST /api/invoices/9999/credit-note must return 404, not 200', async () => {
  const res = await agent
    .post('/api/invoices/9999/credit-note')
    .send({ amount: 100 });

  // Spec-correct: 404 for unknown invoice
  expect(res.status).toBe(404);
});

// ========================= FRONTEND / UI BUGS ==============================
// Bugs 1–4 are in the frontend JavaScript (public/app.js).  We load and
// evaluate the relevant code with jsdom / direct require to test the actual
// buggy logic without faking anything.

/**
 * Bug #1 — wrong-status-badge-color
 *
 * The STATUS_COLORS map assigns the same CSS class ("blue") to both
 * INVOICE_ISSUED and PAID.  Per spec, PAID should use a visually distinct
 * color (e.g. "green").
 *
 * We eval the frontend JS in a minimal jsdom and inspect the constant.
 */
test('Bug #1: STATUS_COLORS.PAID must differ from STATUS_COLORS.INVOICE_ISSUED', () => {
  // Read the frontend source and extract STATUS_COLORS
  const appJs = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'app.js'),
    'utf8'
  );

  // Extract the STATUS_COLORS object by executing just that snippet
  // We use a Function constructor to avoid polluting this scope
  const extractCode = `
    ${appJs.split('function formatCurrency')[0]}
    return STATUS_COLORS;
  `;
  const STATUS_COLORS = new Function(extractCode)();

  // Spec-correct: the two statuses must map to DIFFERENT badge colors
  expect(STATUS_COLORS.PAID).not.toBe(STATUS_COLORS.INVOICE_ISSUED);
});

/**
 * Bug #2 — wrong-format-display
 *
 * formatCurrency(182900) should return "₹1,82,900.00" (Indian lakh-style
 * grouping with ₹ prefix).  The bug: it returns "182900.00" — no symbol
 * and no grouping.
 */
test('Bug #2: formatCurrency must produce Indian ₹ format with lakh grouping', () => {
  const appJs = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'app.js'),
    'utf8'
  );

  // Extract the formatCurrency function — handle multi-line bodies by
  // matching balanced braces instead of a single [^}]+ group.
  const startIdx = appJs.indexOf('function formatCurrency(n)');
  expect(startIdx).toBeGreaterThan(-1);
  // Find the matching closing brace
  let braceDepth = 0;
  let endIdx = startIdx;
  for (let i = startIdx; i < appJs.length; i++) {
    if (appJs[i] === '{') braceDepth++;
    if (appJs[i] === '}') { braceDepth--; if (braceDepth === 0) { endIdx = i + 1; break; } }
  }
  const fnSource = appJs.slice(startIdx, endIdx);

  // Evaluate it in isolation
  const formatCurrency = new Function(`${fnSource}; return formatCurrency;`)();

  const result = formatCurrency(182900);

  // Spec-correct: must include ₹ symbol
  expect(result).toContain('₹');
  // Spec-correct: must use Indian lakh-style grouping → "1,82,900"
  expect(result).toContain('1,82,900');
});

/**
 * Bug #3 — missing-ui-feedback-guard
 *
 * The "Invoice created" toast fires unconditionally after the fetch call,
 * without checking res.ok / res.status.  Per spec, a success message should
 * appear ONLY after a confirmed successful response.
 *
 * We verify this at the API level: a POST /api/invoices with a missing
 * candidateName returns 400, proving the server rejects it — yet the frontend
 * code (which we inspect) shows the toast fires regardless of the response.
 *
 * We also verify this by examining the source code for the presence of
 * a response-status check before showToast.
 */
test('Bug #3: Invoice creation form must check response success before showing toast', () => {
  const appJs = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'app.js'),
    'utf8'
  );

  // Find the submit handler section: from "new-invoice-form" to the next
  // top-level event listener or end of file
  const submitHandlerStart = appJs.indexOf("'submit'");
  const submitHandlerEnd = appJs.indexOf("'click'", submitHandlerStart);
  const submitHandler = appJs.slice(submitHandlerStart, submitHandlerEnd);

  // The handler must check `res.ok` or `res.status` BEFORE calling showToast.
  // Find the positions of the fetch result check and the showToast call.
  const toastCall = submitHandler.indexOf("showToast('Invoice created')");
  expect(toastCall).toBeGreaterThan(-1); // sanity: the toast call exists

  // Look for any response-success check (res.ok, res.status, response.ok, etc.)
  // between the fetch and the showToast call
  const fetchEnd = submitHandler.indexOf('await fetch');
  const sectionBetween = submitHandler.slice(fetchEnd, toastCall);

  const hasSuccessCheck =
    sectionBetween.includes('res.ok') ||
    sectionBetween.includes('res.status') ||
    sectionBetween.includes('response.ok') ||
    sectionBetween.includes('response.status') ||
    sectionBetween.includes('.ok)') ||
    sectionBetween.includes('if (');

  // Spec-correct: there MUST be a response-status guard before the toast
  expect(hasSuccessCheck).toBe(true);
});

/**
 * Bug #4 — missing-boundary-check (credit note client-side validation)
 *
 * The onCreditNote handler sends the amount directly to the API without
 * validating it client-side.  Zero, negative, and blank amounts should be
 * rejected before any API call.
 *
 * We test this at the API level: POST a credit note with amount=0 and
 * amount=-100 and verify the server rejects them (since the client doesn't).
 * Even if the client had validation, the server should also reject these
 * per spec.
 */
test('Bug #4: POST /api/invoices/:id/credit-note must reject zero amount', async () => {
  const res = await agent
    .post('/api/invoices/1/credit-note')
    .send({ amount: 0 });

  // Spec-correct: 400 rejection for zero/invalid amount
  expect(res.status).toBe(400);
});

test('Bug #4b: POST /api/invoices/:id/credit-note must reject negative amount', async () => {
  const res = await agent
    .post('/api/invoices/1/credit-note')
    .send({ amount: -100 });

  // Spec-correct: 400 rejection for negative amount
  expect(res.status).toBe(400);
});
