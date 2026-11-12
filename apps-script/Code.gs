/**
 * Credit-to-Keys Roadmap signup handler.
 *
 * Lives inside the signup Google Sheet (Extensions > Apps Script) and is deployed
 * as a web app. For each signup from the landing page it:
 *   1. saves the row to the Sheet (the backup copy of every lead)
 *   2. emails the guide link to the person, in the language they used
 *   3. sends the lead to Follow Up Boss
 *   4. emails Manny about the new lead
 *
 * Secrets and links are NOT in this file. Set them in
 * Project Settings > Script Properties:
 *   FUB_API_KEY    Follow Up Boss API key (Admin > API in FUB). Optional until ready.
 *   GUIDE_URL_EN   Google Drive share link to the English guide PDF.
 *   GUIDE_URL_ES   Google Drive share link to the Spanish guide PDF (falls back to English).
 *   NOTIFY_EMAIL   Where new-lead alerts go. Defaults to the account that owns the script.
 */

const SHEET_NAME = 'Signups';
const HEADERS = ['Timestamp', 'Full name', 'Email', 'Phone', 'Credit challenge', 'Language', 'Guide emailed', 'Added to FUB'];
const COL = { GUIDE: 7, FUB: 8 };
const LEAD_SOURCE = 'credit repair lead magnet';
const REPLY_TO = 'mlindo@theresponsiveway.com';

const CHALLENGES = {
  collections: { en: 'Collections', es: 'Cobranzas' },
  late_payments: { en: 'Late payments', es: 'Pagos atrasados' },
  high_balances: { en: 'High card balances', es: 'Saldos altos en tarjetas' },
  low_score: { en: 'Low score', es: 'Puntaje bajo' },
  no_history: { en: 'No credit history', es: 'Sin historial de crédito' },
  not_sure: { en: 'Not sure', es: 'No estoy seguro' },
};

/** Run this once from the editor. It creates the header row and triggers the permission prompt. */
function setup() {
  getSheet_();
  Logger.log('Sheet is ready. Alerts will go to: ' + notifyEmail_());
}

function doGet() {
  return ContentService.createTextOutput('Signup endpoint is running.');
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Spam trap: real people never fill the hidden "website" field.
    if (data.website) return json_({ ok: true });

    const lead = validate_(data);
    if (!lead) return json_({ ok: false, error: 'invalid' });

    const sheet = getSheet_();
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    let row;
    try {
      sheet.appendRow([new Date(), cell_(lead.name), cell_(lead.email), cell_(lead.phone), lead.challengeLabel, lead.language, '', '']);
      row = sheet.getLastRow();
    } finally {
      lock.releaseLock();
    }

    // The lead is saved. Nothing below may fail the signup.
    const guideStatus = attempt_(function () { return sendGuide_(lead); });
    sheet.getRange(row, COL.GUIDE).setValue(guideStatus);

    const fubStatus = attempt_(function () { return sendToFub_(lead); });
    sheet.getRange(row, COL.FUB).setValue(fubStatus);

    attempt_(function () { return notifyManny_(lead, guideStatus, fubStatus); });

    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server' });
  }
}

/**
 * Sends any rows that never reached Follow Up Boss (for example, signups that came
 * in before the API key was added). Safe to run any time: rows already marked with
 * a date are skipped, so nothing is sent twice.
 */
function retryFub() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (/^\d{4}-\d{2}-\d{2}/.test(String(r[COL.FUB - 1]))) continue;
    const language = r[5] === 'es' ? 'es' : 'en';
    const lead = { name: String(r[1]), email: String(r[2]), phone: String(r[3]).replace(/^'/, ''), challengeLabel: String(r[4]), language: language };
    sheet.getRange(i + 1, COL.FUB).setValue(attempt_(function () { return sendToFub_(lead); }));
  }
}

// ---------- steps ----------

