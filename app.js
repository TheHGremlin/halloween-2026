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

  const DEMO_ENTRIES = [
    { name: "Laurie S.", guests: 1, attending: "Yes", category: "Food", item: "Michael Myers' meatballs" },
    { name: "Ash W.", guests: 2, attending: "Yes", category: "Drink", item: "Boomstick punch" },
    { name: "Carrie W.", guests: 1, attending: "Maybe", category: "Dessert", item: "Prom-night cherry trifle" },
    { name: "Dr. Frankenstein", guests: 2, attending: "Yes", category: "Food", item: "It's-alive seven-layer dip" },
    { name: "Sidney P.", guests: 1, attending: "Yes", category: "", item: "" },
  ];

  let entries = [];

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
  async function load() {
    if (!LIVE) {
      entries = DEMO_ENTRIES.slice();
      $("demo-note").hidden = false;
      render();
      return;
    }
    try {
      const res = await fetch(CFG.sheetUrl, { cache: "no-store", signal: AbortSignal.timeout(60000) });
      const data = await res.json();
      entries = Array.isArray(data.entries) ? data.entries : [];
      render();
    } catch (err) {
      console.error(err);
      renderStats();
      $("feast-grid").replaceChildren(el("p", "loading", "The spirits are quiet… couldn't load the guest list. Try refreshing."));
    }
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
    setMsg("Sending your soul into the void… (this can take a few seconds)");

    try {
      if (LIVE) {
        const res = await fetch(CFG.sheetUrl, { method: "POST", body: new URLSearchParams(payload), signal: AbortSignal.timeout(60000) });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Submission failed");
      }
      entries.push({ name: payload.name, guests: Number(payload.guests), attending, category: payload.category, item: payload.item });
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
