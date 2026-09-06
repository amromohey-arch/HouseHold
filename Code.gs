/**
 * Household Ledger — backend
 *
 * Paste this into Extensions > Apps Script on a Google Sheet, then deploy
 * as a Web App (Execute as: Me, Who has access: Anyone with the link).
 * The sheets below are created automatically the first time the app runs.
 */

const SHEETS = {
  income: 'Income',
  expenses: 'Expenses',
  receipts: 'Receipts',
  history: 'History',
};

const INCOME_HEADERS = ['Person', 'Weekly', 'Notes'];
const EXPENSE_HEADERS = ['ID', 'Name', 'Category', 'Amount', 'Frequency', 'DueDay', 'Owner', 'Active', 'Notes', 'LastUpdated'];
const RECEIPT_HEADERS = ['ID', 'Date', 'Category', 'Amount', 'Payer', 'Note', 'CreatedAt'];
const HISTORY_HEADERS = ['Timestamp', 'Action', 'Summary'];

// Seed data taken from the original household budget so the app opens
// already tailored to real bills. Edit or delete rows in the Sheet any time.
const SEED_EXPENSES = [
  ['Rent', 'Housing', 560, 'Weekly', '', 'Shared'],
  ['Fuel', 'Transport', 100, 'Weekly', '', 'Shared'],
  ['Food', 'Food & Groceries', 150, 'Weekly', '', 'Shared'],
  ['Bupa health insurance', 'Insurance', 158.13, 'Monthly', 1, 'Shared'],
  ['Wifi', 'Utilities', 72.90, 'Monthly', 1, 'Shared'],
  ['Amro sim', 'Utilities', 40, 'Monthly', 1, 'Amro'],
  ['Mira sim', 'Utilities', 30, 'Monthly', 1, 'Mira'],
  ['Mira gym', 'Health & Fitness', 39, 'Weekly', '', 'Mira'],
  ['Amro gym', 'Health & Fitness', 45, 'Weekly', '', 'Amro'],
  ['Apple', 'Subscriptions', 14.99, 'Monthly', 1, 'Shared'],
  ['Google Drive', 'Subscriptions', 4.50, 'Monthly', 1, 'Shared'],
  ['Spotify', 'Subscriptions', 16, 'Monthly', 1, 'Shared'],
  ['Car', 'Transport', 65, 'Weekly', '', 'Shared'],
  ['House insurance', 'Insurance', 30, 'Weekly', '', 'Shared'],
  ['Gas & electric', 'Utilities', 45, 'Weekly', '', 'Shared'],
  ['Youtube', 'Subscriptions', 17, 'Monthly', 1, 'Shared'],
  ['Netflix', 'Subscriptions', 10, 'Monthly', 1, 'Shared'],
  ['Prime', 'Subscriptions', 10, 'Monthly', 1, 'Shared'],
  ['HBO via Prime', 'Subscriptions', 16, 'Monthly', 1, 'Shared'],
  ['Travel', 'Travel', 450, 'Weekly', '', 'Shared'],
  ['Personal — Amro', 'Personal', 100, 'Weekly', '', 'Amro'],
  ['Personal — Mira', 'Personal', 200, 'Weekly', '', 'Mira'],
  ['Investing', 'Savings', 100, 'Weekly', '', 'Shared'],
  ['Emergency fund', 'Savings', 450, 'Weekly', '', 'Shared'],
];

// ---------- Entry points ----------

function doGet(e) {
  ensureSheets();
  return respond(getAllData());
}

function doPost(e) {
  ensureSheets();
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const payload = body.payload || {};

    switch (action) {
      case 'updateIncome': updateIncome(payload); break;
      case 'addExpense': addExpense(payload); break;
      case 'updateExpense': updateExpense(payload); break;
      case 'deleteExpense': deleteExpense(payload); break;
      case 'addReceipt': addReceipt(payload); break;
      case 'deleteReceipt': deleteReceipt(payload); break;
      default: throw new Error('Unknown action: ' + action);
    }
    return respond({ ok: true, data: getAllData() });
  } catch (err) {
    return respond({ ok: false, error: err.message });
  }
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Setup ----------

function getSS() { return SpreadsheetApp.getActiveSpreadsheet(); }

