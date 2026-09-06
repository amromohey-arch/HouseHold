/* Household Ledger — app.js
   Talks to a Google Apps Script Web App (see /apps-script/Code.gs) which
   uses a Google Sheet as the database. Falls back to a local cache when
   offline or not yet connected. */

const LS_KEYS = {
  url: 'hl_apiUrl',
  cache: 'hl_cache',
  lastSync: 'hl_lastSync',
};

const DEFAULT_CATEGORIES = [
  'Housing', 'Utilities', 'Food & Groceries', 'Transport', 'Insurance',
  'Health & Fitness', 'Subscriptions', 'Travel', 'Personal', 'Savings',
];

const state = {
  apiUrl: localStorage.getItem(LS_KEYS.url) || '',
  income: [],      // [{Person, Weekly, Notes}]
  expenses: [],    // [{ID, Name, Category, Amount, Frequency, DueDay, Owner, Active, Notes}]
  receipts: [],    // [{ID, Date, Category, Amount, Payer, Note}]
  history: [],      // [{Timestamp, Action, Summary}]
  lastSync: localStorage.getItem(LS_KEYS.lastSync) || null,
};

// ---------- Utilities ----------

function money(n) {
  const v = Number(n) || 0;
  const sign = v < 0 ? '-' : '';
  return sign + '£' + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthlyEquivalent(amount, frequency) {
  const a = Number(amount) || 0;
  if (frequency === 'Weekly') return a * (52 / 12);
  if (frequency === 'Yearly') return a / 12;
  return a; // Monthly, or unspecified
}

function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, ms);
}

