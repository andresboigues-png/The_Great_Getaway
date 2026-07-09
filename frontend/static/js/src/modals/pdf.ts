// modals/pdf.ts — PDF export modal, extracted from modals.ts in the B2 split.

import { showLiquidAlert, q, esc } from '../utils.js';
import { iconSvg } from '../icons.js';
import { apiFetch } from '../api.js';
import { showModal } from '../components/Modal.js';
import { t, getLocale } from '../i18n.js';
import type { Trip } from '../types';

/** 2026-05-18 — PDF export modal.
 *  Opens a modal with checkboxes letting the user customize what
 *  goes into their trip-plan PDF (cover map, day pins, to-dos,
 *  budgets, companions, marked places). Submitting POSTs to
 *  /api/trips/<id>/pdf with the chosen options, streams the PDF
 *  blob back, and triggers a download via an anchor click.
 *
 *  The endpoint defaults to "include everything" so the modal's
 *  unchecked-by-default state is meaningful — anything the user
 *  unticks gets omitted server-side. */
export const openPdfExportModal = (trip: Trip) => {
    if (!trip || !trip.id) {
        showLiquidAlert(t('modals.pdfErrorNoTrip'));
        return;
    }
    const tripName = trip.name || t('feed.tripFallback');
    // 2026-05-20: round 4 redesign. Two regressions from round 3
    // surfaced: (a) the gradient cards on every option read as
    // "weird blue boxes around names" — too much branding noise;
    // (b) the gradient header was getting CLIPPED at the top
    // because the card has rounded corners and my negative-margin
    // bleed-trick was fighting them. Fix both by:
    //   - Header keeps the GG gradient + white text (that's the
    //     "same style as other GG boxes" the user asked for).
    //   - The option cards revert to a plain light-on-white look
    //     — easier to read at a glance, and the contrast against
    //     the gradient header makes the page header POP without
    //     drowning the body in colour.
    //   - Zero card padding + explicit section padding inside.
    //     Header is the first child, takes the modal's top
    //     border-radius via its own matching corners, no clipping.
    const innerHTML = `
        <div style="display:flex; flex-direction:column; text-align:left;">
            <!-- Gradient header strip — corners match the card's
                 border-radius so it sits flush with the modal's
                 top edge instead of being clipped by the card's
                 overflow:hidden + corner curve. -->
            <div style="display:flex; align-items:center; gap:14px; padding:18px 22px; background:linear-gradient(135deg, var(--accent-blue) 0%, #5856d6 100%); color:white; border-top-left-radius: var(--radius-3xl); border-top-right-radius: var(--radius-3xl);">
                <div style="width:44px; height:44px; border-radius:12px; background:rgba(255,255,255,0.18); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.28); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">${iconSvg('document', { size: 22 })}</div>
                <div style="flex:1; min-width:0;">
                    <h2 style="margin:0; font-size:1.15rem; color:white; font-weight:800; letter-spacing:-0.02em; line-height:1.15;">
                        ${esc(t('modals.pdfTitle'))}
                    </h2>
                    <p style="margin:3px 0 0; color:rgba(255,255,255,0.85); font-size:0.78rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${esc(t('modals.pdfSubtitlePrefix'))} <strong style="color:white;">${esc(tripName)}</strong>
                    </p>
                </div>
            </div>
            <!-- Option grid — plain light cards. Auto-fit grid:
                 2 columns when there's room, single column on
                 narrow phones. -->
            <div id="pdfExportOptions" style="padding:18px 22px 0; display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:8px;">
                ${renderPdfOption('includeCoverMap', t('modals.pdfOptCoverMap'),
                    t('modals.pdfOptCoverMapBody'))}
                ${renderPdfOption('includeStats', t('modals.pdfOptSummary'),
                    t('modals.pdfOptSummaryBody'))}
                ${renderPdfOption('includeDays', t('modals.pdfOptDayPlan'),
                    t('modals.pdfOptDayPlanBody'))}
                ${renderPdfOption('includeDayPins', t('modals.pdfOptDayMaps'),
                    t('modals.pdfOptDayMapsBody'))}
                ${renderPdfOption('includeTodos', t('modals.pdfOptTodo'),
                    t('modals.pdfOptTodoBody'))}
                ${renderPdfOption('includeBudgets', t('modals.pdfOptBudgets'),
                    t('modals.pdfOptBudgetsBody'))}
                ${/* MK4 PDF-2/3/4: new opt-in (default OFF) sections.
                      DSGN-013: option labels now localized via t() like every
                      sibling; the PDF CONTENT is also localised server-side
                      via the active locale we POST. */ ''}
                ${renderPdfOption('includeExpenses', t('modals.pdfOptExpenses'),
                    t('modals.pdfOptExpensesBody'), false)}
                ${renderPdfOption('includeSettlements', t('modals.pdfOptSettlements'),
                    t('modals.pdfOptSettlementsBody'), false)}
                ${renderPdfOption('includePhotos', t('modals.pdfOptPhotos'),
                    t('modals.pdfOptPhotosBody'), false)}
                ${renderPdfOption('includeCompanions', t('modals.pdfOptCompanions'),
                    t('modals.pdfOptCompanionsBody'))}
                ${renderPdfOption('includeMarkedPlaces', t('modals.pdfOptMarkedPlaces'),
                    t('modals.pdfOptMarkedPlacesBody'))}
            </div>
            <div style="display:flex; gap:10px; padding:18px 22px 22px;">
                <button type="button" id="cancelPdfBtn" class="flex-1"
                        style="font-weight:700; color:#002d5b; background:rgba(0,45,91,0.06); border:1px solid rgba(0,45,91,0.12); padding:11px 18px; border-radius:12px; cursor:pointer; font-size:0.9rem;">${esc(t('modals.pdfCancelBtn'))}</button>
                <button type="button" id="submitPdfBtn" class="flex-1"
                        style="background:linear-gradient(135deg, #34c759, #1a9947); border:0; color:white; padding:11px 18px; border-radius:12px; cursor:pointer; font-weight:800; font-size:0.9rem; box-shadow:0 4px 12px rgba(52,199,89,0.32);">
                    <span id="pdfBtnLabel">${esc(t('modals.pdfDownloadBtn'))}</span>
                </button>
            </div>
        </div>
    `;
    // Zero padding on the card so the gradient header's
    // border-top-radius matches the card's exact corner curve.
    // overflow:hidden clips the corners cleanly. background:white so
    // the body sections (with their own padding declared inline)
    // get a clean light surface for the option cards.
    const { root, close } = showModal({ innerHTML, cardStyle: 'max-width: 560px; width: min(560px, calc(100vw - 24px)); padding: 0; overflow: hidden; background: white;' });

    function renderPdfOption(key: string, label: string, sub: string, checked = true): string {
        // Plain light card — soft accent-blue hairline border, dark
        // text. Sits against the white modal body with enough contrast
        // to read at a glance while the gradient header carries the
        // "this is a GG box" brand signal. `checked` defaults to true so
        // the existing always-on sections stay ticked; the MK4 opt-in
        // sections (expenses / settle-up / photos) pass false.
        //
        // A6-I2: the three default-OFF sections (checked === false) were
        // visually identical to the always-on ones, so a user couldn't
        // tell which start unticked. Give opt-in cards a muted surface +
        // a small "Off by default" pill next to the label so the state is
        // explicit without adding chrome to the always-on options.
        const isOptIn = !checked;
        const cardStyle = isOptIn
            ? 'background:rgba(0,45,91,0.03); border:1px dashed rgba(0,45,91,0.16);'
            : 'background:rgba(0,113,227,0.04); border:1px solid rgba(0,113,227,0.10);';
        const optInPill = isOptIn
            ? `<span style="display:inline-block; margin-left:6px; padding:1px 6px; border-radius:999px; background:rgba(0,45,91,0.06); color:#4a5568; font-size:0.62rem; font-weight:700; letter-spacing:0.01em; vertical-align:middle; white-space:nowrap;">${esc(t('modals.pdfOptOffByDefault'))}</span>`
            : '';
        return `
            <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; padding:10px 12px; border-radius:12px; transition: background 0.15s, border-color 0.15s; ${cardStyle}">
                <input type="checkbox" name="${key}" ${checked ? 'checked' : ''}
                       style="margin-top:2px; width:16px; height:16px; accent-color:var(--accent-blue); flex-shrink:0;">
                <span style="min-width:0; flex:1;">
                    <span style="display:block; font-weight:700; color:#002d5b; font-size:0.86rem; line-height:1.2;">${esc(label)}${optInPill}</span>
                    <span style="display:block; color:#4a5568; font-size:0.74rem; line-height:1.35; margin-top:2px;">${esc(sub)}</span>
                </span>
            </label>
        `;
    }

    const cancelBtn = q(root, '#cancelPdfBtn') as HTMLButtonElement | null;
    const submitBtn = q(root, '#submitPdfBtn') as HTMLButtonElement | null;
    const btnLabel = q(root, '#pdfBtnLabel') as HTMLSpanElement | null;
    if (cancelBtn) cancelBtn.onclick = () => close();

    if (submitBtn) {
        submitBtn.onclick = async () => {
            // Collect checked options.
            const checkboxes = root.querySelectorAll<HTMLInputElement>(
                '#pdfExportOptions input[type="checkbox"]',
            );
            const options: Record<string, boolean | string> = {};
            checkboxes.forEach((cb) => { options[cb.name] = cb.checked; });
            // MK4 PDF-5: forward the active UI locale so the server-side
            // PDF string table renders section titles / slot labels /
            // money + dates in the user's language instead of English.
            options.locale = getLocale();

            // Lock the button while the build runs server-side.
            // Map fetches + PDF assembly take ~1–3s on a typical
            // trip, so a visible "Building…" state matters.
            submitBtn.disabled = true;
            if (btnLabel) btnLabel.textContent = t('modals.pdfStatusBuilding');
            try {
                const res = await apiFetch(`/api/trips/${trip.id}/pdf`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(options),
                });
                if (!res.ok) {
                    // R10-B6e MA4: surface the server's JSON error
                    // body when present. R9-B1 M3 made the PDF
                    // builder envelope its server-side errors as
                    // {"error": "..."} JSON; pre-fix the frontend
                    // swallowed that and toasted the generic
                    // pdfErrorBuild copy regardless. Now: try to
                    // parse the body, fall back to the generic
                    // string if parsing fails (older deploys that
                    // still return text/html).
                    let serverMsg = '';
                    try {
                        const body = await res.json();
                        if (body && typeof body.error === 'string') {
                            serverMsg = body.error;
                        }
                    } catch {
                        // Not JSON — generic toast is the right fallback.
                    }
                    showLiquidAlert(serverMsg || t('modals.pdfErrorBuild'));
                    return;
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                // 2026-05-20: iOS Safari doesn't honour the
                // `<a download>` attribute on programmatic clicks
                // inside an async callback — the user-gesture
                // requirement is considered broken by the time the
                // fetch resolves, so nothing happens. Branch on the
                // platform:
                //   - iOS Safari / iPadOS: open the blob URL in a
                //     new tab. iOS shows its native PDF viewer
                //     overlay with a "Share / Save to Files" sheet,
                //     which is the platform-native way to save.
                //   - Everything else (desktop Safari, Chrome,
                //     Firefox, Android): the anchor-click pattern
                //     still works.
                const ua = navigator.userAgent || '';
                const isIOS = /iPad|iPhone|iPod/.test(ua)
                    || (ua.includes('Mac') && 'ontouchend' in document);
                const safe = (trip.name || 'trip').replace(/[^A-Za-z0-9 _-]/g, '_').trim() || 'trip';
                if (isIOS) {
                    // window.open from inside an async chain can be
                    // popup-blocked. Falling back to assigning the
                    // current location keeps the PDF reachable —
                    // Safari renders the blob inline and the user
                    // taps the iOS share icon to save.
                    const opened = window.open(url, '_blank');
                    if (!opened) window.location.href = url;
                    // Defer the URL revoke so Safari has time to
                    // load the blob in the new tab before the URL
                    // is invalidated.
                    setTimeout(() => URL.revokeObjectURL(url), 60_000);
                } else {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${safe}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    // Delay removal slightly so Firefox actually
                    // gets the click event before the node is gone.
                    setTimeout(() => {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    }, 100);
                }
                close();
            } catch (e) {
                showLiquidAlert(t('modals.pdfErrorNetwork'));
            } finally {
                submitBtn.disabled = false;
                if (btnLabel) btnLabel.textContent = t('modals.pdfDownloadBtn');
            }
        };
    }
};
