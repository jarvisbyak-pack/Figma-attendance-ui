import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
const script = scriptMatch?.[1] ?? '';

test('inline application JavaScript parses', () => {
  assert.ok(scriptMatch, 'index.html should contain the application script');
  assert.doesNotThrow(() => new vm.Script(script), 'application script must be syntactically valid');
});

test('all statically referenced element IDs exist and are unique', () => {
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'HTML IDs must be unique');
  const refs = [...script.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(match => match[1]);
  const missing = [...new Set(refs.filter(id => !ids.includes(id)))];
  assert.deepEqual(missing, [], 'every static $(id) reference must resolve to an HTML element');
});

test('five attendance views remain wired to the sidebar', () => {
  for (const view of ['members', 'clock', 'feed', 'admin', 'filter']) {
    assert.match(html, new RegExp('data-view="' + view + '"'));
  }
  assert.match(script, /document\.querySelectorAll\('\[data-view\]'\)/);
  assert.match(script, /sidebarToggle\.addEventListener\('click'/);
});

test('attendance records include membership expiry and retain all filter fields', () => {
  for (const id of ['filterDate', 'filterMonth', 'filterTime', 'filterName', 'filterIdentity']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /<th>Membership expiry<\/th>/);
  assert.match(script, /function withMemberExpiry\(/);
  assert.match(script, /function expiryInfo\(/);
  assert.match(script, /memberCache\.find/);
});

test('Apps Script accepts both ok and success response envelopes', () => {
  assert.match(script, /json\.ok===true\|\|json\.success===true/);
  assert.match(script, /result\.ok===true\|\|result\.success===true/);
});

test('member directory opens without an Admin PIN and provides collapsible filters', () => {
  for (const id of ['memberDirectory', 'memberDirectorySearch', 'memberDirectoryRefresh', 'memberDirectoryBody', 'memberDirectoryFilterToggle', 'memberDirectoryFilters', 'memberDirectoryExpiryFilter', 'memberDirectoryClearFilters']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.doesNotMatch(html, /id="memberDirectoryPin"/);
  assert.doesNotMatch(script, /memberDirectoryPin/);
  assert.match(script, /api\('memberList',\{adminPin:pin\}\)/);
  assert.match(script, /function renderMemberDirectory\(/);
  assert.match(script, /function loadMemberDirectory\(/);
  assert.match(script, /info\.kind===expiryFilter/);
  assert.match(script, /memberDirectoryFilterToggle.*addEventListener/);
});

test('responsive rules cover desktop, tablet, mobile and narrow screens', () => {
  assert.match(html, /grid-template-columns:248px minmax\(0,1fr\)/);
  assert.match(html, /@media\(max-width:1100px\) and \(min-width:681px\)/);
  assert.match(html, /@media\(max-width:680px\)/);
  assert.match(html, /@media\(max-width:380px\)/);
  assert.match(html, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(html, /env\(safe-area-inset-bottom\)/);
});

test('live-feed polling is guarded and stopped when the Admin Panel toggle is used', () => {
  assert.ok(script.includes("setInterval(()=>{if(feedViewActive&&endpoint&&$('adminPin').value.trim()&&!busy)searchRecords(false)},5000)"));
  assert.ok(script.includes("$('adminPanelToggle').addEventListener('click',()=>{feedViewActive=false"));
});

test('Members is a searchable all-fields directory and clock actions live in their own view', () => {
  assert.match(html, /data-view="clock"/);
  assert.match(html, /id="clockPanel"/);
  assert.match(html, /id="connectionMessage"/);
  assert.match(script, /setMessage\('connectionMessage','URL saved on this device, but connection failed:/);
  assert.match(html, /id="membersPanel"/);
  assert.match(script, /JSON\.stringify\(m\|\|\{\}\)\.toLowerCase\(\)\.includes\(query\)/);
  assert.match(script, /JSON\\.stringify\\(m\\|\\|\\{\\}\\)\\.toLowerCase\\(\\)\\.includes\\(query\\)/);
  assert.match(script, /__computedExpiryCondition/);
  assert.match(script, /memberDirectorySearch'\)\.addEventListener\('input'/);
  assert.match(html, /\.shell\[data-current-view="members"\] \.layout\{display:block/);
});

test('clock-in photo capture requires notice and sends a compressed photo to the backend', () => {
  assert.match(html, /id="photoConsentModal"/);
  assert.match(html, /Photo required for clock-in/);
  assert.match(html, /takes one photo when you clock in/i);
  assert.match(script, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(script, /canvas\.toDataURL\('image\/jpeg',0\.65\)/);
  assert.match(script, /payload=Object\.assign\(payload,photo\)/);
  assert.match(script, /photoBase64/);
  assert.match(script, /photoMimeType/);
  assert.match(html, /<th>Photo<\/th>/);
  assert.match(script, /link\.rel='noopener noreferrer'/);
});
