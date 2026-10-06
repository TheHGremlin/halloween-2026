/**
 * Horror Movie Madness — RSVP backend
 * Paste this into Extensions → Apps Script on your Google Sheet,
 * then Deploy → New deployment → Web app (Execute as: Me, Access: Anyone).
 *
 * Sheet columns (created automatically on first use):
 *   Timestamp | Name | Guests | Attending | Category | Item | Note to hosts | Hide
 *
 * To hide an entry from the website (duplicate, typo, prank), type anything
 * in its "Hide" column. You can also just edit or delete rows directly.
 *
 * Speed: the public guest list is kept in a short-term cache so the site
 * doesn't have to open the Sheet on every visit. New RSVPs refresh it
 * immediately. Run `setUp` once (pick it in the function dropdown, click Run)
 * so your own edits to the Sheet refresh it too; otherwise they show up on
 * the site within CACHE_SECONDS.
 */

// The long ID from your Sheet's address bar:
//   https://docs.google.com/spreadsheets/d/THIS_PART_HERE/edit
// Only needed if this script wasn't created from inside the Sheet.
const SHEET_ID = "";

const SHEET_NAME = "RSVPs";
const PUBLIC_SHEET_NAME = "Public";
const HEADERS = ["Timestamp", "Name", "Guests", "Attending", "Category", "Item", "Note to hosts", "Hide"];

const CACHE_KEY = "public-entries";
const CACHE_SECONDS = 6 * 60 * 60; // the maximum Apps Script allows

function getSpreadsheet_() {
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("No spreadsheet found: set SHEET_ID at the top of this script.");
  return ss;
}

function getSheet_() {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Strip newlines, trim, cap length, and stop spreadsheet formula injection.
function clean_(value, max) {
  let s = String(value || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

// Read the Sheet and refresh the cache. Private notes are never included.
function readEntries_() {
  const rows = getSheet_().getDataRange().getValues().slice(1);
  const entries = rows
    .filter(function (r) { return r[1] && !r[7]; })
    .map(function (r) {
      return {
        name: String(r[1]).replace(/^'/, ""),
        guests: Number(r[2]) || 1,
        attending: String(r[3]),
        category: String(r[4]),
        item: String(r[5]).replace(/^'/, ""),
      };
    });
  CacheService.getScriptCache().put(CACHE_KEY, JSON.stringify(entries), CACHE_SECONDS);
  return entries;
}

function cachedEntries_() {
  const hit = CacheService.getScriptCache().get(CACHE_KEY);
  return hit ? JSON.parse(hit) : readEntries_();
}

// GET → public list for the website.
function doGet() {
  return json_({ ok: true, entries: cachedEntries_() });
}

// POST ← RSVP form submission. Replies with the updated list.
function doPost(e) {
  const p = (e && e.parameter) || {};
  if (p.website) return json_({ ok: true }); // honeypot: bots fill hidden fields

  const name = clean_(p.name, 60);
  if (!name) return json_({ ok: false, error: "Name is required" });

  const guests = Math.min(10, Math.max(1, parseInt(p.guests, 10) || 1));
  const attending = ["Yes", "Maybe", "No"].indexOf(p.attending) >= 0 ? p.attending : "Yes";
  const category = ["Food", "Drink", "Dessert", "Other"].indexOf(p.category) >= 0 ? p.category : "";

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let entries;
  try {
    getSheet_().appendRow([
      new Date(), name, guests, attending, category,
      clean_(p.item, 120), clean_(p.note, 500), "",
    ]);
    SpreadsheetApp.flush();
    entries = readEntries_();
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true, entries: entries });
}

// Trigger target: any hand edit to the Sheet (typing, deleting rows,
// the Hide column) drops the cached list so the site re-reads it.
function clearCache() {
  CacheService.getScriptCache().remove(CACHE_KEY);
}

// Run once from the editor. Safe to run again; it won't add duplicates.
// Also builds the "Public" tab: name, guests, attending, category and dish
// for every visible RSVP (no timestamps, no private notes). Publish only that
// tab to the web (File → Share → Publish to web → Public, CSV) for fast page
// loads and a read-only guest list people can open directly.
function setUp() {
  const ss = getSpreadsheet_();
  getSheet_();
  let pub = ss.getSheetByName(PUBLIC_SHEET_NAME);
  if (!pub) pub = ss.insertSheet(PUBLIC_SHEET_NAME);
  pub.clear();
  pub.getRange(1, 1, 1, 5).setValues([["Name", "Guests", "Attending", "Category", "Item"]]).setFontWeight("bold");
  pub.setFrozenRows(1);
  // RSVPs columns B:F are Name, Guests, Attending, Category, Item; H is Hide.
  pub.getRange("A2").setFormula(
    "=IFERROR(FILTER(" + SHEET_NAME + "!B2:F, " + SHEET_NAME + "!B2:B<>\"\", " + SHEET_NAME + "!H2:H=\"\"), \"\")"
  );

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "clearCache") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("clearCache").forSpreadsheet(ss).onChange().create();
  clearCache();
}
