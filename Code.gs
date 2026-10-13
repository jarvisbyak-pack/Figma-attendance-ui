/**
 * AK PACK FITNESS Attendance API
 * Deploy as a Google Apps Script Web App. Configure Script Properties:
 *   SPREADSHEET_ID = the Google Sheet ID
 *   ADMIN_PIN = a strong PIN used for record searches and member histories
 *
 * Create a MEMBERS sheet with columns:
 * Membership ID | Name | Mobile | Status | Expiry
 * Attendance rows are written to ATTENDANCE automatically.
 */
const MEMBERS_SHEET = 'MEMBERS';
const ATTENDANCE_SHEET = 'ATTENDANCE';
const MEMBER_HEADERS = ['Membership ID', 'Name', 'Mobile', 'Status', 'Expiry'];
const ATTENDANCE_HEADERS = ['Membership ID', 'Name', 'Mobile', 'Date', 'Clock In', 'Clock Out', 'Duration', 'Status', 'Updated At'];

function doGet() {
  return json_({ ok: true, service: 'AK PACK FITNESS Attendance API', actions: ['ping', 'lookup', 'clockIn', 'clockOut', 'attendanceSearch', 'memberHistory'] });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(payload.action || '');
    let result;
    switch (action) {
      case 'ping':
        result = { ok: true, message: 'API reachable', spreadsheetConfigured: !!PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') };
        break;
      case 'lookup':
        result = lookupMember_(payload.identity);
        break;
      case 'clockIn':
        result = clockIn_(payload.membershipId);
        break;
      case 'clockOut':
        result = clockOut_(payload.membershipId);
        break;
      case 'attendanceSearch':
        requireAdmin_(payload.adminPin);
        result = { ok: true, records: searchAttendance_(payload) };
        break;
      case 'memberHistory':
        requireAdmin_(payload.adminPin);
        result = memberHistory_(payload.membershipId);
        break;
      default:
        throw new Error('Unknown action.');
    }
    return json_(result);
  } catch (err) {
    return json_({ ok: false, error: safeMessage_(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function safeMessage_(err) {
  const msg = err && err.message ? err.message : String(err || 'Unexpected server error.');
  return msg.length > 240 ? msg.slice(0, 240) : msg;
}
function props_() { return PropertiesService.getScriptProperties(); }
function spreadsheet_() {
  const id = props_().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Google Sheets is not configured. Set SPREADSHEET_ID in Apps Script project settings.');
  return SpreadsheetApp.openById(id);
}
function sheet_(name, headers) {
  const ss = spreadsheet_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sh;
}
function membersSheet_() { return sheet_(MEMBERS_SHEET, MEMBER_HEADERS); }
function attendanceSheet_() { return sheet_(ATTENDANCE_SHEET, ATTENDANCE_HEADERS); }
function digits_(v) { return String(v == null ? '' : v).replace(/\\D/g, ''); }
function normalizedMobile_(v) {
  let s = digits_(v);
  if (s.length > 10) s = s.slice(-10);
  return s;
}
function tz_() { return Session.getScriptTimeZone() || 'Asia/Kolkata'; }
function dateText_(v) {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  const s = String(v).trim();
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : Utilities.formatDate(d, tz_(), 'yyyy-MM-dd');
}
function timeText_(v) {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, tz_(), 'HH:mm:ss');
  if (typeof v === 'number') {
    const seconds = Math.round(v * 86400);
    return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map(n => ('0' + n).slice(-2)).join(':');
  }
  const s = String(v).trim();
  const m = s.match(/(\\d{1,2}:\\d{2}(?::\\d{2})?)/);
  return m ? (m[1].length === 5 ? m[1] + ':00' : m[1]) : s;
}
function dateTime_(dateValue, timeValue) {
  const d = dateText_(dateValue), t = timeText_(timeValue);
  if (!d || !t) return null;
  const parts = d.split('-').map(Number), tp = t.split(':').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], tp[0] || 0, tp[1] || 0, tp[2] || 0);
}
function readMembers_() {
  const sh = membersSheet_(), data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const col = names => headers.findIndex(h => names.indexOf(h) >= 0);
  const idCol = col(['membership id', 'membershipid', 'member id', 'id']);
  const nameCol = col(['name', 'member name', 'client name']);
  const mobileCol = col(['mobile', 'mobile number', 'phone', 'phone number', 'registered mobile']);
  const statusCol = col(['status', 'membership status']);
  const expiryCol = col(['expiry', 'expiry date', 'membership expiry']);
  if (idCol < 0 || nameCol < 0) throw new Error('MEMBERS sheet needs Membership ID and Name columns.');
  return data.slice(1).filter(r => r[idCol] !== '' && r[idCol] != null).map(r => ({
    membershipId: digits_(r[idCol]), name: String(r[nameCol] || '').trim(),
    mobile: mobileCol < 0 ? '' : digits_(r[mobileCol]),
    status: statusCol < 0 || !String(r[statusCol]).trim() ? 'active' : String(r[statusCol]).trim(),
    expiry: expiryCol < 0 ? '' : dateText_(r[expiryCol])
  })).filter(m => m.membershipId);
}
function memberActive_(m) {
  const s = String(m.status || 'active').trim().toLowerCase();
  if (['inactive', 'expired', 'blocked', 'suspended', 'false', '0', 'no'].indexOf(s) >= 0) return false;
  if (m.expiry && /^\\d{4}-\\d{2}-\\d{2}$/.test(m.expiry)) {
    const today = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
    if (m.expiry < today) return false;
  }
  return true;
}
function findMember_(identity) {
  const q = digits_(identity);
  if (!q) throw new Error('Enter a numeric membership ID or mobile number.');
  const members = readMembers_();
  let m = members.find(x => x.membershipId === q);
  if (!m) {
    const mobileQ = normalizedMobile_(q);
    if (mobileQ.length >= 10) m = members.find(x => normalizedMobile_(x.mobile) === mobileQ);
  }
  if (!m) throw new Error('No member found for that membership ID or registered mobile number.');
  return m;
}
function publicMember_(m) {
  return { membershipId: m.membershipId, name: m.name, mobile: m.mobile, status: memberActive_(m) ? 'active' : 'inactive', expiry: m.expiry };
}
function lookupMember_(identity) {
  const m = findMember_(identity);
  return { ok: true, member: publicMember_(m) };
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function ensureAttendanceHeaders_() { return attendanceSheet_(); }
function attendanceRows_() {
  const sh = ensureAttendanceHeaders_(), values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  return values.slice(1).map((r, i) => ({
    rowNumber: i + 2, membershipId: digits_(r[0]), name: String(r[1] || ''),
    mobile: digits_(r[2]), date: dateText_(r[3]), clockIn: timeText_(r[4]),
    clockOut: timeText_(r[5]), duration: String(r[6] || ''),
    status: String(r[7] || ''), updatedAt: r[8] instanceof Date ? Utilities.formatDate(r[8], tz_(), 'yyyy-MM-dd HH:mm:ss') : String(r[8] || '')
  })).filter(r => r.membershipId);
}
function clockIn_(membershipId) {
  return withLock_(function() {
    const m = findMember_(membershipId);
    if (!memberActive_(m)) throw new Error('This membership is inactive or expired. Clock-in was not recorded.');
    const rows = attendanceRows_();
    const open = rows.some(r => r.membershipId === m.membershipId && !r.clockOut);
    if (open) throw new Error('This member already has an active clock-in. Clock out before clocking in again.');
    const now = new Date(), sh = ensureAttendanceHeaders_();
    sh.appendRow([m.membershipId, m.name, m.mobile, now, now, '', '', 'Clocked In', now]);
    SpreadsheetApp.flush();
    return { ok: true, message: 'Clock-in saved to Google Sheets.', member: publicMember_(m) };
  });
}
function clockOut_(membershipId) {
  return withLock_(function() {
    const m = findMember_(membershipId);
    const sh = ensureAttendanceHeaders_(), rows = attendanceRows_();
    const active = rows.filter(r => r.membershipId === m.membershipId && !r.clockOut).sort((a, b) => b.rowNumber - a.rowNumber)[0];
    if (!active) throw new Error('No active clock-in found for this member. Clock-out was not recorded.');
    const now = new Date();
    const start = dateTime_(active.date, active.clockIn);
    const elapsed = start ? Math.max(0, Math.floor((now.getTime() - start.getTime()) / 60000)) : 0;
    const duration = Math.floor(elapsed / 60) + 'h ' + (elapsed % 60) + 'm';
    sh.getRange(active.rowNumber, 6, 1, 4).setValues([[now, duration, 'Clocked Out', now]]);
    SpreadsheetApp.flush();
    return { ok: true, message: 'Clock-out saved to Google Sheets. Duration: ' + duration + '.', member: publicMember_(m) };
  });
}
function requireAdmin_(pin) {
  const expected = props_().getProperty('ADMIN_PIN');
  if (!expected) throw new Error('Admin history access is not configured. Set ADMIN_PIN in Apps Script project settings.');
  if (String(pin || '') !== expected) throw new Error('Incorrect admin PIN.');
}
function searchAttendance_(filters) {
  const f = filters || {};
  const identity = digits_(f.identity || '');
  const name = String(f.name || '').trim().toLowerCase();
  const date = String(f.date || '').trim(), month = String(f.month || '').trim();
  const time = String(f.time || '').trim();
  return attendanceRows_().filter(r => {
    if (date && r.date !== date) return false;
    if (month && r.date.slice(0, 7) !== month) return false;
    if (time && !(r.clockIn.indexOf(time) === 0 || r.clockOut.indexOf(time) === 0)) return false;
    if (name && r.name.toLowerCase().indexOf(name) < 0) return false;
    if (identity && r.membershipId !== identity && normalizedMobile_(r.mobile) !== normalizedMobile_(identity)) return false;
    return true;
  }).sort((a, b) => (b.date + ' ' + b.clockIn).localeCompare(a.date + ' ' + a.clockIn)).map(r => ({
    date: r.date, membershipId: r.membershipId, name: r.name, mobile: r.mobile,
    clockIn: r.clockIn, clockOut: r.clockOut, duration: r.duration, status: r.status
  }));
}
function memberHistory_(membershipId) {
  const m = findMember_(membershipId);
  const records = attendanceRows_().filter(r => r.membershipId === m.membershipId)
    .sort((a, b) => (b.date + ' ' + b.clockIn).localeCompare(a.date + ' ' + a.clockIn))
    .map(r => ({ date: r.date, clockIn: r.clockIn, clockOut: r.clockOut, duration: r.duration, status: r.status }));
  return { ok: true, member: publicMember_(m), records: records };
}

/** Run once from the Apps Script editor after setting SPREADSHEET_ID to create headers. */
function setupAttendanceSheets() {
  membersSheet_();
  attendanceSheet_();
  SpreadsheetApp.flush();
}
