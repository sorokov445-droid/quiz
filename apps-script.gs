const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/13aZxWq7KGVj3Y1f5koGGox4NKRpUT63M9jMVAdyn8Ps/edit?usp=sharing';
const SHEET_NAME = ''; // Оставьте пустым, чтобы брать первый лист. Или впишите точное имя листа.

/**
 * JSONP API для GitHub Pages.
 * action=register&name=ИМЯ&prefix=callbackName
 * action=score&row=2&score=8&prefix=callbackName
 */
function doGet(e) {
  const callbackName = sanitizeCallback_(e?.parameter?.prefix);

  if (!callbackName) {
    return ContentService
      .createTextOutput('console.error("Missing or invalid callback name")')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  let payload;

  try {
    const action = String(e?.parameter?.action || '').trim();

    switch (action) {
      case 'register':
        payload = { ok: true, ...registerPlayer_(e.parameter.name) };
        break;
      case 'score':
        payload = { ok: true, ...saveScore_(e.parameter.row, e.parameter.score) };
        break;
      default:
        throw new Error('Unknown action');
    }
  } catch (error) {
    payload = {
      ok: false,
      error: error && error.message ? error.message : 'Unknown server error'
    };
  }

  return ContentService
    .createTextOutput(`${callbackName}(${JSON.stringify(payload)})`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function registerPlayer_(rawName) {
  const name = sanitizeName_(rawName);
  if (!name) {
    throw new Error('Name is required');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = getSheet_();
    sheet.appendRow([name, '']);
    const row = sheet.getLastRow();

    return { row };
  } finally {
    lock.releaseLock();
  }
}

function saveScore_(rowValue, scoreValue) {
  const row = Number(rowValue);
  const score = Number(scoreValue);

  if (!Number.isInteger(row) || row < 1) {
    throw new Error('Invalid row number');
  }

  if (!Number.isInteger(score) || score < 0 || score > 10) {
    throw new Error('Invalid score');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = getSheet_();

    if (row > sheet.getLastRow()) {
      throw new Error('Row does not exist');
    }

    sheet.getRange(row, 2).setValue(score);

    return { row, score };
  } finally {
    lock.releaseLock();
  }
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.openByUrl(SPREADSHEET_URL);

  if (SHEET_NAME) {
    const namedSheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!namedSheet) {
      throw new Error(`Sheet \"${SHEET_NAME}\" not found`);
    }
    return namedSheet;
  }

  const firstSheet = spreadsheet.getSheets()[0];
  if (!firstSheet) {
    throw new Error('No sheets found');
  }

  return firstSheet;
}

function sanitizeName_(value) {
  let name = String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!name) {
    return '';
  }

  if (name.length > 100) {
    name = name.slice(0, 100);
  }

  // Простейшая защита от formula injection в Google Sheets.
  if (/^[=+\-@]/.test(name)) {
    name = `'${name}`;
  }

  return name;
}

function sanitizeCallback_(value) {
  const callback = String(value || '').trim();
  return /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback) ? callback : '';
}
