(function () {
  "use strict";

  const CFG = window.PARTY_CONFIG || {};
  const LIVE = Boolean(CFG.sheetUrl && CFG.sheetUrl.trim());
  const COURSES = [
    { key: "Food", label: "Food" },
    { key: "Drink", label: "Drinks" },
    { key: "Dessert", label: "Desserts" },
    { key: "Other", label: "Odds & Ends" },
  ];

  // Google Apps Script can take a minute or more to wake up.
  const TIMEOUT_MS = 120000;

  const DEMO_ENTRIES = [
    { name: "Laurie", guests: 1, attending: "Yes", category: "Food", item: "Michael Myers' meatballs" },
    { name: "Ash", guests: 2, attending: "Yes", category: "Drink", item: "Boomstick punch" },
    { name: "Carrie", guests: 1, attending: "Maybe", category: "Dessert", item: "Prom-night cherry trifle" },
    { name: "Victor", guests: 2, attending: "Yes", category: "Food", item: "It's-alive seven-layer dip" },
    { name: "Sidney", guests: 1, attending: "Yes", category: "", item: "" },
  ];

  // Read-only web view of the published "Public" tab, for impatient guests.
  const SHEET_VIEW_URL =
    CFG.publicSheetUrl ||
    (CFG.publicCsvUrl ? CFG.publicCsvUrl.replace("/pub?", "/pubhtml?").replace(/&?output=csv/, "") : "");

  let entries = [];
  let submitGen = 0; // bumped on each saved RSVP; see load()

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // ---------------- Body count ----------------
  function renderStats() {
    const invited = Number(CFG.invited) || 0;
    const expected = Number(CFG.expected) || 0;
    const confirmed = entries
      .filter((e) => e.attending === "Yes")
      .reduce((sum, e) => sum + (Number(e.guests) || 1), 0);

    $("stat-invited").textContent = invited || "–";
    $("stat-expected").textContent = expected || "–";
    $("stat-rsvp").textContent = confirmed;

    const start = new Date(CFG.partyStart || "2026-10-24T18:00:00");
    const msLeft = start - new Date();
    const days = Math.ceil(msLeft / 86400000);
    if (msLeft <= 0) {
      $("stat-days").textContent = "0";
      $("stat-days-lbl").textContent = "It has begun";
    } else {
      $("stat-days").textContent = days;
      $("stat-days-lbl").textContent = days === 1 ? "Night to go" : "Nights to go";
    }

    const pct = expected ? Math.min(100, Math.round((confirmed / expected) * 100)) : 0;
    $("meter-fill").style.width = pct + "%";

    const maybes = entries.filter((e) => e.attending === "Maybe").reduce((s, e) => s + (Number(e.guests) || 1), 0);
    const bits = [];
    if (expected) bits.push(`${confirmed} of ${expected} expected souls confirmed`);
    if (maybes) bits.push(`${maybes} still deciding`);
    if (CFG.lastUpdated) bits.push(`estimates updated ${CFG.lastUpdated}`);
    $("stat-note").textContent = bits.join(" · ");
  }

  // ---------------- Feast ----------------
  function renderFeast() {
    const grid = $("feast-grid");
    grid.replaceChildren();

    const coming = entries.filter((e) => e.attending !== "No");
    const withDish = coming.filter((e) => e.item && e.item.trim());

    for (const course of COURSES) {
      const dishes = withDish.filter((e) => (e.category || "Other") === course.key);
      if (course.key === "Other" && !dishes.length) continue;

      const box = el("div", "course");
      const h = el("h3", null, course.label);
      h.appendChild(el("small", null, String(dishes.length)));
      box.appendChild(h);

      const ul = el("ul");
      if (!dishes.length) {
        ul.appendChild(el("li", "empty", "Nothing yet — be the first victim."));
      }
      for (const d of dishes) {
        const li = el("li");
        li.appendChild(el("span", "dish", d.item));
        const who = el("span", "who", "brought by " + d.name);
        if (d.attending === "Maybe") who.appendChild(el("span", "tag-maybe", "(maybe)"));
        li.appendChild(who);
        ul.appendChild(li);
      }
      box.appendChild(ul);
      grid.appendChild(box);
    }

    const noDish = coming.filter((e) => !(e.item && e.item.trim()));
    const gl = $("guestlist");
    if (noDish.length) {
      $("guestlist-names").textContent = noDish
        .map((e) => e.name + (Number(e.guests) > 1 ? ` (+${e.guests - 1})` : "") + (e.attending === "Maybe" ? " — maybe" : ""))
        .join(" · ");
      gl.hidden = false;
    } else {
      gl.hidden = true;
    }
  }

  function render() {
    renderStats();
    renderFeast();
  }

  // ---------------- Data ----------------
  // The last list this browser saw, shown instantly while a fresh one loads.
  const STORE_KEY = "hmm-entries-v3";
  // When this browser last saved an RSVP; see fetchList().
  const SUBMITTED_KEY = "hmm-submitted-at";
  const PUBLISH_LAG_MS = 10 * 60 * 1000;

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (_) { /* storage blocked */ }
  }
  function remember(list) {
    store(STORE_KEY, JSON.stringify(list));
  }
  function recall() {
    try {
      const list = JSON.parse(localStorage.getItem(STORE_KEY));
      return Array.isArray(list) ? list : null;
    } catch (_) {
      return null;
    }
  }
  function submittedRecently() {
    try {
      return Date.now() - Number(localStorage.getItem(SUBMITTED_KEY) || 0) < PUBLISH_LAG_MS;
    } catch (_) {
      return false;
    }
  }

  // Minimal CSV parser (handles quoted fields, "" escapes, and newlines in quotes).
  function parseCsv(text) {
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  async function fetchFromScript() {
    const res = await fetch(CFG.sheetUrl, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const data = await res.json();
    return Array.isArray(data.entries) ? data.entries : [];
  }

  async function fetchList() {
    // The published "Public" tab loads in about a second but lags a few
    // minutes behind the Sheet. Right after this browser submits, ask the
    // (slower, always current) script instead so their RSVP doesn't vanish.
    if (CFG.publicCsvUrl && !submittedRecently()) {
      try {
        const res = await fetch(CFG.publicCsvUrl, { cache: "no-store", signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error("Published tab returned " + res.status);
        return parseCsv(await res.text())
          .slice(1)
          .filter((r) => r.some((c) => c.trim()))
          .map(([name, guests, attending, category, item]) => ({
            name: name || "",
            guests: Number(guests) || 1,
            attending: attending || "",
            category: category || "",
            item: item || "",
          }));
      } catch (err) {
        console.error(err); // fall back to the script
      }
    }
    return fetchFromScript();
  }

  async function load() {
    if (!LIVE) {
      entries = DEMO_ENTRIES.slice();
      $("demo-note").hidden = false;
      render();
      return;
    }
    const gen = submitGen;
    const saved = recall();
    if (saved) {
      entries = saved;
      render();
    }
    try {
      const list = await fetchList();
      // An RSVP was saved while this request was in flight; the script's
      // reply to it is newer than this list, so keep that.
      if (gen !== submitGen) return;
      entries = list;
      remember(entries);
      render();
    } catch (err) {
      console.error(err);
      if (saved) return; // keep showing the last known list
      renderStats();
      const p = el("p", "loading", "The spirits are quiet… couldn't load the guest list. Try refreshing");
      if (SHEET_VIEW_URL) {
        p.append(", or ");
        const a = el("a", null, "peek at the guest list sheet");
        a.href = SHEET_VIEW_URL;
        a.target = "_blank";
        a.rel = "noopener";
        p.append(a);
      }
      p.append(".");
      $("feast-grid").replaceChildren(p);
    }
  }

  // Point the "Google is slow" note at the read-only sheet, if published.
  if (SHEET_VIEW_URL) {
    $("sheet-link").href = SHEET_VIEW_URL;
    $("sheet-link-wrap").hidden = false;
  }

  // ---------------- Form ----------------
  const form = $("rsvp-form");
  const msg = $("form-msg");
  const bring = form.querySelector(".bring");
  // Look fields up by name: form.elements.item would return the built-in item() method.
  const field = (n) => form.elements.namedItem(n);

  field("attending").addEventListener("change", () => {
    bring.disabled = field("attending").value === "No";
  });

  // Returns the fresh entry list if it holds one more copy of `entry` than
  // the page already knew about (i.e. the submission was saved), else null.
  async function savedEntries(entry) {
    const same = (e) =>
      String(e.name) === entry.name &&
      String(e.item || "") === entry.item &&
      String(e.category || "") === entry.category &&
      String(e.attending) === entry.attending &&
      Number(e.guests) === entry.guests;
    const before = entries.filter(same).length;
    try {
      const list = await fetchFromScript();
      return list.filter(same).length > before ? list : null;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  function setMsg(text, kind) {
    msg.textContent = text;
    msg.className = "form-msg" + (kind ? " " + kind : "");
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const name = field("name").value.trim();
    field("name").setAttribute("aria-invalid", name ? "false" : "true");
    if (!name) {
      setMsg("We need a name to carve on the tombstone.", "err");
      field("name").focus();
      return;
    }

    const attending = field("attending").value;
    const payload = {
      name,
      attending,
      guests: String(Math.min(10, Math.max(1, parseInt(field("guests").value, 10) || 1))),
      category: attending === "No" ? "" : field("category").value,
      item: attending === "No" ? "" : field("item").value.trim(),
      note: field("note").value.trim(),
      website: field("website").value,
    };

    const btn = form.querySelector("button");
    const btnLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Sending…";
    setMsg("Sending your soul into the void… (this can take a couple spooky minutes)");

    try {
      const entry = { name: payload.name, guests: Number(payload.guests), attending, category: payload.category, item: payload.item };
      if (LIVE) {
        let data = null;
        try {
          const res = await fetch(CFG.sheetUrl, { method: "POST", body: new URLSearchParams(payload), signal: AbortSignal.timeout(TIMEOUT_MS) });
          data = await res.json();
        } catch (err) {
          // Google sometimes saves the row but sends back an empty reply.
          // Re-read the list to see whether it landed before reporting failure.
          console.error(err);
          setMsg("Double-checking with the spirits…");
          const fresh = await savedEntries(entry);
          if (!fresh) throw err;
          entries = fresh;
        }
        if (data && !data.ok) throw new Error(data.error || "Submission failed");
        if (data) {
          // The script replies with the updated list; fall back to adding locally.
          if (Array.isArray(data.entries)) entries = data.entries;
          else entries.push(entry);
        }
        remember(entries);
        store(SUBMITTED_KEY, String(Date.now()));
      } else {
        entries.push(entry);
      }
      submitGen++;
      render();
      form.reset();
      bring.disabled = false;
      setMsg(
        attending === "No"
          ? "Noted — you'll be missed. Thanks for letting us know!"
          : "You're on the list! " + (payload.item ? "Your dish is on the menu below." : "") + (LIVE ? "" : " (demo mode — not saved)"),
        "ok"
      );
      if (attending !== "No" && payload.item) $("feast").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      console.error(err);
      setMsg("Something went bump in the night and your RSVP didn't save. Please try again, or text the hosts.", "err");
    } finally {
      btn.disabled = false;
      btn.textContent = btnLabel;
    }
  });

  load();
})();