function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function ordinal(n) {
  n = Number(n);
  if (!n) return '';
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

// ---------- Networking ----------

async function fetchData() {
  if (!state.apiUrl) { renderAll(); return; }
  setSyncStatus('Syncing…', true);
  try {
    const res = await fetch(state.apiUrl, { method: 'GET' });
    const data = await res.json();
    applyData(data);
    saveCache();
    state.lastSync = new Date().toISOString();
    localStorage.setItem(LS_KEYS.lastSync, state.lastSync);
    setSyncStatus('Synced');
  } catch (err) {
    console.error(err);
    setSyncStatus('Offline — showing cached data');
    toast('Could not reach your Google Sheet. Showing cached data.');
  }
  renderAll();
}

async function postAction(action, payload) {
  if (!state.apiUrl) { toast('Connect your Google Sheet in Settings first.'); return false; }
  setSyncStatus('Saving…', true);
  try {
    const res = await fetch(state.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight
      body: JSON.stringify({ action, payload }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Unknown error');
    applyData(data.data);
    saveCache();
    setSyncStatus('Synced');
    renderAll();
    return true;
  } catch (err) {
    console.error(err);
    setSyncStatus('Sync failed');
    toast('Could not save: ' + err.message);
    return false;
  }
}

function applyData(data) {
  if (!data) return;
  state.income = data.income || [];
  state.expenses = data.expenses || [];
  state.receipts = data.receipts || [];
  state.history = data.history || [];
}

function saveCache() {
  localStorage.setItem(LS_KEYS.cache, JSON.stringify({
    income: state.income, expenses: state.expenses, receipts: state.receipts, history: state.history,
  }));
}

function loadCache() {
  const raw = localStorage.getItem(LS_KEYS.cache);
  if (raw) applyData(JSON.parse(raw));
}

function setSyncStatus(text, spinning = false) {
  document.getElementById('syncStatus').textContent = text;
  document.getElementById('refreshBtn').classList.toggle('spinning', spinning);
  document.getElementById('offlineBanner').hidden = !!state.apiUrl;
}

// ---------- Derived data ----------

function activeExpenses() {
  return state.expenses.filter(e => e.Active !== 'N');
}

function totalIncomeMonthly() {
  return state.income.reduce((sum, p) => sum + monthlyEquivalent(p.Weekly, 'Weekly'), 0);
}

function totalCommittedMonthly() {
  return activeExpenses()
    .filter(e => e.Category !== 'Savings')
    .reduce((sum, e) => sum + monthlyEquivalent(e.Amount, e.Frequency), 0);
}

function totalSavedMonthly() {
  return activeExpenses()
    .filter(e => e.Category === 'Savings')
    .reduce((sum, e) => sum + monthlyEquivalent(e.Amount, e.Frequency), 0);
}

function categoryTotals() {
  const map = {};
  activeExpenses().filter(e => e.Category !== 'Savings').forEach(e => {
    const m = monthlyEquivalent(e.Amount, e.Frequency);
    map[e.Category || 'Other'] = (map[e.Category || 'Other'] || 0) + m;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function upcomingBills() {
  const today = new Date().getDate();
  return activeExpenses()
    .filter(e => e.DueDay)
    .map(e => {
      const due = Number(e.DueDay);
      const daysAway = due >= today ? due - today : due + 30 - today;
      return { ...e, daysAway, due };
    })
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, 6);
}

// ---------- Rendering ----------

function renderAll() {
  renderDashboard();
  renderExpenses();
  renderReceipts();
  renderHistory();
  renderSettings();
  document.getElementById('lastSyncedText').textContent = state.lastSync
    ? new Date(state.lastSync).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : 'never';
}

function renderDashboard() {
  const income = totalIncomeMonthly();
  const committed = totalCommittedMonthly();
  const saved = totalSavedMonthly();
  const left = income - committed - saved;

  const heroEl = document.getElementById('heroAmount');
  heroEl.textContent = money(left);
  heroEl.className = 'hero__amount ' + (left < 0 ? 'negative' : 'positive');
  document.getElementById('heroSub').textContent =
    `${money(income)} income · ${money(committed)} bills · ${money(saved)} savings`;

  document.getElementById('tileIncome').textContent = money(income);
  document.getElementById('tileSpend').textContent = money(committed);
  document.getElementById('tileSaved').textContent = money(saved);

  const cats = categoryTotals();
  const max = cats.length ? cats[0][1] : 1;
  document.getElementById('categoryBars').innerHTML = cats.length ? cats.map(([name, amt]) => `
    <div>
      <div class="catbar__row"><span>${escapeHtml(name)}</span><span class="catbar__amount">${money(amt)}</span></div>
      <div class="catbar__track"><div class="catbar__fill" style="width:${Math.max(4, (amt / max) * 100)}%"></div></div>
    </div>`).join('') : '<div class="empty">No expenses yet</div>';

  const upcoming = upcomingBills();
  document.getElementById('upcomingList').innerHTML = upcoming.length ? upcoming.map(e => `
    <div class="ledger-row">
      <div class="ledger-row__main">
        <div class="ledger-row__title">${escapeHtml(e.Name)}</div>
        <div class="ledger-row__meta">Due ${ordinal(e.due)} · ${escapeHtml(e.Category || '')}</div>
      </div>
      <div class="ledger-row__amount out">${money(e.Amount)}</div>
    </div>`).join('') : '<div class="empty">No bills with due dates set</div>';

  const recentReceipts = [...state.receipts]
    .sort((a, b) => new Date(b.Date) - new Date(a.Date))
    .slice(0, 5);
  document.getElementById('recentReceipts').innerHTML = recentReceipts.length ? recentReceipts.map(receiptRow).join('')
    : '<div class="empty">No receipts logged yet</div>';
}

function receiptRow(r) {
  return `<div class="ledger-row">
    <div class="ledger-row__main">
      <div class="ledger-row__title">${escapeHtml(r.Category)}</div>
      <div class="ledger-row__meta">${formatDate(r.Date)}${r.Payer ? ' · ' + escapeHtml(r.Payer) : ''}${r.Note ? ' · ' + escapeHtml(r.Note) : ''}</div>
    </div>
    <div class="ledger-row__amount out">${money(r.Amount)}</div>
  </div>`;
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function renderExpenses() {
  const groups = {};
  activeExpenses().forEach(e => {
    const cat = e.Category || 'Other';
    (groups[cat] = groups[cat] || []).push(e);
  });
  const catNames = Object.keys(groups).sort();
  const html = catNames.length ? catNames.map(cat => `
    <div class="expense-group">
      <div class="expense-group__title">${escapeHtml(cat)}</div>
      <div class="expense-group__card">
        ${groups[cat].map(e => `
          <div class="ledger-row clickable" data-edit-expense="${e.ID}">
            <div class="ledger-row__main">
              <div class="ledger-row__title">${escapeHtml(e.Name)}</div>
              <div class="ledger-row__meta">${escapeHtml(e.Frequency || 'Monthly')}${e.DueDay ? ' · due ' + ordinal(e.DueDay) : ''} · <span class="tag ${ownerClass(e.Owner)}">${escapeHtml(e.Owner || 'Shared')}</span></div>
            </div>
            <div class="ledger-row__amount out">${money(e.Amount)}</div>
          </div>`).join('')}
      </div>
    </div>`).join('') : '<div class="empty">No expenses yet. Tap Add to create one.</div>';
  document.getElementById('expenseGroups').innerHTML = html;

  document.querySelectorAll('[data-edit-expense]').forEach(row => {
    row.addEventListener('click', () => openExpenseSheet(row.dataset.editExpense));
  });
}

function ownerClass(owner) {
  if (owner === 'Amro') return 'owner-amro';
  if (owner === 'Mira') return 'owner-mira';
  return '';
}

function renderReceipts() {
  const monthReceipts = state.receipts.filter(r => isThisMonth(r.Date));
  const sumBy = cat => monthReceipts.filter(r => r.Category === cat).reduce((s, r) => s + (Number(r.Amount) || 0), 0);
  document.getElementById('receiptFoodTotal').textContent = money(sumBy('Food & Groceries'));
  document.getElementById('receiptFuelTotal').textContent = money(sumBy('Transport'));

  const byMonth = {};
  [...state.receipts].sort((a, b) => new Date(b.Date) - new Date(a.Date)).forEach(r => {
    const d = new Date(r.Date);
    const key = isNaN(d) ? 'Undated' : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    (byMonth[key] = byMonth[key] || []).push(r);
  });
  const keys = Object.keys(byMonth);
  document.getElementById('receiptGroups').innerHTML = keys.length ? keys.map(k => `
    <div class="expense-group">
      <div class="expense-group__title">${k}</div>
      <div class="expense-group__card">
        ${byMonth[k].map(receiptRow).join('')}
      </div>
    </div>`).join('') : '<div class="empty">No receipts yet. Tap Add to log one.</div>';
}

function renderHistory() {
  const rows = [...state.history].sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
  document.getElementById('historyList').innerHTML = rows.length ? rows.map(h => `
    <div class="ledger-row">
      <div class="ledger-row__main">
        <div class="ledger-row__title">${escapeHtml(h.Action)}</div>
        <div class="ledger-row__meta">${escapeHtml(h.Summary || '')}</div>
      </div>
      <div class="ledger-row__amount">${new Date(h.Timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
    </div>`).join('') : '<div class="empty">No changes logged yet</div>';
}

function renderSettings() {
  document.getElementById('apiUrlInput').value = state.apiUrl;
  const editor = document.getElementById('incomeEditor');
  const people = state.income.length ? state.income : [{ Person: 'Mira', Weekly: 0 }, { Person: 'Amro', Weekly: 0 }];
  editor.innerHTML = people.map(p => `
    <div class="income-row">
      <label for="income-${escapeHtml(p.Person)}">${escapeHtml(p.Person)} — weekly income</label>
      <input class="input" type="number" step="0.01" id="income-${escapeHtml(p.Person)}" value="${p.Weekly}" />
    </div>`).join('');
}

// ---------- Navigation ----------

function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.hidden = true);
  document.getElementById('view-' + name).hidden = false;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  document.getElementById('scrollArea').scrollTo({ top: 0 });
  document.getElementById('backToTop').hidden = true;
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => switchView(tab.dataset.view));
});
document.querySelectorAll('[data-goto]').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.goto));
});
document.getElementById('bannerSettingsBtn').addEventListener('click', () => switchView('settings'));

