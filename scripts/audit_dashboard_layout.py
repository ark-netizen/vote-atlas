#!/usr/bin/env python3
"""Inspect real rendered Vote Atlas pages for unintended text/card overflow.

Uses a local HTTP server and headless system Chrome, so production services,
credentials, votes and user accounts are not needed. Screenshots and JSON are
CI artifacts; expected inner scrolling for tables/calendars/nav is not a bug.
"""
from __future__ import annotations
import functools
import http.server
import json
import os
from pathlib import Path
import shutil
import sys
import threading
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
OUT = ROOT / "verification" / "layout"
OUT.mkdir(parents=True, exist_ok=True)
PAGES = [
    "overview.html", "rewards.html", "awards.html",
    "index.html", "index.html?view=list", "index.html?view=sources",
    "trend-detail.html", "trend-detail.html?app=muniverse",
    "trend-detail.html?app=fannstar"
]
WIDTHS = [320, 375, 768, 1024, 1366, 1600]

AUDIT = r"""() => {
  const maxOverflow = 2.5;
  const css = el => window.getComputedStyle(el);
  const visible = el => {
    const r = el.getBoundingClientRect();
    const s = css(el);
    return r.width > 0 && r.height > 0 &&
      s.display !== 'none' && s.visibility !== 'hidden';
  };
  const allowedScroll = el => {
    let n = el;
    while (n && n !== document.body) {
      const c = css(n);
      if (['auto','scroll'].includes(c.overflowX) &&
          n.scrollWidth > n.clientWidth + 2) return true;
      n = n.parentElement;
    }
    return false;
  };
  const selected = [
    '.stat', '.metric-card', '.panel', '.activity-panel', '.activity-entry',
    '.vote', '.artist-row', '.artist-event', '.award-card', '.trend-per-app',
    '.trend-compact-app', '.trend-detail-stats>div', '.reward-filter',
    '.filter-panel', '.calendar-toolbar', '.award-calendar-toolbar',
    '.award-schedule-entry', '.award-month-item', '.workspace-menu-item'
  ].join(',');
  const cards = [...document.querySelectorAll(selected)].filter(visible);
  const issues = [];
  const seen = new Set();
  const report = (el, detail, amount, text) => {
    if (issues.length > 50) return;
    const label = (el.tagName.toLowerCase() + (el.id?'#'+el.id:'') +
      (typeof el.className === 'string' && el.className
        ? '.'+el.className.trim().replace(/\s+/g,'.').slice(0,80) : ''));
    const key = label + ':' + detail + ':' + (text||'').slice(0,40);
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({container:label,kind:detail,px:Math.round(amount*10)/10,
      sample:(text||'').trim().slice(0,90)});
  };
  const noOverflow = new Set(['hidden','clip']);
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    // Deliberate scroll areas contain complete wide tables/calendars;
    // their children must not be constrained to the enclosing panel.
    if (!allowedScroll(card) && card.scrollWidth > card.clientWidth + maxOverflow) {
      const style = css(card);
      if (!['auto','scroll'].includes(style.overflowX)) {
        report(card, 'card-scrollWidth', card.scrollWidth-card.clientWidth,
          card.textContent);
      }
    }
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    let node;let checked = 0;
    while ((node = walker.nextNode()) && checked++ < 1300) {
      const t = node.textContent.trim();
      if (!t || !node.parentElement || !visible(node.parentElement)) continue;
      const p = node.parentElement;
      if (p.closest('svg,script,style,[hidden],.reward-table-wrap,' +
          '.award-calendar-scroll,.trend-detail-table-wrap,' +
          '.workspace-menu,.trend-chart-canvas,.trend-app-plot')) continue;
      // Deliberately truncated one/two-line previews are navigable.
      const st = css(p);
      if (st.textOverflow === 'ellipsis' || st.webkitLineClamp !== 'none') continue;
      if (allowedScroll(p)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (r.width < 0.1 || r.height < 0.1) continue;
        const excessRight = r.right - rect.right;
        const excessLeft = rect.left - r.left;
        const excess = Math.max(excessRight,excessLeft);
        if (excess > maxOverflow) {
          report(card, 'text-outside', excess, t);
          break;
        }
      }
    }
  }
  const width = window.innerWidth;
  const pageWidth = Math.max(document.documentElement.scrollWidth,
    document.body.scrollWidth);
  if (pageWidth > width + maxOverflow) {
    issues.unshift({container:'document',kind:'page-horizontal-scroll',
      px:Math.round((pageWidth-width)*10)/10,sample:'Unintended full-page horizontal overflow'});
  }
  return {viewport:width,pageWidth,checkedCards:cards.length,issues};
}"""

