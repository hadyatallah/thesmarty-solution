#!/usr/bin/env node
// Offline deterministic consumer entry point. Never reads credentials or calls providers.
import { planCommercialHandoff } from '../lib/tssIrcHandoff.mjs';
let input = '';
try {
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 1024 * 1024) throw Error('INPUT_TOO_LARGE');
  }
  const snapshot = JSON.parse(input);
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== 'object') throw Error('INVALID_SNAPSHOT');
  process.stdout.write(JSON.stringify(planCommercialHandoff(snapshot), null, 2) + '\n');
} catch {
  process.stderr.write('HANDOFF_INPUT_INVALID: provide one bounded JSON snapshot. No action executed.\n');
  process.exitCode = 1;
}