window.addEventListener('scroll', () => {
  document.getElementById('backToTop').hidden = window.scrollY < 400;
});
document.getElementById('backToTop').addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.getElementById('refreshBtn').addEventListener('click', fetchData);
document.getElementById('hardRefreshBtn').addEventListener('click', fetchData);

// ---------- Settings actions ----------

document.getElementById('saveUrlBtn').addEventListener('click', () => {
  const url = document.getElementById('apiUrlInput').value.trim();
  if (!url) { toast('Enter a Web App URL first.'); return; }
  state.apiUrl = url;
  localStorage.setItem(LS_KEYS.url, url);
  document.getElementById('urlSaveStatus').textContent = 'Saved. Syncing…';
  fetchData();
});

document.getElementById('saveIncomeBtn').addEventListener('click', async () => {
  const people = state.income.length ? state.income : [{ Person: 'Mira' }, { Person: 'Amro' }];
  const updates = people.map(p => ({
    Person: p.Person,
    Weekly: Number(document.getElementById(`income-${p.Person}`).value) || 0,
  }));
  const ok = await postAction('updateIncome', { people: updates });
  document.getElementById('incomeSaveStatus').textContent = ok ? 'Saved' : 'Failed';
  if (ok) toast('Income updated');
});

// ---------- Expense sheet (add/edit) ----------

