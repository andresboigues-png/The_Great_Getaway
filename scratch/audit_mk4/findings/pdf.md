# MK4 Audit — PDF EXPORT domain

Scope: `src/routes/pdf.py` (whole, 2386 lines), `frontend/static/js/src/modals/pdf.ts`,
`frontend/static/js/src/pages/budgets/helpers.ts`. Harness:
`scratch/audit_mk4/pdf_harness.py` (live server port 5089 + direct `_build_trip_pdf`).
Sample artifacts: `scratch/audit_mk4/sample_full_trip.pdf` (24pp, rich 17-day trip) +
`sample_full_trip.txt` (pypdf text extraction).

Deps present: reportlab 4.5.1, Pillow, pypdf 6.12.2.

## Verdict (one line)
The PDF is **handsomely designed** and robust against most garbage input, BUT it has
**two structural gaps**: (1) a **page-long day journal entry crashes the entire export**
(single-cell Table can't paginate), and (2) **expenses, settlements, and photos are simply
not in the document at all** — money is reduced to a budget table + two total rows. i18n is
absent: every PDF is English regardless of the user's locale.

## Dedupe status vs prior audits
- MK2 **BUG-1** (notes dropped server-side): **FIXED** — day `notes`/journaling render
  (pdf.py:1229-1253). `[REPRODUCED]` ("lovely"/"memorable" present in sample text).
- MK1 **PLAT-1** / MK2 **BUG-21** (budget total mis-sums mixed currencies as EUR; budgets
  print "Untitled"): **FIXED** — total sums `b['amount']` (EUR-normalised) and labels are
  scope-derived ("Overall · Bruno") in the route. `[REPRODUCED]` (B6: 2 budgets USD+JPY →
  total "EUR 1,500", buggy-sum "81,100" absent; live trip shows "Overall").
- MK1 **PLAT-7** (non-numeric day_number 500s export): **FIXED** — guarded `int()`.
  `[REPRODUCED]` (B2: fractional/garbage/huge/negative day_number all render).
- MK2 **BUG-27** ("two Day 1" badge): was the **share page**, not the PDF. PDF day cards
  are clean (badge number + name title, no duplication). `[REPRODUCED]` (sample: "Day 1
  City" … "Day 17 City"). Not a PDF issue.
- MK1 **PLAT-8** (outbound image-fetch SSRF/redirect): map fetchers validate coords via
  `_safe_coord`/`_safe_latlng` and reject injection-shaped labels. No NET-NEW issue found;
  `requests.get` follows redirects by default but the URL is a fixed Google host with
  validated params — low risk, not re-reporting.
- MK3 named test `test_pdf_budget_table_labels_and_original_currency`: **PASSES on clean
  tree now** (see PDF-9). `[REPRODUCED]`.

All 7 existing PDF tests pass (`pytest tests/test_api.py -k pdf` → 7 passed).

---

# BUGS

## PDF-1 — A single page-long day journal crashes the WHOLE PDF export (500) — P1, Bug
**file:** `src/routes/pdf.py:1098-1283` (`_day_card`), `:1272-1281` (card Table),
`:1813` (`KeepTogether`), `:2160-2171` (build try/except). `[REPRODUCED]`

**What:** Each day is rendered as a **single-row, single-cell `Table`** (`rl.Table([[inner]], …)`
at line 1272) wrapped in `KeepTogether` (line 1813). Reportlab **cannot split a single
oversized table cell across pages.** So the moment one day's content (journaling +
morning/afternoon/evening) exceeds ~one printable page, `doc.build` raises a LayoutError
("…too large on page N…"), which the route converts to an HTTP **500** (`{"error":"PDF
generation failed — likely a section too long…"}`). The PDF is **not produced at all** —
every other day, the cover, budgets, everything is lost.

The threshold is alarmingly low: **~5,400 characters (~800 words) of ordinary journal text
on ONE day fails.** A page of writing about a single day is entirely realistic for the
"✍️ Journaling" feature (`en.ts:1432`).

**Reproduction (`/tmp/mk4_kt.py`):**
```
~1.3pg (5400 chars):  FAIL RuntimeError: PDF generation failed …
~2.5pg (10098 chars): FAIL
~5pg  (20250 chars):  FAIL
```
And end-to-end via HTTP (`/tmp/mk4_huge.py`): a trip with one big-note day + one normal day
returns `STATUS 500 CT application/json` — the normal day never renders.

**Why the docstring is wrong:** Lines 1108-1109 and 1810-1812 claim *"Long days (lots of
notes) STILL split — KeepTogether falls back to natural flow when the block exceeds a single
page."* This is **false**. KeepTogether's fallback applies to a *list* of flowables; here the
flowables are sealed inside one Table cell, which is atomic. Proof of the distinction: a
**120-row budget Table** (multi-row, no KeepTogether) **splits fine across 6 pages**
(`/tmp/mk4_budtable.py` → "OK pages=6"). Multi-row tables split; a single giant cell does not.

