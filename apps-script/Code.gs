/**
 * ค้นหาสินค้า — data API for the GitHub Pages app
 *
 * Reads your PRIVATE Google Sheet and returns only the columns the app needs,
 * only for products with status = show. The sheet's ID is kept in Script
 * properties, so it never appears in this code or on GitHub.
 *
 * Setup (once):
 *   1. Project Settings ⚙ → Script properties → Add property
 *        Property: SHEET_ID    Value: the ID from your sheet's URL
 *        (https://docs.google.com/spreadsheets/d/ THIS_PART /edit)
 *   2. Run testBuild once and allow access when Google asks.
 *   3. Deploy → New deployment → type: Web app
 *        Execute as: Me      Who has access: Anyone
 *      Copy the URL ending in /exec into config.js on GitHub.
 *
 * After editing the sheet, customers see the change within CACHE_SECONDS.
 * Run clearCache to make it show immediately.
 */

const CACHE_SECONDS = 300;          // 5 minutes
const PRODUCT_SHEET = 'สินค้า';
const GROUP_SHEET = 'กลุ่ม';
const CHUNK = 30000;                // CacheService allows max 100 KB per value

function doGet() {
  let body;
  try {
    body = getData_();
  } catch (err) {
    body = JSON.stringify({ error: String(err && err.message || err) });
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function getData_() {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('data_n') || 0);
  if (n) {
    const keys = [];
    for (let i = 0; i < n; i++) keys.push('data_' + i);
    const parts = cache.getAll(keys);
    if (keys.every(k => parts[k] != null)) return keys.map(k => parts[k]).join('');
  }
  const json = JSON.stringify(buildData_());
  try {
    const items = { data_n: String(Math.ceil(json.length / CHUNK)) };
    for (let i = 0; i * CHUNK < json.length; i++) items['data_' + i] = json.substr(i * CHUNK, CHUNK);
    cache.putAll(items, CACHE_SECONDS);
  } catch (err) { /* too big to cache: still return fresh data */ }
  return json;
}

function buildData_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('SHEET_ID is not set in Script properties');
  const ss = SpreadsheetApp.openById(id);

  const rows = name => {
    const sh = ss.getSheetByName(name);
    if (!sh) throw new Error('Sheet not found: ' + name);
    const v = sh.getDataRange().getValues();
    const head = v.shift().map(h => String(h).trim());
    return v.map(r => { const o = {}; head.forEach((h, i) => { o[h] = r[i]; }); return o; });
  };
  const s = x => (x === null || x === undefined) ? '' : String(x).trim();
  const num = x => {
    const n = typeof x === 'number' ? x : parseFloat(String(x).replace(/,/g, ''));
    return isFinite(n) ? n : 0;
  };

  const groups = rows(GROUP_SHEET)
    .filter(r => s(r['กลุ่ม']))
    .map(r => [s(r['กลุ่ม']), s(r['ไฟล์ต้นทาง']), s(r['คำพ้อง']), s(r['ประเภทงาน']), s(r['คำอธิบาย']), s(r['ซื้อคู่กัน'])]);

  const products = rows(PRODUCT_SHEET)
    .filter(r => s(r['status']).toLowerCase() === 'show' && s(r['CODE']))
    .map(r => [
      s(r['CODE']),
      s(r['NAME']),
      Math.round(num(r['PRICE_3']) * 100) / 100,
      s(r['UNIT_TYPE']),
      s(r['กลุ่ม']),
      Math.max(0, num(r['QTY2_RATE']))
    ]);

  return { v: 1, updated: new Date().toISOString(), groups: groups, products: products };
}

/** Run this after editing the sheet to show changes immediately. */
function clearCache() {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('data_n') || 0);
  const keys = ['data_n'];
  for (let i = 0; i < n; i++) keys.push('data_' + i);
  cache.removeAll(keys);
}

/** Run once from the editor to grant access and check the numbers. */
function testBuild() {
  const d = buildData_();
  Logger.log(d.groups.length + ' groups, ' + d.products.length + ' products (status = show)');
}
