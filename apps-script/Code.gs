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
 */

// The long ID from your Sheet's address bar:
//   https://docs.google.com/spreadsheets/d/THIS_PART_HERE/edit
// Only needed if this script wasn't created from inside the Sheet.
const SHEET_ID = "";

const SHEET_NAME = "RSVPs";
const HEADERS = ["Timestamp", "Name", "Guests", "Attending", "Category", "Item", "Note to hosts", "Hide"];

function getSheet_() {
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("No spreadsheet found: set SHEET_ID at the top of this script.");
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

// GET → public list for the website (private notes are never sent).
function doGet() {
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
  return json_({ ok: true, entries: entries });
}

// POST ← RSVP form submission.
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
  try {
    getSheet_().appendRow([
      new Date(), name, guests, attending, category,
      clean_(p.item, 120), clean_(p.note, 500), "",
    ]);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}