**Why it matters:** Export is the headline feature of this module. A verbose journaler — the
exact user who most wants a printed keepsake — silently cannot export their trip and gets a
generic 500 toast. The friendly error text (PDF-1 mitigation) tells them to "shorten the
longest note", but they have no way to know which day is the culprit.

**Fix suggestion:** Don't wrap day content in a single-cell Table. Either (a) render the day
header + body as a flat list of flowables inside `KeepTogether([...])` (so the body
paragraphs paginate naturally and only the header is kept-with-next), or (b) drop the card
Table and draw the "card" background via a frame/`onPage` decoration. If a card look is
required, split the long `notes`/slot paragraphs into multiple cells/rows so the Table has
splittable row boundaries. Minimum viable: render the card header in a small Table but emit
the body paragraphs as top-level flowables (not inside the cell).

---

## PDF-2 — Individual expenses are never listed in the PDF — P2, Bug (completeness)
**file:** `src/routes/pdf.py` (no expense-rendering code anywhere; only the
`total_spend_eur` aggregate at :2324-2332 + the budget table at :1934-2003). `[REPRODUCED]`

**What:** The brief asks "does the PDF actually contain ALL the info — every expense…?" It
does **not**. There is no expenses section. The only money output is the Budgets section: a
table of planned line items + two footer rows ("Total planned", "Actual trip spend"). A user
with 40 expenses across the trip sees a single number, never the itemised list. `grep -n
expense src/routes/pdf.py` shows expenses are queried **only** as `SUM(euro_value)`.

Harness: live full-trip export with 4 expenses (EUR/USD/JPY/GBP) → "Expense 0" not found in
PDF text; only the EUR-normalised total (247) appears.

**Why it matters:** For a trip-plan keepsake/print this is defensible, but the export modal
has no "expenses" toggle and the cover stat tile is literally "SPEND" — users reasonably
expect the spend breakdown. This is the single biggest completeness gap after PDF-3.

**Fix suggestion:** Add an opt-in "Expenses" section (table: date · description · category ·
original amount+currency · EUR value), grouped by day or category, with a per-currency
subtotal block. Mirror the budget table's multi-row Table (which paginates correctly).

---

## PDF-3 — Settlements are never shown; "Actual trip spend" has no settlement context — P2, Bug
**file:** `src/routes/pdf.py:2319-2332`. `[REPRODUCED]`

**What:** Settlement expenses (`is_settlement=1`) are *correctly excluded* from the spend
total (good — matches balances.ts), but the PDF has **no settlements/who-owes-whom section
at all**. A group trip's entire settle-up story (the core of the money feature) is invisible
in the export. Harness: a €30 settlement row exists; "Settlement"/"settle" absent from PDF.

**Why it matters:** Group-trip users export to share "here's the plan + here's the
money/settle-up." The settle-up half is missing. Combined with PDF-2, the money story in the
PDF is just two aggregate numbers.

**Fix suggestion:** Add an opt-in "Settle up" section rendering the per-currency balances /
suggested transfers (reuse the same balance computation the app uses). Or, minimally, list
the settlement transactions that have been recorded.

---

## PDF-4 — Photos are never embedded (trip cover photo + per-day photos) — P2, Bug (completeness)
**file:** `src/routes/pdf.py:2257-2261` (day SELECT omits `photos`/`documents`),
`_day_card` (no photo rendering), `export_trip_pdf` (no trip `photos_json` fetch).
`[REPRODUCED]` / `[TRACED]`

