/**
 * sheets-search.gs
 * Google Apps Script web app that powers the "Sheets fallback" search for the
 * Laptop Inventory frontend, and the headless sync relay (gas-sync.js).
 *
 * Deploy as a web app (Execute as: Me; Who has access: Anyone).
 * Keep CONFIG.key secret — it gates every request.
 *
 * Actions (query param `action`):
 *   readTable     -> { table }             returns { headers, rows }
 *   replaceTable  -> { table, headers, rows }  overwrite a whole tab
 *   appendRow     -> { table, values }     append one row
 *   updateRowByIndex -> { table, rowIndex, values }
 *   clearRowByIndex  -> { table, rowIndex }
 *   search        -> { table, q, limit }   case-insensitive substring search
 *
 * All responses are JSONP-safe: if `callback` is present the body is wrapped.
 */

const CONFIG = {
  key: 'REPLACE_ME_WITH_YOUR_KEY'
};

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const p = e.parameter || {};
  const cb = p.callback || null;

  try {
    if (p.key !== CONFIG.key) return respond({ ok: false, error: 'invalid key' }, cb);

    switch (p.action) {
      case 'search':
        return respond(searchAction(p), cb);
      case 'readTable':
        return respond(readAction(p), cb);
      case 'replaceTable':
        return respond(replaceAction(p), cb);
      case 'appendRow':
        return respond(appendAction(p), cb);
      case 'updateRowByIndex':
        return respond(updateAction(p), cb);
      case 'clearRowByIndex':
        return respond(clearAction(p), cb);
      default:
        return respond({ ok: false, error: 'unknown action' }, cb);
    }
  } catch (err) {
    return respond({ ok: false, error: String(err && err.message || err) }, cb);
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function readAction(p) {
  const tab = String(p.table || '');
  const sheet = getSheet(tab);
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const rows = values.slice(1).filter((r) => r.some((c) => c !== '' && c != null));
  return { ok: true, table: tab, headers, rows };
}

function searchAction(p) {
  const tab = String(p.table || 'Laptops');
  const q = String(p.q || '').toLowerCase().trim();
  const limit = Math.min(Number(p.limit) || 50, 200);
  if (!q) return { ok: true, table: tab, query: q, rows: [], headers: [] };

  const sheet = getSheet(tab);
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const data = values.slice(1);

  const matches = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (row.some((c) => c !== '' && c != null && String(c).toLowerCase().includes(q))) {
      matches.push(row);
      if (matches.length >= limit) break;
    }
  }
  return { ok: true, table: tab, query: q, rows: matches, headers };
}

function replaceAction(p) {
  const tab = String(p.table || '');
  const sheet = getSheet(tab);
  const headers = Array.isArray(p.headers) ? p.headers : JSON.parse(p.headers || '[]');
  const rows = Array.isArray(p.rows) ? p.rows : JSON.parse(p.rows || '[]');
  sheet.clearContents();
  if (headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  return { ok: true, table: tab, count: rows.length };
}

function appendAction(p) {
  const tab = String(p.table || '');
  const sheet = getSheet(tab);
  const values = Array.isArray(p.values) ? p.values : JSON.parse(p.values || '[]');
  sheet.appendRow(values);
  return { ok: true, table: tab, row: sheet.getLastRow() };
}

function updateAction(p) {
  const tab = String(p.table || '');
  const sheet = getSheet(tab);
  const rowIndex = Number(p.rowIndex);
  const values = Array.isArray(p.values) ? p.values : JSON.parse(p.values || '[]');
  sheet.getRange(rowIndex, 1, 1, values.length).setValues([values]);
  return { ok: true, table: tab, row: rowIndex };
}

function clearAction(p) {
  const tab = String(p.table || '');
  const sheet = getSheet(tab);
  const rowIndex = Number(p.rowIndex);
  sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).clearContent();
  return { ok: true, table: tab, row: rowIndex };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSheet(tab) {
  if (!tab) throw new Error('table is required');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(tab);
  if (!sheet) throw new Error('Sheet "' + tab + '" not found');
  return sheet;
}

function respond(obj, callback) {
  const text = JSON.stringify(obj);
  const out = callback
    ? ContentService.createTextOutput(callback + '(' + text + ')')
    : ContentService.createTextOutput(text);
  return out.setMimeType(ContentService.MimeType.JAVASCRIPT);
}
