"""Headless smoke test: serve _site, run every automation on its sample in Chromium, check output.

Usage: python demo/smoke_test.py [--url URL] [--screenshot PATH]  (run `node demo/build.mjs` first)
"""

from __future__ import annotations

import argparse
import functools
import http.server
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parent.parent / "_site"
# Text each automation's output must contain when run on its sample (today = 2026-03-10).
EXPECT = {
    "Form cleanup": ["Rejected", "Sheet: Master", "Sheet: Rejected", "Maria Garcia"],
    "Summary email": ["Email preview", "daily summary for 2026-03-09", "Revenue: $404.49"],
    "Invoice PDF": ["Invoice preview", "INV-1001", "Invoiced", "DriveApp: save"],
    "Overdue reminders": ["Sheet: Send Log", "Email preview", "INV-0987", "nothing was sent"],
    "Low-stock alert": ["Email preview", "low on stock", "Flour 25kg"],
}


def serve(folder: Path) -> str:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(folder))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{httpd.server_port}/"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url")
    ap.add_argument("--screenshot")
    args = ap.parse_args()
    problems: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("pageerror", lambda e: problems.append(f"page error: {e}"))
        page.goto(args.url or serve(SITE))
        page.wait_for_selector("body[data-ready='1']", state="attached", timeout=60_000)
        for title, needles in EXPECT.items():
            page.click(f"#tabs .tab:text-is('{title}')")
            page.wait_for_function("document.querySelector('#csv').value.length > 20")
            page.click("#run")
            page.wait_for_selector("#out:not([hidden])")
            page.wait_for_timeout(500)  # let email iframes paint
            text = page.inner_text("#out") + "".join(
                f.evaluate("document.body ? document.body.innerText : ''") for f in page.frames[1:]
            )
            status = page.inner_text("#status")
            print(f"{title}: {status}")
            if status != "Done.":
                problems.append(f"{title}: status {status!r}")
            problems += [f"{title}: missing {n!r}" for n in needles if n not in text]
            if title == "Low-stock alert" and args.screenshot:
                page.locator("main").screenshot(path=args.screenshot)
        browser.close()
    for msg in problems:
        print(f"FAIL: {msg}")
    print("PASS" if not problems else "FAILED")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
