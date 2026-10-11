"""Offline browser safety of the clean Contact page. No HubSpot or customer requests.

This replaces legacy CRM enquiry fixture testing. The synthetic iframe verifies only
website integration/layout, NOT HubSpot provider acceptance, consent, or submission.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
import threading

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "evidence" / "enquiry"
ARTIFACTS.mkdir(parents=True, exist_ok=True)
EMBED = "https://js-eu1.hsforms.net/forms/embed/149509919.js"

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *args):
        pass

    def do_GET(self):
        candidate = (ROOT / urlsplit(self.path).path.lstrip("/")).resolve()
        if not candidate.is_relative_to(ROOT) or candidate.suffix.lower() not in {
            ".html", ".js", ".css", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico"
        }:
            self.send_error(404)
            return
        super().do_GET()

server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
ORIGIN = f"http://127.0.0.1:{server.server_port}"

# A harmless DOM fixture, NOT a HubSpot client or form submission.
STUB = r"""(() => {
  const slot = document.querySelector('.hs-form-frame[data-portal-id="149509919"]');
  if (!slot) throw Error('Native form embed slot missing');
  const frame = document.createElement('iframe');
  frame.title = 'Synthetic HubSpot layout fixture; no submission';
  frame.id = 'synthetic-hubspot-frame';
  frame.style.width = '100%';
  frame.style.minHeight = '370px';
  frame.style.border = '0';
  frame.srcdoc = '<html><body style="font:16px Arial"><p>Offline native form layout fixture</p></body></html>';
  slot.appendChild(frame);
})();"""

def context_with_local_only(browser, width):
    context = browser.new_context(viewport={"width": width, "height": 900}, service_workers="block")
    state = {"embeds": 0, "unexpected": [], "pageerrors": []}

    def route_request(route):
        url = route.request.url
        if url == EMBED:
            state["embeds"] += 1
            route.fulfill(status=200, content_type="application/javascript", body=STUB)
        elif url.startswith(ORIGIN + "/"):
            if route.request.method != "GET":
                state["unexpected"].append(url)
                route.abort()
            else:
                route.continue_()
        else:
            route.abort("blockedbyclient")

    context.route("**/*", route_request)
    page = context.new_page()
    page.on("pageerror", lambda error: state["pageerrors"].append(str(error)))
    return context, page, state

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        for width in (390, 768, 1280):
            context, page, state = context_with_local_only(browser, width)
            try:
                page.goto(ORIGIN + "/contact.html", wait_until="load")
                expect(page.locator("#synthetic-hubspot-frame")).to_have_count(1)
                assert page.locator("form[data-tss-form]").count() == 0
                assert state["embeds"] == 1
                assert not state["unexpected"], state["unexpected"]
                assert not state["pageerrors"], state["pageerrors"]
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 2")
                expect(page.locator("a[href^='mailto:info@']")).to_have_count(2)
                if width == 390:
                    page.locator("button.menu").click()
                    expect(page.locator("button.menu")).to_have_attribute("aria-expanded", "true")
                page.screenshot(path=str(ARTIFACTS / f"native-contact-{width}.png"), full_page=True)
                print(f"PASS native-only responsive contact {width}", flush=True)
            finally:
                context.close()

        context, page, state = context_with_local_only(browser, 390)
        try:
            page.goto(ORIGIN + "/kiti-enquiry.html", wait_until="domcontentloaded")
            page.wait_for_url("**/contact.html")
            expect(page.locator("#synthetic-hubspot-frame")).to_have_count(1)
            assert "enquiry=kiti" not in page.url
            assert state["embeds"] == 1
            assert not state["unexpected"] and not state["pageerrors"]
            print("PASS legacy Kiti URL redirects to generic Contact", flush=True)
        finally:
            context.close()
    finally:
        browser.close()
        server.shutdown()
