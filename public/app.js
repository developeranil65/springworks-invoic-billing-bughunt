// FIX #1: PAID uses a distinct 'green' badge color, not 'blue'.
const STATUS_COLORS = {
  INVOICE_ISSUED: 'blue',
  PAID: 'green'
};

function formatCurrency(n) {
  // FIX #2: use Indian locale with ₹ symbol and lakh-style digit grouping.
  return Number(n).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2000);
}

async function loadInvoices() {
  const res = await fetch('/api/invoices');
  const invoices = await res.json();
  const body = document.getElementById('invoice-body');
  body.innerHTML = invoices.map((inv) => `
    <tr data-id="${inv.id}">
      <td>${inv.candidateName}</td>
      <!-- BUG: Total and Balance columns are swapped - the "Total" header
      renders inv.balance and the "Balance" header renders inv.total. -->
      <td class="total-cell">${formatCurrency(inv.balance)}</td>
      <td class="balance-cell">${formatCurrency(inv.total)}</td>
      <td><span class="badge ${STATUS_COLORS[inv.status] || 'gray'}">${inv.status}</span></td>
      <td>
        <input type="number" class="cn-amount" placeholder="Amount" />
        <button class="cn-submit" data-id="${inv.id}">Apply</button>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('.cn-submit').forEach((btn) => {
    btn.addEventListener('click', () => onCreditNote(btn));
  });
}

async function onCreditNote(btn) {
  const row = btn.closest('tr');
  const amountInput = row.querySelector('.cn-amount');
  const amount = Number(amountInput.value);
  // BUG: no client-side validation - a blank, zero, or negative amount is
  // sent straight to the API instead of being rejected up front.

  const res = await fetch(`/api/invoices/${btn.dataset.id}/credit-note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount })
  });
  const updated = await res.json();

  // BUG: only this single row's balance cell is patched in place - the
  // rest of the table (and the invoice detail elsewhere) is never
  // reloaded from the server, so other derived UI state goes stale until
  // a manual page refresh.
  row.querySelector('.balance-cell').textContent = formatCurrency(updated.balance);
  showToast('Credit note applied');
}

document.getElementById('new-invoice-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const candidateName = document.getElementById('new-candidateName').value;
  const isSez = document.getElementById('new-isSez').checked;
  const desc = document.getElementById('new-desc').value;
  const qty = Number(document.getElementById('new-qty').value);
  const rate = Number(document.getElementById('new-rate').value);

  const res = await fetch('/api/invoices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateName, isSez, items: [{ desc, qty, rate }] })
  });
  // FIX #3: only show success toast when the response is actually successful.
  if (res.ok) {
    showToast('Invoice created');
  } else {
    const err = await res.json();
    showToast(err.error || 'Failed to create invoice');
  }
  document.getElementById('new-invoice-form').reset();
  await loadInvoices();
});

// Testing utility — not part of the app under test.
document.getElementById('reset-data-btn').addEventListener('click', async () => {
  await fetch('/api/reset', { method: 'POST' });
  await loadInvoices();
  showToast('Data reset');
});

loadInvoices();