class QuietHTTP(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

def run():
    serve = functools.partial(QuietHTTP, directory=str(DIST))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), serve)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_address[1]}/"
    browser_path = (
        shutil.which("google-chrome")
        or shutil.which("google-chrome-stable")
        or shutil.which("chromium")
        or shutil.which("chromium-browser")
    )
    if not browser_path:
        raise RuntimeError("No system Chrome/Chromium. Install a browser before running.")
    rows = []
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=browser_path,
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        for width in WIDTHS:
            context = browser.new_context(viewport={"width":width,"height":900},
                device_scale_factor=1, reduced_motion="reduce")
            page = context.new_page()
            for path in PAGES:
                # Only local app files are loaded, never vote APIs or social accounts.
                target = base + path
                try:
                    page.goto(target,wait_until="domcontentloaded",timeout=25000)
                    page.wait_for_timeout(450)
                    result = page.evaluate(AUDIT)
                    result["page"] = path
                    rows.append(result)
                    # Give reviewers visual evidence at normal desktop / phone widths.
                    if width in (375,1366):
                        slug = path.split("?")[0].replace(".html","")
                        if "?view=" in path: slug += "-"+path.split("?view=")[-1]
                        if "?app=" in path: slug += "-"+path.split("?app=")[-1]
                        page.screenshot(path=str(OUT/f"{slug}-{width}.png"),
                            animations="disabled",timeout=15000)
                    # Controlled long-label stress test after the normal
                    # screenshot. These values are synthetic QA fixtures and
                    # are never written into real data or used for site metrics.
                    mutated = page.evaluate("""() => {
                      const longLabel =
                        '장기간진행되는투표이벤트ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
                        'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMN';
                      const examples = [
                        ['.stat strong', '1,234,567,890,123'],
                        ['.metric-card strong','1,234,567,890,123'],
                        ['.panelhead h2',longLabel],
                        ['.vote h3',longLabel],
                        ['.activity-entry .activity-title',longLabel],
                        ['.award-card h3',longLabel],
                        ['.trend-per-app-head h3',longLabel],
                        ['.reward-table .event-title',longLabel],
                        ['.award-calendar-month strong','2026년 12월 / DECEMBER'],
                      ];
                      let count=0;
                      for (const [selector,label] of examples) {
                        const el=document.querySelector(selector);
                        if (el && el.getBoundingClientRect().width>0) {
                          el.textContent=label;
                          count++;
                        }
                      }
                      return count;
                    }""")
                    if mutated:
                        stress = page.evaluate(AUDIT)
                        stress["page"] = path
                        stress["stress"] = True
                        rows.append(stress)
                        print(f"LAYOUT_STRESS {path:23s} {width:4d}px "
                              f"fixtures={mutated:2d} "
                              f"overflow={len(stress['issues']):2d}",flush=True)
                        for issue in stress["issues"][:9]:
                            print("  STRESS_ISSUE "+
                                  json.dumps(issue,ensure_ascii=False),flush=True)
                    print(f"LAYOUT {path:30s} {width:4d}px "
                          f"cards={result['checkedCards']:3d} "
                          f"overflow={len(result['issues']):2d}",
                          flush=True)
                    for issue in result["issues"][:9]:
                        print("  ISSUE "+json.dumps(issue,ensure_ascii=False),flush=True)
                except Exception as e:
                    err={"page":path,"viewport":width,"issues":[{
                      "container":"browser","kind":"navigation/audit",
                      "px":0,"sample":str(e)[:240]}]}
                    rows.append(err)
                    print("  ISSUE "+json.dumps(err,ensure_ascii=False),flush=True)
            context.close()
        browser.close()
    server.shutdown()
    summary = {
        "generated_at_utc":datetime.now(timezone.utc).isoformat(),
        "widths":WIDTHS,"pages":PAGES,"results":rows,
        "viewport_cases":len(rows),
        "cases_with_issues":sum(bool(x["issues"]) for x in rows),
        "issue_count":sum(len(x["issues"]) for x in rows),
    }
    (OUT/"report.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2),
        encoding="utf-8")
    print("LAYOUT_SUMMARY "+json.dumps(
        {k:summary[k] for k in ("viewport_cases","cases_with_issues","issue_count")},
        ensure_ascii=False),flush=True)
    # CI can start in report-only mode for diagnosis and use strict mode once
    # the baseline issues are corrected.
    if os.environ.get("LAYOUT_STRICT","0") == "1" and summary["issue_count"]:
        return 1
    return 0

if __name__=="__main__":
    sys.exit(run())
