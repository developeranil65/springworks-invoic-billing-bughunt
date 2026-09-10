# My bug report — 09

You reported 9 confirmed bugs. For Phase 2, write an automated test that FAILS because of each one — fixing them is an optional bonus.

## 1. UI — wrong-status-badge-color

Issue: PAID and INVOICE_ISSUED invoices use the same blue status badge, making the two statuses visually indistinguishable.
Expected vs actual: Expected: PAID and INVOICE_ISSUED should use clearly different status badge colors.
Actual: Both statuses map to the blue CSS class.

## 2. UI — wrong-format-display

Issue: Invoice amounts are displayed without the ₹ symbol and without Indian lakh-style digit grouping.
Expected vs actual: Expected: Amounts should be displayed in Indian currency format such as ₹1,82,900.00.
Actual: Amounts are displayed as 182900.00.

## 3. UI — missing-ui-feedback-guard

Issue: The application displays "Invoice created" without checking whether the invoice creation request actually succeeded.
Expected vs actual: Expected: A success message should appear only after a successful invoice creation response.
Actual: "Invoice created" is displayed even when the API returns an error.

## 4. POST /api/invoices/:id/credit-note — missing-boundary-check

Issue: The credit-note amount is not validated before submission, allowing blank, zero, or negative amounts.
Expected vs actual: Expected: Invalid credit-note amounts should be rejected before submission.
Actual: The amount is converted with Number() and sent directly to the API.

## 5. GET /api/invoices — stale-or-mismatched-aggregate

Issue: For invoice id 1, GET /api/invoices returns total:1550, balance:1829, while GET /api/invoices/1 returns subtotal:1550, gst:279, total:1829 (no credit notes applied). The list endpoint's "total" field actually holds the subtotal value, and its "balance" field holds the true total value — the two endpoints disagree on the same invoice's total.
Expected vs actual: Expected: total reported consistently as 1829 by both endpoints (balance should also be 1829 since no credit notes exist). Actual: list endpoint reports total as 1550 (= subtotal) and balance as 1829 (= actual total), inconsistent with the detail endpoint and with the "balance = total − credit notes" spec rule.

## 6. POST /api/invoices — wrong-arithmetic

Issue: Creating an invoice with isSez:true still calculates and charges GST at 18% instead of exempting it.
Expected vs actual: Expected gst:0 and total:1000 (= subtotal) when isSez is true, per spec ("SEZ-registered companies are GST-exempt"). Actual: gst:180, total:1180 — GST was charged as if isSez were false.

## 7. POST /api/invoices — missing-boundary-check

Issue: Creating an invoice with a negative qty value is accepted instead of rejected, producing a negative subtotal/gst/total.
Expected vs actual: Expected a 400 error since qty must be > 0 per spec. Actual: request succeeded (201), creating an invoice with subtotal:-500, gst:-90, total:-590.

## 8. POST /api/invoices — type-coercion

Issue: Creating an invoice with a non-numeric qty value ("abc") is accepted instead of rejected, producing NaN/blank values throughout the invoice's calculated fields.
Expected vs actual: Expected a 400 error since qty must be a number per spec. Actual: request succeeded (201), creating an invoice with lineTotal, subtotal, gst, total, and balance all NaN/blank.

## 9. POST /api/invoices/:id/credit-note — wrong-status-code

Issue: Applying a credit note to a non-existent invoice id (9999) returns a 200-level response with an error message in the body, instead of a 404 status.
Expected vs actual: Expected a 404 status code with {error: "Invoice not found"} per spec. Actual: response returns successfully (no HTTP error thrown, unlike the equivalent GET /api/invoices/9999 which does throw a 404) with the same error message, indicating the status code is not actually 404.