**What:** `trip_days` has `photos TEXT` and `documents TEXT` columns (database.py:628+), and
trips have `photos_json`. The PDF embeds **only Google Static Maps** images — never user
photos. The day SELECT doesn't even fetch the `photos`/`documents` columns, and there's no
trip-cover-photo embed (the cover uses a *map*, not the user's cover image). The brief
explicitly asks about photos.

**Why it matters:** A "trip plan / keepsake" PDF without the user's own photos misses the
emotional payload. The export modal also has no photos toggle, so users can't even discover
the omission.

**Fix suggestion:** Add an opt-in "Photos" section (or inline per-day thumbnails). Fetch
`photos_json` + per-day `photos`, download/validate each URL with the same fail-soft +
size-cap discipline as the map fetchers, and lay them out in a grid. Respect the media
write-path invariant — read-only here.

---

## PDF-5 — PDF is English-only; no locale/i18n on any section, header, date, or money — P2, Bug
**file:** `src/routes/pdf.py:2197` (route reads only `request.json` for options — no
`locale`/`lang`/`Accept-Language`); all section titles/labels hardcoded (e.g. :1734
"Day-by-day", :1891 "Checklist", :1940 "Budgets", :2011 "Companions", :2029 "Marked places",
:1202 "MORNING/AFTERNOON/EVENING", :1978 "Total planned (EUR-normalised)", :1264 "No plan
yet for this day."). Client `modals/pdf.ts` never sends a locale. `[REPRODUCED]`

**What:** Every visible string in the PDF is English. A FR/PT/ES user's export has English
chapter titles, English slot labels, English money labels. Harness: posting
`{"lang":"fr","locale":"fr"}` still yields "Day-by-day" (English header present=True). The
options blob is the *only* input; locale is never consulted.

Money/date formatting is also locale-blind: `f"€{int(x):,}"` (:1665) and `f"EUR {x:,.0f}"`
(:1973,:1978,:1982) always use `,` thousands + `.` decimal (en style), never `1.800,00 €`
(fr/es/pt). This is the PDF-wide analogue of MK2 BUG-30 (which was fixed for the *web* money
display only).

**Why it matters:** The app is fully localized (en/fr/pt/es locale files exist and the modal
UI itself is translated via `t()`), so a French user opens a French modal and downloads an
English document — jarring and incomplete.

**Fix suggestion:** Have `modals/pdf.ts` send the active locale in the POST body; thread it
into `_build_trip_pdf` and route all literals through a small server-side string table +
locale-aware number/date formatting (Babel is already implied by the i18n stack). At minimum
translate section titles, slot labels, and the budget total labels.

---

## PDF-6 — Per-row budget amount uses `:,.0f` — drops cents + can round the figure — P3, Bug
**file:** `src/routes/pdf.py:1971,1973`. `[TRACED]`

**What:** `planned_disp = f"{orig_curr} {float(orig_amount):,.0f}"` — a budget of USD 1,100.50
renders "USD 1,101" (rounded up, cents lost). Same `,.0f` on the EUR fallback and the totals
(:1978,:1982). For round budgets this is fine; for budgets with cents it silently misstates
the amount.

**Why it matters:** Minor, but a money figure that prints a *different* number than the user
entered is a correctness smell. Currencies like JPY genuinely have no minor unit (0 dp is
right), but USD/EUR/GBP budgets with cents are misrendered.

**Fix suggestion:** Format with currency-aware decimal places (0 for JPY/KRW/etc., 2 for the
rest), or just use `:,.2f` for non-zero-decimal currencies.

---

# DESIGN (taste calls — user accepts/rejects)

## PDF-D1 — `sample_full_trip.pdf` is 4.4 MB / 24 pages for a 17-day trip — Design (P2)
`[REPRODUCED]`. Every day gets its own full-width static-map tile (`includeDayPins` default
ON) at `scale=2` 800×320 — ~20 day maps + overview + cover. The doc is map-heavy and large.
Against the "sharp/minimal Apple-like" north-star this reads as busy. Consider: smaller/
optional per-day maps, or a single overview map + tiny day thumbnails. The default-everything
posture makes the *typical* export the heaviest one.

## PDF-D2 — Day card with a place name shows badge "N" + title = place name; days with a
name but NO `day_number` are silently dropped — Design (P3)
`[TRACED]` / `[REPRODUCED]` (B14). `_day_has_content` (pdf.py:1576-1584) requires
`(name AND day_number)` for a name-only day to count; a day with `day_number=None` + a name
("Arrival") is **dropped** from both the cover count and the body. Edge, but a user who names
a day without a number loses it. The badge falls back to "•" (:1136) when no number — fine.
Recommend: render named days even without a number (use "•" badge), or document the rule.

## PDF-D3 — No RTL/BiDi reordering for Arabic/Hebrew — Design (P3)
`[TRACED]`. `_strip_emoji` correctly *keeps* Arabic glyphs (verified: "أحمد محمد" survives),
but reportlab's `Paragraph` does no BiDi reordering, so RTL text renders left-to-right
(visually scrambled). Known reportlab limitation; flag as a caveat, not a quick fix.

## PDF-D4 — "Untitled" budget fallback inside `_build_trip_pdf` (label derivation is
route-coupled) — Design/robustness (P3)
`[REPRODUCED]` (B6/B7). The friendly scope-derived label ("Overall", "Food · Bruno") is
computed in the **route** (`export_trip_pdf`, :2304-2315), not in `_build_trip_pdf`. The
builder's own fallback is the bare string "Untitled" (:1975). So any *other* caller of
`_build_trip_pdf` (or a budget row that slips through without the route's enrichment) prints
"Untitled". Not reachable via the live route today, but brittle. Recommend moving the
label-derivation into the builder (or a shared helper) so the fallback is never "Untitled".

---

# Things checked and found GOOD (no finding)
- **IDOR:** non-member exporting a private trip → **403** (`[REPRODUCED]` A-IDOR). Read gate
  = `trip_member_role` (owner or *accepted* member only; pending invites get None). 404 for
  unknown trip before the 403 (no existence leak). Sound.
- **Money totals:** mixed-currency budget total correctly sums EUR-normalised `amount`, not
  raw originals (PLAT-1/BUG-21 fixed). Settlement rows excluded from "Actual trip spend"
  (247 = 50+100+50+47, not 277). `[REPRODUCED]`.
- **Robustness:** HTML in labels/notes is **escaped** (`_esc`), not injected — `<script>`
  appears as literal text, no layout break (B1). Fractional/garbage/huge/negative
  `day_number` (B2), garbage dates (B3), 0-days/0-everything (B4, renders cover + hint),
  NaN/Inf budget amounts (B12), malformed JSON columns (B13) all render without crashing.
  Only oversized single-day content (PDF-1) breaks the build.
- **Notes/journaling** render (MK2 BUG-1 fixed). **Checklist** groups by category, handles
  `completed`/`done`, "General" fallback. **Companions** render with accented + CJK + Cyrillic
  names (Arial Unicode on dev). **Marked places** render with A-Z (wrapping) letter badges.
- **Cover stat** `int(total_spend_eur)` can't crash (source is `SUM(euro_value)`, always
  numeric). Day cap at 1000 + aiPlan clamp at 100 + 64KB options cap all enforced.

# Caveat for PA prod (could not inspect PA filesystem) — SUSPECTED
`_FONT_CANDIDATES` (pdf.py:135-151) prefers DejaVuSans on Linux/PA. **DejaVu Sans has no CJK
and no Arabic coverage.** On dev (macOS) the code registers *Arial Unicode* (full coverage,
verified). If PA only has DejaVu, CJK/Arabic companion names + trip titles will be stripped
by `_strip_emoji`'s fallback path → "Untitled companion" / blank footer. The R3-Round-4 fix
comment assumes DejaVu suffices, but DejaVu ≠ Unicode-complete. **Recommend** verifying PA
has a CJK/Arabic-capable font (e.g. Noto Sans CJK / Noto Naskh) installed and added to
`_FONT_CANDIDATES`, or bundling a Noto subset with the app. Tag SUSPECTED — needs a check on
the live PA box.