function openExpenseSheet(id) {
  const existing = id ? state.expenses.find(e => e.ID === id) : null;
  const root = document.getElementById('modalRoot');
  const categoryOptions = Array.from(new Set([...DEFAULT_CATEGORIES, ...state.expenses.map(e => e.Category)].filter(Boolean)));

  root.innerHTML = `
    <div class="sheet-backdrop" id="sheetBackdrop">
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="sheet__grabber"></div>
        <div class="sheet__head">
          <h2>${existing ? 'Edit expense' : 'Add expense'}</h2>
          <button class="sheet__close" id="sheetClose" aria-label="Close">&times;</button>
        </div>

        <label class="field-label" for="f-name">Name</label>
        <input class="input" id="f-name" placeholder="e.g. Amro Sim" value="${existing ? escapeHtml(existing.Name) : ''}" />

        <label class="field-label" for="f-category">Category</label>
        <input class="input" id="f-category" list="categoryList" placeholder="e.g. Utilities" value="${existing ? escapeHtml(existing.Category) : ''}" />
        <datalist id="categoryList">${categoryOptions.map(c => `<option value="${escapeHtml(c)}">`).join('')}</datalist>

        <div class="field-row">
          <div>
            <label class="field-label" for="f-amount">Amount (£)</label>
            <input class="input" id="f-amount" type="number" step="0.01" value="${existing ? existing.Amount : ''}" />
          </div>
          <div>
            <label class="field-label" for="f-frequency">Frequency</label>
            <select class="input" id="f-frequency">
              <option value="Weekly" ${existing?.Frequency === 'Weekly' ? 'selected' : ''}>Weekly</option>
              <option value="Monthly" ${!existing || existing?.Frequency === 'Monthly' ? 'selected' : ''}>Monthly</option>
              <option value="Yearly" ${existing?.Frequency === 'Yearly' ? 'selected' : ''}>Yearly</option>
            </select>
          </div>
        </div>

        <div class="field-row">
          <div>
            <label class="field-label" for="f-dueday">Due day of month</label>
            <input class="input" id="f-dueday" type="number" min="1" max="31" placeholder="e.g. 15" value="${existing?.DueDay || ''}" />
          </div>
          <div>
            <label class="field-label" for="f-owner">Paid by</label>
            <select class="input" id="f-owner">
              <option value="Shared" ${!existing || existing?.Owner === 'Shared' ? 'selected' : ''}>Shared</option>
              <option value="Amro" ${existing?.Owner === 'Amro' ? 'selected' : ''}>Amro</option>
              <option value="Mira" ${existing?.Owner === 'Mira' ? 'selected' : ''}>Mira</option>
            </select>
          </div>
        </div>

        <label class="field-label" for="f-notes">Notes (optional)</label>
        <input class="input" id="f-notes" value="${existing ? escapeHtml(existing.Notes || '') : ''}" />

        <div class="sheet__footer">
          <button class="btn btn--primary btn--full" id="f-save">Save</button>
        </div>
        ${existing ? '<div class="sheet__footer"><button class="btn btn--danger btn--full" id="f-delete">Delete expense</button></div>' : ''}
      </div>
    </div>`;

  const close = () => { root.innerHTML = ''; };
  document.getElementById('sheetClose').addEventListener('click', close);
  document.getElementById('sheetBackdrop').addEventListener('click', e => { if (e.target.id === 'sheetBackdrop') close(); });

  document.getElementById('f-save').addEventListener('click', async () => {
    const payload = {
      ID: existing ? existing.ID : uid(),
      Name: document.getElementById('f-name').value.trim(),
      Category: document.getElementById('f-category').value.trim() || 'Other',
      Amount: Number(document.getElementById('f-amount').value) || 0,
      Frequency: document.getElementById('f-frequency').value,
      DueDay: document.getElementById('f-dueday').value || '',
      Owner: document.getElementById('f-owner').value,
      Notes: document.getElementById('f-notes').value.trim(),
      Active: 'Y',
    };
    if (!payload.Name) { toast('Give the expense a name.'); return; }
    const ok = await postAction(existing ? 'updateExpense' : 'addExpense', payload);
    if (ok) { toast(existing ? 'Expense updated' : 'Expense added'); close(); }
  });

  if (existing) {
    document.getElementById('f-delete').addEventListener('click', async () => {
      if (!confirm(`Delete "${existing.Name}"?`)) return;
      const ok = await postAction('deleteExpense', { ID: existing.ID });
      if (ok) { toast('Expense deleted'); close(); }
    });
  }
}