function sendGuide_(lead) {
  const props = PropertiesService.getScriptProperties();
  const url = (lead.language === 'es' && props.getProperty('GUIDE_URL_ES')) || props.getProperty('GUIDE_URL_EN');
  if (!url) return 'NOT SENT: no guide link set';

  const first = lead.name.split(/\s+/)[0];
  const es = lead.language === 'es';
  const subject = es
    ? 'Su guía: La Ruta del Crédito a las Llaves'
    : 'Your guide: The Credit-to-Keys Roadmap';
  const lines = es
    ? ['Hola ' + first + ',',
       'Gracias por solicitar La Ruta del Crédito a las Llaves: 7 pasos para prepararse para una hipoteca. Puede abrirla aquí:',
       url,
       'Cuando esté listo, con gusto reviso su situación en una conversación gratis y sin compromiso. Llame al 813-359-7196 o responda a este correo.',
       'Manny Lindo\nOficial de Préstamos, NMLS #873412\nResponsive Mortgage, una división de Paramount Residential Mortgage Group, Inc. (PRMG)\nNMLS de la compañía #75243\n3660 Erindale Drive, Valrico, FL 33596\n813-359-7196',
       'Igualdad de Oportunidades en la Vivienda. Esta guía es información educativa solamente y no constituye un compromiso de préstamo. Todos los préstamos están sujetos a aprobación de crédito, verificación y a las pautas de cada programa.']
    : ['Hi ' + first + ',',
       'Thank you for requesting The Credit-to-Keys Roadmap: 7 Steps to Get Mortgage-Ready. You can open it here:',
       url,
       'When you are ready, I am glad to look at your situation in a free, no-obligation conversation. Call 813-359-7196 or reply to this email.',
       'Manny Lindo\nLoan Officer, NMLS #873412\nResponsive Mortgage, a division of Paramount Residential Mortgage Group, Inc. (PRMG)\nCompany NMLS #75243\n3660 Erindale Drive, Valrico, FL 33596\n813-359-7196',
       'Equal Housing Opportunity. This guide is educational information only and is not a commitment to lend. All loans are subject to credit approval, verification, and program guidelines.'];

  MailApp.sendEmail({
    to: lead.email,
    subject: subject,
    body: lines.join('\n\n'),
    name: 'Manny Lindo, Responsive Mortgage',
    replyTo: REPLY_TO,
  });
  return today_();
}

function sendToFub_(lead) {
  const key = PropertiesService.getScriptProperties().getProperty('FUB_API_KEY');
  if (!key) return 'NOT SENT: no FUB key set';

  const auth = { Authorization: 'Basic ' + Utilities.base64Encode(key + ':') };

  // Was this email already in FUB? FUB matches by email either way, so no duplicate
  // contact is created. This only records which case it was.
  const found = UrlFetchApp.fetch('https://api.followupboss.com/v1/people?fields=id&limit=1&email=' + encodeURIComponent(lead.email), { headers: auth, muteHttpExceptions: true });
  let existing = false;
  if (found.getResponseCode() === 200) {
    const people = JSON.parse(found.getContentText()).people || [];
    existing = people.length > 0;
  }

  const parts = lead.name.split(/\s+/);
  const person = {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
    emails: [{ value: lead.email }],
    phones: [{ value: lead.phone }],
    tags: [LEAD_SOURCE],
  };
  const res = UrlFetchApp.fetch('https://api.followupboss.com/v1/events', {
    method: 'post',
    contentType: 'application/json',
    headers: auth,
    muteHttpExceptions: true,
    payload: JSON.stringify({
      source: LEAD_SOURCE,
      system: 'Credit-to-Keys landing page',
      type: 'Registration',
      message: 'Requested The Credit-to-Keys Roadmap. Credit challenge: ' + (lead.challengeLabel || 'not given') + '. Language: ' + (lead.language === 'es' ? 'Spanish' : 'English') + '.',
      person: person,
    }),
  });

  const code = res.getResponseCode();
  if (code === 200 || code === 201) return today_() + (existing || code === 200 ? ' (existing contact)' : ' (new contact)');
  if (code === 204) return 'NOT ADDED: FUB ignores this lead source (lead flow archived)';
  return 'ERROR: FUB returned ' + code;
}

function notifyManny_(lead, guideStatus, fubStatus) {
  MailApp.sendEmail({
    to: notifyEmail_(),
    subject: 'New guide signup: ' + lead.name,
    body: [
      'New Credit-to-Keys Roadmap signup',
      '',
      'Name: ' + lead.name,
      'Email: ' + lead.email,
      'Phone: ' + lead.phone,
      'Credit challenge: ' + (lead.challengeLabel || 'not given'),
      'Language: ' + (lead.language === 'es' ? 'Spanish' : 'English'),
      '',
      'Guide emailed: ' + guideStatus,
      'Added to FUB: ' + fubStatus,
      '',
      'Sheet: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl(),
    ].join('\n'),
  });
}

// ---------- helpers ----------

function validate_(data) {
  const name = String(data.name || '').trim().replace(/\s+/g, ' ');
  const email = String(data.email || '').trim();
  const phone = String(data.phone || '').trim();
  const digits = phone.replace(/\D/g, '');
  if (name.length < 2 || name.length > 100) return null;
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  if (phone.length > 25 || !/^[0-9+().\-\s]+$/.test(phone) || digits.length < 10 || digits.length > 15) return null;
  const language = data.language === 'es' ? 'es' : 'en';
  const challenge = CHALLENGES[data.challenge];
  return { name: name, email: email, phone: phone, language: language, challengeLabel: challenge ? challenge[language] : '' };
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Stops a typed value like "=..." or "+1 813..." from being read as a formula. */
function cell_(value) {
  const s = String(value);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function attempt_(fn) {
  try {
    return fn();
  } catch (err) {
    console.error(err);
    return 'ERROR: ' + String(err && err.message ? err.message : err).slice(0, 150);
  }
}

function notifyEmail_() {
  return PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || Session.getEffectiveUser().getEmail();
}

function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