function ensureSheets() {
  const ss = getSS();

  if (!ss.getSheetByName(SHEETS.income)) {
    const sh = ss.insertSheet(SHEETS.income);
    sh.appendRow(INCOME_HEADERS);
    sh.appendRow(['Mira', 1763.92, '']);
    sh.appendRow(['Amro', 870, '']);
  }

  if (!ss.getSheetByName(SHEETS.expenses)) {
    const sh = ss.insertSheet(SHEETS.expenses);
    sh.appendRow(EXPENSE_HEADERS);
    SEED_EXPENSES.forEach(row => {
      sh.appendRow([Utilities.getUuid(), row[0], row[1], row[2], row[3], row[4], row[5], 'Y', '', new Date()]);
    });
  }

  if (!ss.getSheetByName(SHEETS.receipts)) {
    const sh = ss.insertSheet(SHEETS.receipts);
    sh.appendRow(RECEIPT_HEADERS);
  }

  if (!ss.getSheetByName(SHEETS.history)) {
    const sh = ss.insertSheet(SHEETS.history);
    sh.appendRow(HISTORY_HEADERS);
  }
}

// ---------- Generic sheet <-> object helpers ----------

function readSheet(name) {
  const sh = getSS().getSheetByName(name);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  return values.slice(1)
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
}

function findRowIndexById(sh, headers, id) {
  const idCol = headers.indexOf('ID');
  const values = sh.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (values[r][idCol] === id) return r + 1; // 1-indexed sheet row
  }
  return -1;
}

function logHistory(action, summary) {
  const sh = getSS().getSheetByName(SHEETS.history);
  sh.appendRow([new Date(), action, summary]);
}

// ---------- Income ----------

function updateIncome(payload) {
  const sh = getSS().getSheetByName(SHEETS.income);
  const values = sh.getDataRange().getValues();
  (payload.people || []).forEach(p => {
    for (let r = 1; r < values.length; r++) {
      if (values[r][0] === p.Person) {
        sh.getRange(r + 1, 2).setValue(p.Weekly);
      }
    }
  });
  logHistory('Updated income', (payload.people || []).map(p => `${p.Person}: £${p.Weekly}/wk`).join(', '));
}

// ---------- Expenses ----------

function addExpense(payload) {
  const sh = getSS().getSheetByName(SHEETS.expenses);
  sh.appendRow([
    payload.ID, payload.Name, payload.Category, payload.Amount, payload.Frequency,
    payload.DueDay, payload.Owner, 'Y', payload.Notes || '', new Date(),
  ]);
  logHistory('Added expense', `${payload.Name} — £${payload.Amount} ${payload.Frequency}`);
}

function updateExpense(payload) {
  const sh = getSS().getSheetByName(SHEETS.expenses);
  const row = findRowIndexById(sh, EXPENSE_HEADERS, payload.ID);
  if (row === -1) throw new Error('Expense not found');
  sh.getRange(row, 1, 1, EXPENSE_HEADERS.length).setValues([[
    payload.ID, payload.Name, payload.Category, payload.Amount, payload.Frequency,
    payload.DueDay, payload.Owner, payload.Active || 'Y', payload.Notes || '', new Date(),
  ]]);
  logHistory('Edited expense', `${payload.Name} — £${payload.Amount} ${payload.Frequency}`);
}

function deleteExpense(payload) {
  const sh = getSS().getSheetByName(SHEETS.expenses);
  const row = findRowIndexById(sh, EXPENSE_HEADERS, payload.ID);
  if (row === -1) throw new Error('Expense not found');
  const name = sh.getRange(row, 2).getValue();
  sh.deleteRow(row);
  logHistory('Deleted expense', name);
}

// ---------- Receipts ----------

function addReceipt(payload) {
  const sh = getSS().getSheetByName(SHEETS.receipts);
  sh.appendRow([
    payload.ID, payload.Date, payload.Category, payload.Amount, payload.Payer, payload.Note || '', new Date(),
  ]);
  logHistory('Added receipt', `${payload.Category} — £${payload.Amount} (${payload.Date})`);
}

function deleteReceipt(payload) {
  const sh = getSS().getSheetByName(SHEETS.receipts);
  const row = findRowIndexById(sh, RECEIPT_HEADERS, payload.ID);
  if (row === -1) throw new Error('Receipt not found');
  sh.deleteRow(row);
  logHistory('Deleted receipt', payload.ID);
}

// ---------- Aggregate read ----------

function getAllData() {
  const history = readSheet(SHEETS.history)
    .sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp))
    .slice(0, 150);
  return {
    income: readSheet(SHEETS.income),
    expenses: readSheet(SHEETS.expenses),
    receipts: readSheet(SHEETS.receipts),
    history: history,
  };
}
