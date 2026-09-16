import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// A deliberately small DOM surface. No HTML parser is present: any formatter
// attempt to inject HTML fails immediately, including apparently safe markup.
class DomNode {
  constructor(tagName = null, value = '') {
    this.tagName = tagName && tagName.toUpperCase();
    this.nodeType = tagName ? 1 : 3;
    this.childNodes = [];
    this.attributes = {};
    this.value = value;
  }
  appendChild(child) { this.childNodes.push(child); return child; }
  replaceChildren(...children) { this.childNodes = children; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  set innerHTML(value) { throw new Error('Untrusted reply assigned to innerHTML'); }
  set textContent(value) { this.childNodes = [new DomNode(null, String(value))]; }
  get textContent() { return this.nodeType === 3 ? this.value : this.childNodes.map(child => child.textContent).join(''); }
}

const source = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const formatterStart = source.indexOf('// Render the assistant');
const formatterEnd = source.indexOf('// TSS Business Assistant');
assert.ok(formatterStart >= 0 && formatterEnd > formatterStart);
const document = {
  createElement: tag => new DomNode(tag),
  createTextNode: value => new DomNode(null, String(value))
};
const body = new DomNode('div');
const context = vm.createContext({
  document,
  URL,
  window: { location: new URL('https://www.thesmartysolution.com/opportunity-kiti.html') },
  body
});
vm.runInContext(source.slice(formatterStart, formatterEnd), context);
const render = text => {
  const container = new DomNode('div');
  context.tssRenderAgentReply_(container, text);
  return container;
};
const findAll = (node, tag) => node.childNodes.flatMap(child => [
  ...(child.tagName === tag.toUpperCase() ? [child] : []),
  ...findAll(child, tag)
]);

test('renders paragraphs, bold text and both list types', () => {
  const result = render('Explore **Kiti**.\nSecond line.\n\n- Clear facts\n- One enquiry\n\n2. Review\n3. Decide');
  assert.deepEqual(result.childNodes.map(node => node.tagName), ['P', 'UL', 'OL']);
  assert.equal(findAll(result, 'strong')[0].textContent, 'Kiti');
  assert.equal(findAll(result, 'p')[0].textContent, 'Explore Kiti.\nSecond line.');
  assert.equal(findAll(result, 'li').length, 4);
  assert.equal(findAll(result, 'ol')[0].getAttribute('start'), '2');
});

test('routes existing TSS enquiry and opportunity links directly to Kiti', () => {
  const result = render('[Request brief](https://www.thesmartysolution.com/kiti-enquiry.html?source=chat)\n\nhttps://thesmartysolution.com/projects.html\n\n[Enquire](kiti-enquiry.html)');
  assert.deepEqual(findAll(result, 'a').map(link => link.getAttribute('href')), [
    '/opportunity-kiti.html?source=chat#enquire',
    '/opportunity-kiti.html',
    '/opportunity-kiti.html#enquire'
  ]);
  assert.ok(findAll(result, 'a').every(link => link.getAttribute('target') === null));
});

test('preserves external destinations and uses safe new-tab attributes', () => {
  const result = render('[Official source](https://example.org/facts)');
  const [link] = findAll(result, 'a');
  assert.equal(link.getAttribute('href'), 'https://example.org/facts');
  assert.equal(link.getAttribute('target'), '_blank');
  assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(link.textContent, 'Official source');
});

test('keeps trailing punctuation outside bare links but retains balanced parentheses', () => {
  const result = render('See https://example.org/facts. Also (https://example.org/Topic_(Cyprus)).');
  assert.deepEqual(findAll(result, 'a').map(link => link.getAttribute('href')), [
    'https://example.org/facts', 'https://example.org/Topic_(Cyprus)'
  ]);
  assert.equal(result.textContent, 'See https://example.org/facts. Also (https://example.org/Topic_(Cyprus)).');
});

test('HTML and unsafe link protocols remain inert text', () => {
  const text = '<img src=x onerror=alert(1)>\n\n[Bad](javascript:alert(1)) [Data](data:text/html,test) [Email](mailto:test@example.org)';
  const result = render(text);
  assert.equal(findAll(result, 'img').length, 0);
  assert.equal(findAll(result, 'script').length, 0);
  assert.equal(findAll(result, 'a').length, 0);
  assert.ok(result.textContent.includes('<img src=x onerror=alert(1)>'));
  assert.ok(result.textContent.includes('[Bad](javascript:alert(1))'));
});

test('link labels can have bold text but cannot inject tags or nested links', () => {
  const result = render('[**Request brief** <img src=x>](https://example.org/details)');
  const [link] = findAll(result, 'a');
  assert.equal(findAll(result, 'a').length, 1);
  assert.equal(findAll(link, 'strong')[0].textContent, 'Request brief');
  assert.equal(findAll(result, 'img').length, 0);
  assert.equal(link.textContent, 'Request brief <img src=x>');
});

test('does not classify lookalike domains as TSS or accept credential URLs', () => {
  assert.equal(context.tssAgentLink_('https://thesmartysolution.com.evil.example/projects.html').external, true);
  assert.equal(context.tssAgentLink_('https://thesmartysolution.com@evil.example/projects.html'), null);
  for (const value of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/test', 'mailto:test@example.org']) {
    assert.equal(context.tssAgentLink_(value), null);
  }
});

test('actual message renderer formats assistant responses and keeps visitor text literal', () => {
  const start = source.indexOf('  const addMessage = ');
  const end = source.indexOf('  const addLeadCapture = ', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.renderMessage = addMessage;`, context);
  const reply = context.renderMessage('assistant', '**Kiti**\n\n[Request brief](https://www.thesmartysolution.com/kiti-enquiry.html)');
  assert.equal(reply.className, 'tss-msg agent');
  assert.equal(findAll(reply, 'strong')[0].textContent, 'Kiti');
  assert.equal(findAll(reply, 'a')[0].getAttribute('href'), '/opportunity-kiti.html#enquire');
  const visitor = context.renderMessage('user', '**Private message** <img src=x>');
  assert.equal(visitor.className, 'tss-msg user');
  assert.equal(visitor.textContent, '**Private message** <img src=x>');
  assert.equal(findAll(visitor, 'strong').length, 0);
  assert.equal(findAll(visitor, 'img').length, 0);
  assert.ok(source.includes("addMessage('assistant', data.reply);"));
});

// The lead receipt includes a backend-provided enquiry reference. Keep that
// response text inert too, while preserving the existing confirmation wording.
test('assistant lead receipt cannot turn a backend reference into HTML', () => {
  const start = source.indexOf('          const confirmationHeading = ');
  const endMarker = '          leadBox.replaceChildren(confirmationHeading, confirmationMessage);';
  const end = source.indexOf(endMarker, start) + endMarker.length;
  const leadBox = new DomNode('form');
  const receiptContext = vm.createContext({ document, leadBox, emailText: 'Confirmation sent.', reference: ' Reference: <img src=x onerror=alert(1)>.' });
  vm.runInContext(source.slice(start, end), receiptContext);
  assert.deepEqual(leadBox.childNodes.map(node => node.tagName), ['STRONG', 'SMALL']);
  assert.equal(findAll(leadBox, 'img').length, 0);
  assert.ok(leadBox.textContent.includes('<img src=x onerror=alert(1)>'));
});
