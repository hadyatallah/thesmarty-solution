import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("../research-center/index.html",import.meta.url),"utf8");

test("organisation research form requires explicit verification",()=>{
  assert.match(html,/function referralForm\(\)\{[\s\S]*name="confirmed" required[\s\S]*research candidate only/);
  assert.match(html,/if\(!fd\.get\("confirmed"\)\)return notice\("Explicit human verification is required\.",true\);/);
});

test("scheduler evidence is classified instead of treating any Runs row as proof",()=>{
  assert.match(html,/x\.runType==="ELIGIBILITY_REVIEW"/);
  assert.match(html,/x\.runType==="RESEARCH_CYCLE"/);
  assert.match(html,/Only an ELIGIBILITY_REVIEW run counts as scheduler evidence/);
  assert.match(html,/Actual research is a separate <strong>RESEARCH_CYCLE<\/strong>/);
});
