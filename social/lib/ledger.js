import { requireThat } from './qa.js';

const REPO = 'hadyatallah/thesmarty-solution';
export class Ledger {
  constructor(token, branch, sourceCommit) { this.token = token; this.branch = branch; this.sourceCommit = sourceCommit; }
  async api(route, method = 'GET', body, allow404 = false) {
    const response = await fetch(`https://api.github.com/repos/${REPO}${route}`, { method, headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (allow404 && response.status === 404) return null;
    requireThat(response.ok, `Publishing history write/read failed: HTTP ${response.status}`);
    return response.json();
  }
  async load(seed) {
    requireThat(this.token && /^[a-f0-9]{40}$/.test(this.sourceCommit), 'GitHub history credentials or source commit missing');
    if (!await this.api(`/git/ref/heads/${this.branch}`, 'GET', null, true)) await this.api('/git/refs', 'POST', { ref: `refs/heads/${this.branch}`, sha: this.sourceCommit });
    const file = await this.api(`/contents/social/history.json?ref=${this.branch}`, 'GET', null, true);
    if (file) { this.sha = file.sha; this.data = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')); }
    else { this.data = { version: 2, items: seed, qaFailures: {} }; await this.save('Initialize durable TSS publishing history'); }
    requireThat(this.data.version === 2 && Array.isArray(this.data.items), 'Invalid history blocks publishing');
    return this.data;
  }
  async save(message) {
    const result = await this.api('/contents/social/history.json', 'PUT', { message, branch: this.branch, content: Buffer.from(JSON.stringify(this.data, null, 2) + '\n').toString('base64'), ...(this.sha ? { sha: this.sha } : {}) });
    this.sha = result.content.sha;
    return result.commit.sha;
  }
  async writeFile(filePath, bytes, message) {
    requireThat(/^social\/[a-zA-Z0-9._/-]+$/.test(filePath) && !filePath.includes('..'), 'Invalid evidence path');
    const existing = await this.api(`/contents/${filePath}?ref=${this.branch}`, 'GET', null, true);
    const content = Buffer.from(bytes).toString('base64');
    if (existing && existing.content.replace(/\s/g, '') === content) return null;
    const result = await this.api(`/contents/${filePath}`, 'PUT', { branch: this.branch, message, content, ...(existing ? { sha: existing.sha } : {}) });
    return result.commit.sha;
  }
}
