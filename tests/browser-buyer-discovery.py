"""Offline end-to-end buyer discovery test, with no third-party services or customer submissions.

Exercise real browser interaction from TSS Homepage and What We Do to the buyer-interest
email-first destination using the site's own stylesheet, assets and navigation scripts.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, unquote
import threading
import re

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence" / "buyer-enquiry"
EVIDENCE.mkdir(parents=True, exist_ok=True)

class LocalHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *args):
        pass

    def do_GET(self):
        route = unquote(urlsplit(self.path).path)
        candidate = (ROOT / route.lstrip("/")).resolve()
        if not candidate.is_relative_to(ROOT):
            self.send_error(404)
            return
        if route not in ("/", "/buyer-interest/") and candidate.suffix.lower() not in {
            ".html", ".js", ".css", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico"
        }:
            self.send_error(404)
            return
        super().do_GET()

server = ThreadingHTTPServer(("127.0.0.1", 0), LocalHandler)
threading.Thread(target=server.serve_forever, daemon=True).start()
ORIGIN = f"http://127.0.0.1:{server.server_port}"

def open_context(browser, width):
    context = browser.new_context(viewport={"width": width, "height": 900}, service_workers="block")
    incidents = {"unexpected": [], "pageerrors": []}

    def safe_request(route):
        url = route.request.url
        if url.startswith(ORIGIN + "/") and route.request.method == "GET":
            route.continue_()
        elif url.startswith(ORIGIN + "/"):
            incidents["unexpected"].append(url)
            route.abort()
        else:
            # Block analytics, form-embed, fonts, email launches and any external request.
            route.abort("blockedbyclient")
    context.route("**/*", safe_request)
    page = context.new_page()
    page.on("pageerror", lambda error: incidents["pageerrors"].append(str(error)))
    return context, page, incidents

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        for width in (390, 768, 1280):
            context, page, incidents = open_context(browser, width)
            try:
                # Real visitor: homepage -> property path -> buyer enquiry.
                page.goto(ORIGIN + "/", wait_until="load")
                expect(page.locator("main h1")).to_contain_text("Grow your business.")
                assert page.locator("main .cards3 .card").count() == 5
                home_link = page.locator('[data-cta-location="home-strategic-connections"]')
                expect(home_link).to_be_visible()
                expect(home_link).to_have_attribute("href", "buyer-interest/")
                home_link.scroll_into_view_if_needed()
                page.screenshot(path=str(EVIDENCE / f"homepage-discovery-{width}.png"), full_page=True)
                home_link.click()
                page.wait_for_url(ORIGIN + "/buyer-interest/")
                expect(page.locator("main h1")).to_contain_text("Considering a property in Cyprus or Greece?")
                expect(page.locator('a[href^="mailto:info@thesmartysolution.com?subject=Cyprus%20or%20Greece"]')).to_have_count(2)
                assert page.locator("main form").count() == 0
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 2")
                assert page.locator('link[rel="stylesheet"][href^="/style.css"]').count() == 1
                page.screenshot(path=str(EVIDENCE / f"buyer-page-{width}.png"), full_page=True)

                # What We Do remains a full business service page, with a clearly visible buyer CTA.
                page.goto(ORIGIN + "/divisions.html", wait_until="load")
                expect(page.locator("main h1")).to_contain_text("Business development built around the commercial objective.")
                assert page.locator("main .cards3 .card").count() == 5
                buyer_cta = page.locator('.buyer-service-path a[data-cta-location="what-we-do"]')
                expect(buyer_cta).to_be_visible()
                expect(buyer_cta).to_have_attribute("href", "buyer-interest/")
                buyer_cta.scroll_into_view_if_needed()
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 2")
                assert page.locator(".buyer-service-path").evaluate(
                    "(node) => getComputedStyle(node).backgroundColor") != "rgba(0, 0, 0, 0)"
                page.screenshot(path=str(EVIDENCE / f"what-we-do-buyer-cta-{width}.png"), full_page=True)
                buyer_cta.click()
                page.wait_for_url(ORIGIN + "/buyer-interest/")
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 2")

                # In-page navigation must keep visitors on the buyer page, not jump to home.
                page.locator('a[href="/buyer-interest/#how-we-work"]').click()
                page.wait_for_url(ORIGIN + "/buyer-interest/#how-we-work")
                expect(page.locator("#how-we-work")).to_be_visible()
                assert not incidents["unexpected"], incidents["unexpected"]
                assert not incidents["pageerrors"], incidents["pageerrors"]

                if width < 940:
                    page.locator("button.menu").click()
                    expect(page.locator("button.menu")).to_have_attribute("aria-expanded", "true")
                    expect(page.locator(".navlinks")).to_have_class(re.compile(r"\bopen\b"))

                print(f"PASS: buyer discovery, brand, layout and navigation at {width}px", flush=True)
            finally:
                context.close()
    finally:
        browser.close()
        server.shutdown()
