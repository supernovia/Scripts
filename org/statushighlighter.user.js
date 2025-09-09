// ==UserScript==
// @name         WordCamp Status Highlighter
// @namespace    https://github.com/supernovia/Scripts
// @version      1.0.0
// @description  Side-border highlights and badges for WordCamp Central list; vibe coded, contributions welcome.
// @match        https://central.wordcamp.org/wp-admin/*
// @updateURL    https://raw.githubusercontent.com/supernovia/Scripts/master/org/statushighlighter.user.js
// @downloadURL  https://raw.githubusercontent.com/supernovia/Scripts/master/org/statushighlighter.user.js
// @homepageURL  https://github.com/supernovia/Scripts
// @supportURL   https://github.com/supernovia/Scripts/issues
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const MS_DAY = 86400000;
  const SIX_WEEKS = 42 * MS_DAY;

  const CLS_SCHEDULED = 'status-wcpt-scheduled';
  const CLOSEDISH = new Set([
    'status-wcpt-closed',
    'status-wcpt-declined',
    'status-wcpt-cancelled',
  ]);

  // --- Styles: side border only; badge is black ---
  const css = `
/* Side borders applied to entire row for consistency */
.wc-mark-scheduled { box-shadow: inset 4px 0 0 0 #00c47a; } /* green */
.wc-mark-active    { box-shadow: inset 4px 0 0 0 #fbde2d; } /* yellow */
.wc-mark-urgent    { box-shadow: inset 4px 0 0 0 #e91e63; } /* red */
.wc-mark-closed    { box-shadow: inset 4px 0 0 0 #80888e; } /* dark gray */

/* Badge styling */
.wc-badge {
  display: block;
  margin-top: 3px;
  padding: .2em .4em;
  font-size: 11px;
  line-height: 1.3;
  border-radius: 3px;
  font-weight: 600;
  width: fit-content;
  color: #fff;
}

/* Color-coded badges */
.wc-mark-scheduled .wc-badge { background: #00c47a; } /* green */
.wc-mark-urgent    .wc-badge { background: #e91e63; } /* red */
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const monthIdx = (name) => ({
    january:0,february:1,march:2,april:3,may:4,june:5,
    july:6,august:7,september:8,october:9,november:10,december:11
  })[String(name||'').toLowerCase()];

  // Parse "Start: September 22, 2025" / "Start: 22 September 2025"
  // Also detect "No Date" variants (No Date, dashes, empty)
  function parseStart(text) {
    if (!text) return null;
    const t = text.replace(/\u00a0/g, ' ').trim();

    if (
      /\bno\s*date\b/i.test(t) ||
      /Start:\s*[\u2013\u2014\-–—]\s*$/i.test(t) ||
      /^Start:\s*$/i.test(t)
    ) return 'NO_DATE';

    let m = t.match(/Start:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
    if (m) { const mi = monthIdx(m[1]); if (mi != null) return new Date(+m[3], mi, +m[2]); }
    m = t.match(/Start:\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (m) { const mi = monthIdx(m[2]); if (mi != null) return new Date(+m[3], mi, +m[1]); }

    return null; // unknown
  }

  const isScheduled = (row) => row.classList.contains(CLS_SCHEDULED);
  const isClosedish = (row) => [...row.classList].some(c => CLOSEDISH.has(c));
  const daysBetween = (a, b) => Math.max(0, Math.round((a - b) / MS_DAY));

  function classify(row, dateCell) {
    if (!dateCell) return { type: 'none' };

    // Closed/cancelled/declined
    if (isClosedish(row)) return { type: 'closed' };

    const parsed = parseStart(dateCell.textContent);
    const scheduled = isScheduled(row);

    if (scheduled) {
      // Always green. Badge logic handled separately.
      return { type: 'scheduled', parsed };
    }

    // Not scheduled, not closedish
    if (parsed === 'NO_DATE') {
      return { type: 'urgent', parsed };
    }
    if (parsed instanceof Date && !isNaN(parsed)) {
      const diff = parsed - new Date();
      if (diff > 0 && diff <= SIX_WEEKS) return { type: 'urgent', parsed };
      if (diff > SIX_WEEKS) return { type: 'active', parsed };
      return { type: 'none' };
    }

    // Unknown format: treat as none (so we don't mislabel)
    return { type: 'none' };
  }

function apply(row, dateCell, typeInfo) {
  // Clear previous
  row.classList.remove('wc-mark-scheduled','wc-mark-active','wc-mark-urgent','wc-mark-closed');
  dateCell?.querySelectorAll('.wc-badge').forEach(n => n.remove());

  const { type, parsed } = typeInfo;

  if (type === 'closed') {
    row.classList.add('wc-mark-closed');
    return;
  }

  if (type === 'scheduled') {
    row.classList.add('wc-mark-scheduled');
    // Badge for scheduled with future start within ≤6 weeks
    if (parsed instanceof Date && !isNaN(parsed)) {
      const diff = parsed - new Date();
      if (diff > 0 && diff <= SIX_WEEKS) {
        const badge = document.createElement('div');
        badge.className = 'wc-badge';
        badge.textContent = `Starts in ${daysBetween(parsed, new Date())}d`;
        dateCell.appendChild(badge);
      }
    }
    return;
  }

  if (type === 'urgent') {
    row.classList.add('wc-mark-urgent');
    // Badge for urgent (either no date, or date within ≤6 weeks)
    const badge = document.createElement('div');
    badge.className = 'wc-badge';
    if (parsed === 'NO_DATE') {
      badge.textContent = 'No start date';
    } else if (parsed instanceof Date && !isNaN(parsed)) {
      const diff = parsed - new Date();
      if (diff > 0 && diff <= SIX_WEEKS) {
        badge.textContent = `Starts in ${daysBetween(parsed, new Date())}d`;
      } else {
        // not within ≤6 weeks -> no badge
        badge.remove();
        return;
      }
    } else {
      // unknown format -> no badge
      badge.remove();
      return;
    }
    dateCell.appendChild(badge);
    return;
  }

  if (type === 'active') {
    row.classList.add('wc-mark-active');
    return;
  }

  // type === 'none' -> no styling
}
    function processRow(row) {
    if (!row || row.dataset.wcDecor === '1') return;
    row.dataset.wcDecor = '1';

    const dateCell = row.querySelector('td.wcpt_date') ||
                     row.querySelector('td.column-wcpt_date') ||
                     row.querySelector('td[data-colname="Date"]');

    const info = classify(row, dateCell);
    apply(row, dateCell, info);
  }

  function initialScan() {
    document.querySelectorAll('#the-list > tr').forEach(processRow);
  }

  // Run once
  initialScan();

  // Observe direct row additions only (safe)
  const table = document.querySelector('#the-list');
  if (table) {
    const obs = new MutationObserver(records => {
      for (const r of records) {
        for (const node of r.addedNodes) {
          if (node.nodeType === 1 && node.tagName === 'TR') processRow(node);
        }
      }
    });
    obs.observe(table, { childList: true });
  }
})();