document.getElementById('addExpenseBtn').addEventListener('click', () => openExpenseSheet(null));

// ---------- Receipt sheet (add) ----------

function openReceiptSheet() {
  const root = document.getElementById('modalRoot');
  const categoryOptions = Array.from(new Set([...DEFAULT_CATEGORIES, ...state.receipts.map(r => r.Category)].filter(Boolean)));
  const today = new Date().toISOString().slice(0, 10);

  root.innerHTML = `
    <div class="sheet-backdrop" id="sheetBackdrop">
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="sheet__grabber"></div>
        <div class="sheet__head">
          <h2>Add receipt</h2>
          <button class="sheet__close" id="sheetClose" aria-label="Close">&times;</button>
        </div>

        <label class="field-label" for="r-date">Date</label>
        <input class="input" id="r-date" type="date" value="${today}" />

        <label class="field-label" for="r-category">Category</label>
        <input class="input" id="r-category" list="rcategoryList" placeholder="e.g. Food & Groceries" value="Food & Groceries" />
        <datalist id="rcategoryList">${categoryOptions.map(c => `<option value="${escapeHtml(c)}">`).join('')}</datalist>

        <div class="field-row">
          <div>
            <label class="field-label" for="r-amount">Amount (£)</label>
            <input class="input" id="r-amount" type="number" step="0.01" />
          </div>
          <div>
            <label class="field-label" for="r-payer">Paid by</label>
            <select class="input" id="r-payer">
              <option value="Shared">Shared</option>
              <option value="Amro">Amro</option>
              <option value="Mira">Mira</option>
            </select>
          </div>
        </div>

        <label class="field-label" for="r-note">Note (optional)</label>
        <input class="input" id="r-note" placeholder="e.g. Tesco weekly shop" />

        <div class="sheet__footer">
          <button class="btn btn--primary btn--full" id="r-save">Save receipt</button>
        </div>
      </div>
    </div>`;

  const close = () => { root.innerHTML = ''; };
  document.getElementById('sheetClose').addEventListener('click', close);
  document.getElementById('sheetBackdrop').addEventListener('click', e => { if (e.target.id === 'sheetBackdrop') close(); });

  document.getElementById('r-save').addEventListener('click', async () => {
    const amount = Number(document.getElementById('r-amount').value);
    if (!amount) { toast('Enter an amount.'); return; }
    const payload = {
      ID: uid(),
      Date: document.getElementById('r-date').value || today,
      Category: document.getElementById('r-category').value.trim() || 'Other',
      Amount: amount,
      Payer: document.getElementById('r-payer').value,
      Note: document.getElementById('r-note').value.trim(),
    };
    const ok = await postAction('addReceipt', payload);
    if (ok) { toast('Receipt added'); close(); }
  });
}

document.getElementById('addReceiptBtn').addEventListener('click', openReceiptSheet);

// ---------- Init ----------

loadCache();
renderAll();
setSyncStatus(state.apiUrl ? 'Loading…' : 'Not connected');
fetchData();
