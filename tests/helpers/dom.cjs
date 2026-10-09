// DOM de teste limitado: eventos, campos e seletores usados pelo formulário.
// Não simula layout, renderização ou toda a validação nativa de um navegador.
const fs = require('node:fs');
const voidTags = new Set(['input','img','meta','link','br','hr']);
class Element {
  constructor(tag, attrs = {}, document) {
    this.tagName = tag.toUpperCase(); this.attrs = attrs; this.ownerDocument = document;
    this.children = []; this.parentElement = null; this.listeners = {}; this.style = {};
    this.dataset = {}; this._value = attrs.value || (attrs.type === 'checkbox' ? 'on' : ''); this.files = []; this.checked = false;
    this.textContent = ''; this.classList = {
      contains: name => (this.attrs.class || '').split(/\s+/).includes(name),
      toggle: (name, on) => {
        const classes = new Set((this.attrs.class || '').split(/\s+/).filter(Boolean));
        if (on ?? !classes.has(name)) classes.add(name); else classes.delete(name);
        this.attrs.class = [...classes].join(' ');
      }
    };
  }
  get id() { return this.attrs.id || ''; }
  get type() { return this.attrs.type || (this.tagName === 'INPUT' ? 'text' : ''); }
  set type(value) { this.attrs.type = value; }
  get value() { return this._value; }
  set value(value) { this._value = String(value); if (this.type === 'file' && !value) this.files = []; }
  get max() { return this.attrs.max || ''; }
  set max(value) { this.attrs.max = value; }
  get hidden() { return 'hidden' in this.attrs; }
  set hidden(value) { if (value) this.attrs.hidden = ''; else delete this.attrs.hidden; }
  get disabled() { return 'disabled' in this.attrs; }
  set disabled(value) { if (value) this.attrs.disabled = ''; else delete this.attrs.disabled; }
  get required() { return 'required' in this.attrs; }
  set required(value) { if (value) this.attrs.required = ''; else delete this.attrs.required; }
  get readOnly() { return 'readonly' in this.attrs; }
  set readOnly(value) { if (value) this.attrs.readonly = ''; else delete this.attrs.readonly; }
  get validity() {
    let valid = !this.required || (this.type === 'checkbox' ? this.checked : Boolean(this.value));
    if (this.type === 'email' && this.value) valid &&= /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value);
    if (this.type === 'date' && this.value) valid &&= /^\d{4}-\d{2}-\d{2}$/.test(this.value) && (!this.max || this.value <= this.max) && (!this.attrs.min || this.value >= this.attrs.min);
    if (this.type === 'time' && this.value) valid &&= /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(this.value);
    if (this.attrs.maxlength) valid &&= this.value.length <= Number(this.attrs.maxlength);
    return {valid};
  }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  hasAttribute(name) { return name in this.attrs; }
  removeAttribute(name) { delete this.attrs[name]; }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  async emit(name) { for (const handler of this.listeners[name] || []) await handler({target: this, preventDefault() {}}); }
  focus() { this.ownerDocument.activeElement = this; }
  querySelectorAll(selector) {
    const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
    return descendants.filter(node => selector.split(',').some(group => {
      const parts = group.trim().split(/\s+/);
      if (!matches(node, parts.pop())) return false;
      let parent = node.parentElement;
      while (parts.length) {
        const part = parts.pop();
        while (parent && !matches(parent, part)) parent = parent.parentElement;
        if (!parent) return false;
        parent = parent.parentElement;
      }
      return true;
    }));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function matches(node, selector) {
  if (selector === '*') return true;
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
  return node.tagName.toLowerCase() === selector.toLowerCase();
}
function readDocument(path) {
  const document = new Element('document'); document.ownerDocument = document;
  document.createElement = tag => new Element(tag, {}, document);
  document.getElementById = id => document.querySelector(`#${id}`);
  const stack = [document];
  const html = fs.readFileSync(path, 'utf8');
  for (const token of html.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)) {
    if (token.startsWith('<!')) continue;
    if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
    if (!token.startsWith('<')) { stack.at(-1).textContent += token; continue; }
    const tag = token.match(/^<([\w-]+)/)?.[1]; if (!tag) continue;
    const attrs = {};
    const rest = token.slice(tag.length + 1, -1);
    for (const attr of rest.matchAll(/([\w-]+)(?:\s*=\s*"([^"]*)")?/g)) attrs[attr[1]] = attr[2] ?? '';
    const node = new Element(tag, attrs, document); stack.at(-1).append(node);
    if (!voidTags.has(tag) && !token.endsWith('/>')) stack.push(node);
  }
  return document;
}
module.exports = {readDocument};
