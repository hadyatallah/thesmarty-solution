"""One-time, read-only Production form field audit. NEVER submits any forms.

This script is isolated from the production bundle, and exists only to observe
the loaded public HubSpot iframe via its documented read-only Forms V4 methods.
"""
import json
from playwright.sync_api import sync_playwright

ROOT = "https://www.thesmartysolution.com"
TARGET_FORM = "d571803e-7777-4f28-94ea-b24df852245c"
FIELD = "0-1/tss_enquiry_route"
EXPECTED = "Kiti Residential Development Opportunity"

def inspect(page, route):
    url = ROOT + "/contact.html" + ("?enquiry=kiti" if route == "kiti" else "")
    blocked = []
    def guard(request_route):
        # Extra belt-and-braces guard: no submitted enquiries or mutating web requests.
        if request_route.request.method.upper() not in ("GET", "HEAD", "OPTIONS"):
            blocked.append(request_route.request.method + " " + request_route.request.url.split("?")[0])
            request_route.abort("blockedbyclient")
        else:
            request_route.continue_()
    page.route("**/*", guard)
    response = page.goto(url, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(12500)

    result = page.evaluate("""async ({route, field}) => {
      const out = {
        route,
        legacyVisible: !!document.querySelector('form[data-tss-form="contact"]')?.getClientRects().length,
        nativeVisible: !!document.querySelector('[data-tss-hubspot-form="contact"]')?.getClientRects().length,
        legacySelectedRoute: document.querySelector('#interest')?.selectedOptions?.[0]?.dataset?.route || '',
        publishedNativeId: document.querySelector('.hs-form-frame')?.getAttribute('data-form-id') || '',
        formsCount: 0,
        nativeRouteFieldPresent: false,
        nativeRouteValue: null,
        formsError: null,
      };
      try {
        const api=window.HubSpotFormsV4;
        if (!api || typeof api.getForms !== 'function') {
          out.formsError='HubSpotFormsV4 unavailable';
          return out;
        }
        const all=api.getForms();
        out.formsCount=all.length;
        const f=all.find(x=>x.getFormId() === out.publishedNativeId);
        if(!f){out.formsError='General native form instance not found';return out;}
        const vals=await f.getFormFieldValues();
        out.nativeRouteFieldPresent=vals.some(v=>v.name === field);
        if(out.nativeRouteFieldPresent)out.nativeRouteValue=await f.getFieldValue(field);
      } catch(e) {out.formsError=String(e?.message || e).slice(0,220);}
      return out;
    }""", {"route":route,"field":FIELD})
    result["httpStatus"] = response.status if response else None
    result["blockedMutatingRequestsCount"] = len(blocked)
    result["blockedMutatingRequestTypes"] = list(sorted(set(x.split()[0] for x in blocked)))
    result["kitiRoutingVerified"] = bool(route == "kiti" and result["nativeRouteFieldPresent"]
        and result["nativeRouteValue"] == EXPECTED and result["nativeVisible"]
        and not result["legacyVisible"])
    result["fallbackSafetyVerified"] = bool(route == "kiti" and result["legacyVisible"]
        and result["legacySelectedRoute"] == "kiti" and not result["nativeVisible"])
    print("G5_READONLY_AUDIT " + json.dumps(result,sort_keys=True),flush=True)
    page.unroute_all(behavior="ignoreErrors")
    return result

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    try:
        context=browser.new_context(viewport={"width":1280,"height":900})
        page=context.new_page()
        general=inspect(page, "general")
        kiti=inspect(page, "kiti")
        assert general["httpStatus"]==200
        assert kiti["httpStatus"]==200
        assert general["publishedNativeId"]==TARGET_FORM
        assert kiti["publishedNativeId"]==TARGET_FORM
        # The test reports a routing gap rather than mutating HubSpot.
        print("G5_KITI_ACCEPTANCE "+("PASS" if kiti["kitiRoutingVerified"] else
           "SAFE_FALLBACK" if kiti["fallbackSafetyVerified"] else "UNVERIFIED"), flush=True)
    finally:
        browser.close()
