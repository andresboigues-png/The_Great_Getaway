# PLATFORM findings (agent, confirmed by tracing)

## PLAT-3 — P1 Confirmed — Any logged-in user can read ANY user's private uploads
- main.py:1223-1226 serve_upload authenticated branch returns send_from_directory with NO ownership/membership check — protected only by unguessable filename. A removed/declined member, or anyone who harvested a photo/document/receipt URL from /api/public-trip or /api/data while they had access (or from history/logs), keeps PERMANENT read access. Files physically deleted only on trip/day delete, never on member leave.
- Fix: gate by caller_id==owner_dir OR accepted-membership of a trip referencing the file (min for receipts).

## PLAT-2 — P1 Confirmed — Session cookie can ship without Secure in prod
- auth.py:405,423 via _is_secure_request→request.is_secure. Cookie Secure flag + HSTS (main.py:503) + share cookies (main.py:1146/public.py:732) all hinge on ProxyFix having translated trusted X-Forwarded-Proto. If header absent or proxy topology != GG_TRUSTED_PROXIES=1, 30-day JWT cookie minted WITHOUT Secure → leak over plain-HTTP downgrade.
- Fix: in non-dev set secure=True unconditionally; auto-detect only in dev.

## PLAT-1 — P2 Confirmed — PDF "Total planned" sums mixed currencies as EUR
- pdf.py:1948-1962. Per-row budgets print real currency but footer accumulates raw amount across currencies labeled EUR. budgets.amount is user-typed in budgets.currency, not EUR-normalised. USD1000+GBP500 → "Total planned EUR 1500". Wrong figure in shareable artefact next to genuinely-EUR "Actual trip spend".
- Fix: EUR-normalise before summing, or per-currency subtotals.

## PLAT-4 — P2 Confirmed — Anon cover-image fetch ignores is_archived
- main.py:1260-1268 anon branch serves cover if is_public=1 OR share_token NOT NULL, never checks is_archived (unlike fetch_share_payload public.py:514). After owner archives a shared trip, cover PNG remains anonymously fetchable. Contradicts "archiving = stop serving".
- Fix: AND COALESCE(is_archived,0)=0.

## PLAT-6 — P3 Confirmed — bio/homeCountry don't strip bidi/zero-width Unicode
- settings.py:134-147,245-251 strip only C0; not bidi-override/zero-width that AI route removes (integrations.py:615-622). Render on others' profiles. Not XSS (frontend escapes) but bidi direction-spoof.
- Fix: shared invisible-stripping helper.

## PLAT-7 — P3 Confirmed — PDF day-pin int(d_num) can crash whole export
- pdf.py:1758 int(day_number) raises on non-numeric/nan; not RuntimeError so export_trip_pdf except RuntimeError misses → whole build 500s instead of skipping one pin. Unreachable normally (INTEGER col) but legacy/garbage row breaks export.
- Fix: try/except (TypeError,ValueError).

## PLAT-5 — P3 Confirmed — Comment overstates non-JSON body protection
- request.json or {} only handles missing Content-Type; declared-json malformed body raises BadRequest first. Benign (400) but comments inaccurate.
- Fix: request.get_json(silent=True) or {}.

## PLAT-8 — P3 Confirmed — Outbound fetchers follow redirects with key attached
- integrations.py:476 photo proxy carries ?key=...; also :214/:807, pdf.py:381/472/545. Hosts hardcoded + input structurally validated (no direct SSRF) but allow_redirects defaults True and proxy attaches server key.
- Fix: allow_redirects=False, treat 3xx as upstream failure.

## By-design note
- Turning trip private does NOT invalidate share links (is_public + share_token independent; feed.py:806 leaves token). Token unguessable so safe, but user-expectation mismatch. Consider clearing share_token on public→private.

## Verified SOUND
- JWT HS256-only (no alg-confusion), missing sub/jti rejected. Test-login triple-gated. Admin per-request email allowlist + denial logging; backup admin-only. Share tokens 132-bit + UNIQUE + 404-on-miss + 60/min; view-count gated on rowcount==1. fetch_share_payload privacy stripping matches contract. PDF authz owner/member; coords via _safe_coord, labels single-alphanumeric. Gemini keys scrubbed/proxied. CSRF Origin check closes both-headers-missing bypass.

Priority: PLAT-3 (P1 private upload leak), PLAT-2 (P1 cookie Secure).
