#!/usr/bin/env node
// Existing researcher supplies a source-backed snapshot; this is not a scheduler.
import { qualifyProspectBatch } from '../lib/tssIrcProspects.mjs';
let input = '';
try {
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 1024 * 1024) throw Error('INPUT_TOO_LARGE');
  }
  process.stdout.write(JSON.stringify(qualifyProspectBatch(JSON.parse(input)), null, 2) + '\n');
} catch {
  process.stderr.write('PROSPECT_INPUT_INVALID: supply one bounded evidence snapshot. No action executed.\n');
  process.exitCode = 1;
}
