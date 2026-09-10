# Invoice Billing — Phase 2: Bug Regression Tests

## How to Run Tests

```bash
npm install
npm test
```

This runs `jest --verbose --forceExit` against the current (buggy) codebase.
**All tests are designed to FAIL** because they assert spec-correct behavior
and the bugs have not been fixed.

---

## Framework Choice

| Tool | Why |
|---|---|
| **Jest** | Industry-standard JS test runner with rich assertions, clear failure output, and zero config for Node projects. |
| **Supertest** | Lets us test the Express app in-process (no real port needed) while preserving full HTTP semantics (status codes, headers, JSON bodies). |
| **supertest.agent()** | Persists cookies across requests within a test so the session-scoped `sid` cookie is maintained, matching the app's per-session isolation model. |

For **UI/frontend bugs** (1–3), the actual frontend JavaScript (`public/app.js`)
is loaded and evaluated directly in Node.js — no fake DOM stubs needed because
the buggy logic lives in pure JS constants/functions (`STATUS_COLORS`,
`formatCurrency`) or can be verified by static source inspection (missing
response-status guard).

Bug #4 (missing client-side credit-note validation) is tested at the API level
because the server should also reject invalid amounts per the spec's OpenAPI
definition (`400: Invalid amount`). Both the client and server fail to validate.

---

## Bug → Test Mapping

| Bug # | Category | Test Name | What It Proves |
|-------|----------|-----------|----------------|
| 1 | UI | `Bug #1: STATUS_COLORS.PAID must differ from STATUS_COLORS.INVOICE_ISSUED` | PAID and INVOICE_ISSUED use the same "blue" CSS class — should be different colors |
| 2 | UI | `Bug #2: formatCurrency must produce Indian ₹ format with lakh grouping` | `formatCurrency(182900)` returns `"182900.00"` — missing ₹ symbol and Indian grouping |
| 3 | UI | `Bug #3: Invoice creation form must check response success before showing toast` | `showToast('Invoice created')` fires without checking `res.ok`/`res.status` |
| 4 | API | `Bug #4: POST /api/invoices/:id/credit-note must reject zero amount` | Zero amount accepted (200) instead of rejected (400) |
| 4 | API | `Bug #4b: POST /api/invoices/:id/credit-note must reject negative amount` | Negative amount accepted (200) instead of rejected (400) |
| 5 | API | `Bug #5: GET /api/invoices list total must equal detail total (1829, not subtotal 1550)` | List endpoint returns `total: 1550` (subtotal) vs detail endpoint's `total: 1829` |
| 6 | API | `Bug #6: POST /api/invoices with isSez:true must have gst=0 and total=subtotal` | SEZ invoice gets `gst: 180` instead of `gst: 0` — GST exemption not applied |
| 7 | API | `Bug #7: POST /api/invoices with negative qty must return 400` | Negative qty accepted (201) — should be rejected (400) |
| 8 | API | `Bug #8: POST /api/invoices with non-numeric qty must return 400` | `qty: "abc"` accepted (201) producing NaN fields — should be rejected (400) |
| 9 | API | `Bug #9: POST /api/invoices/9999/credit-note must return 404, not 200` | Non-existent invoice returns 200 with error body — should be HTTP 404 |

---

## Test Output (all failing, by design)

```
FAIL __tests__/bugs.test.js (15.835 s)
  × Bug #5: GET /api/invoices list total must equal detail total (1829, not subtotal 1550) (109 ms)
  × Bug #6: POST /api/invoices with isSez:true must have gst=0 and total=subtotal (384 ms)
  × Bug #7: POST /api/invoices with negative qty must return 400 (14 ms)
  × Bug #8: POST /api/invoices with non-numeric qty must return 400 (18 ms)
  × Bug #9: POST /api/invoices/9999/credit-note must return 404, not 200 (14 ms)
  × Bug #1: STATUS_COLORS.PAID must differ from STATUS_COLORS.INVOICE_ISSUED (8 ms)
  × Bug #2: formatCurrency must produce Indian ₹ format with lakh grouping (9 ms)
  × Bug #3: Invoice creation form must check response success before showing toast (6 ms)
  × Bug #4: POST /api/invoices/:id/credit-note must reject zero amount (13 ms)
  × Bug #4b: POST /api/invoices/:id/credit-note must reject negative amount (11 ms)

  ● Bug #5  — Expected: 1829, Received: 1550
  ● Bug #6  — Expected gst: 0, Received: 180
  ● Bug #7  — Expected status: 400, Received: 201
  ● Bug #8  — Expected status: 400, Received: 201
  ● Bug #9  — Expected status: 404, Received: 200
  ● Bug #1  — Expected: not "blue" (both map to "blue")
  ● Bug #2  — Expected substring "₹" in "182900.00"
  ● Bug #3  — Expected hasSuccessCheck: true, Received: false
  ● Bug #4  — Expected status: 400, Received: 200
  ● Bug #4b — Expected status: 400, Received: 200

Test Suites: 1 failed, 1 total
Tests:       10 failed, 10 total
Snapshots:   0 total
```

All 10 tests fail — confirming all 9 bugs exist in the current codebase.

---

## What Was Modified in the Source

Only one minimal change was made to `server.js` to make it testable:

```diff
-app.listen(PORT, () => {
-  console.log(`invoice-billing listening on port ${PORT}`);
-});
+if (require.main === module) {
+  app.listen(PORT, () => {
+    console.log(`invoice-billing listening on port ${PORT}`);
+  });
+}
+
+module.exports = app;
```

This is a **non-functional change** — the app runs identically via `npm start`.
It simply allows `require('./server')` from tests without binding a port.
