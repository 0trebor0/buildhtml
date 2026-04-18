// Type definitions for @trebor/buildhtml
// Project: https://github.com/0trebor0/buildhtml

export interface ConfigOptions {
  mode?: 'dev' | 'prod';
  poolSize?: number;
  cacheLimit?: number;
  maxComputedFnSize?: number;
  maxEventFnSize?: number;
  enableMetrics?: boolean;
}

export declare const CONFIG: Required<ConfigOptions>;

export declare function configure(overrides: Partial<ConfigOptions>): Required<ConfigOptions>;

// ─── CSS ──────────────────────────────────────────────────────────────────────

export type CSSRules = Record<string, string | number>;

export interface TransitionOptions {
  property?: string;
  duration?: string;
  timing?: string;
  delay?: string;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface TimingStat {
  count: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface MetricsStats {
  counters: Record<string, number>;
  timings: Record<string, TimingStat>;
}

export declare class Metrics {
  enabled: boolean;
  counters: Map<string, number>;
  timings: Map<string, number[]>;
  increment(key: string, value?: number): void;
  timing(key: string, duration: number): void;
  getStats(): MetricsStats;
  reset(): void;
}

export declare const metrics: Metrics;

// ─── Components ──────────────────────────────────────────────────────────────

export type ComponentFn = (el: Element, props: Record<string, any>, children?: any) => void;

export interface ComponentOptions {
  tag?: string;
  [key: string]: any;
}

export interface ComponentRegistry {
  register(name: string, fn: ComponentFn, options?: ComponentOptions): void;
  get(name: string): { fn: ComponentFn; options: ComponentOptions };
  has(name: string): boolean;
  unregister(name: string): void;
}

export declare const components: ComponentRegistry;

// ─── Head ────────────────────────────────────────────────────────────────────

export interface MetaAttrs {
  name?: string;
  content?: string;
  property?: string;
  charset?: string;
  [key: string]: string | undefined;
}

export interface LinkAttrs {
  rel?: string;
  href?: string;
  type?: string;
  [key: string]: string | undefined;
}

export interface ScriptAttrs {
  src?: string;
  type?: string;
  defer?: boolean;
  async?: boolean;
  [key: string]: string | boolean | undefined;
}

export declare class Head {
  title: string;
  metas: MetaAttrs[];
  links: LinkAttrs[];
  styles: string[];
  scripts: ScriptAttrs[];
  globalStyles: string[];
  classStyles: Record<string, string>;
  setTitle(t: string): void;
  setCharset(c: string): void;
  setNonce(nonce: string): void;
  addMeta(attrs: MetaAttrs): void;
  addLink(attrs: LinkAttrs): void;
  addStyle(css: string): void;
  addScript(attrs: ScriptAttrs): void;
  addRawLink(html: string): void;
  globalCss(selector: string, rules: CSSRules): void;
  addClass(name: string, rules: CSSRules): void;
  render(): string;
}

// ─── Fragment ─────────────────────────────────────────────────────────────────

export interface Fragment {
  html: string;
  css: string;
}

// ─── Option types for select ─────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  text?: string;
  selected?: boolean;
  disabled?: boolean;
}

export interface RadioOption {
  value: string;
  label?: string;
  text?: string;
  checked?: boolean;
}

// ─── Shortcut methods shared by Element and Document ─────────────────────────

export interface SharedShortcuts<TSelf> {
  // Simple tag shortcuts
  div(): Element;
  span(): Element;
  section(): Element;
  header(): Element;
  footer(): Element;
  main(): Element;
  nav(): Element;
  article(): Element;
  aside(): Element;
  form(): Element;
  ul(): Element;
  ol(): Element;
  table(): Element;
  tr(): Element;
  details(): Element;
  summary(): Element;
  dialog(): Element;
  pre(): Element;
  code(): Element;
  blockquote(): Element;
  h1(): Element;
  h2(): Element;
  h3(): Element;
  h4(): Element;
  h5(): Element;
  h6(): Element;

  // Tags with optional text
  li(text?: string | number): Element;
  th(text?: string | number): Element;
  td(text?: string | number): Element;
  p(text?: string | number): Element;

  // Special tags
  img(src: string, alt?: string): Element;
  a(href: string, text?: string): Element;
  button(text?: string): Element;
  input(type?: string, attrs?: Record<string, any>): Element;
  textarea(attrs?: Record<string, any>): Element;
  select(options?: SelectOption[], attrs?: Record<string, any>): Element;
  br(): TSelf;
  hr(): Element;

  // Form helpers
  formGroup(label: string, inputType?: string, inputAttrs?: Record<string, any>): Element;
  checkbox(name: string, label: string, checked?: boolean): Element;
  radio(name: string, options?: RadioOption[]): Element;
  fieldset(legend?: string, setupFn?: (fs: Element) => void): Element;
  hiddenInput(name: string, value: string): Element;

  // Layout helpers
  grid(columns: number | string, items?: Array<((el: Element) => void) | Element | string>, gap?: string): Element;
  flex(items?: Array<((el: Element) => void) | Element | string>, options?: {
    direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
    gap?: string;
    align?: string;
    justify?: string;
    wrap?: string;
  }): Element;
  stack(items?: Array<((el: Element) => void) | Element | string>, gap?: string): Element;
  row(items?: Array<((el: Element) => void) | Element | string>, gap?: string): Element;
  center(childFn?: (el: Element) => void): Element;
  container(childFn?: (el: Element) => void, maxWidth?: string): Element;
  spacer(height?: string): Element;
  divider(options?: { color?: string; margin?: string }): Element;
  columns(count: number, columnFns?: Array<(col: Element) => void>, gap?: string): Element;

  // Data helpers
  list<T>(items: T[], renderer?: (li: Element, item: T, index: number) => void, tag?: string): Element;
  dataTable(headers: string[] | null, rows: any[][], options?: { class?: string; autoHeaders?: boolean }): Element;

  // Utility
  each<T>(items: T[], fn: (self: TSelf, item: T, index: number) => void): TSelf;
  when(condition: boolean | any, fn: (self: TSelf) => void): TSelf;
}

// ─── Element ──────────────────────────────────────────────────────────────────

export declare class Element implements SharedShortcuts<Element> {
  tag: string;
  attrs: Record<string, any>;
  children: Array<Element | string>;
  events: Array<{ event: string; id: string; targetId?: string; fn: Function }>;
  cssText: string;
  hydrate: boolean;

  // Tree building
  child(tag: string): Element;
  create(tag: string): Element;
  append(child: Element | string | number | null): Element;
  appendUnsafe(html: string): Element;
  text(content: string | number | null): Element;
  set textContent(value: string | null);
  before(sibling: Element | string): Element;
  after(sibling: Element | string): Element;
  wrap(tag: string): Element;
  remove(): Element;
  empty(): Element;
  clone(): Element;
  find(tag: string): Element | null;
  findById(id: string): Element | null;
  findAll(tag: string): Element[];
  closest(tag: string): Element | null;
  html(): string;
  toString(): string;

  // Attributes
  attr(key: string, value: any): Element;
  attribute(key: string, value: any): Element;
  id(value?: string): Element;
  setAttrs(obj: Record<string, any>): Element;
  data(obj: Record<string, string | number>): Element;
  aria(obj: Record<string, string>): Element;

  // Attribute shortcuts
  href(url: string): Element;
  src(url: string): Element;
  type(t: string): Element;
  placeholder(t: string): Element;
  value(v: string | number): Element;
  name(n: string): Element;
  role(r: string): Element;
  for(id: string): Element;
  title(t: string): Element;
  tabindex(n: number | string): Element;
  action(url: string): Element;
  method(m: string): Element;
  target(t: string): Element;
  rel(r: string): Element;
  alt(a: string): Element;
  width(w: string | number): Element;
  height(h: string | number): Element;
  min(v: string | number): Element;
  max(v: string | number): Element;
  step(v: string | number): Element;
  pattern(p: string): Element;
  required(v?: boolean): Element;
  readonly(v?: boolean): Element;
  autofocus(v?: boolean): Element;
  autocomplete(v?: string): Element;
  multiple(v?: boolean): Element;
  checked(v?: boolean): Element;
  selected(v?: boolean): Element;
  disabled(v?: boolean): Element;
  hidden(v?: boolean): Element;
  contentEditable(v?: boolean): Element;
  draggable(v?: boolean): Element;

  // CSS / Classes
  css(rules: CSSRules): Element;
  style(prop: CSSRules): Element;
  style(prop: string, value: string | number): Element;
  addClass(...names: string[]): Element;
  removeClass(...names: string[]): Element;
  toggleClass(condition: boolean, name: string): Element;
  classIf(condition: boolean, trueClass: string, falseClass?: string): Element;
  classMap(map: Record<string, boolean>): Element;
  hasClass(name: string): boolean;

  // CSS pseudo-class & responsive
  hover(rules: CSSRules): Element;
  focusCss(rules: CSSRules): Element;
  active(rules: CSSRules): Element;
  firstChild(rules: CSSRules): Element;
  lastChild(rules: CSSRules): Element;
  nthChild(n: string | number, rules: CSSRules): Element;
  pseudo(which: 'before' | 'after' | string, rules: CSSRules): Element;
  media(query: string, rules: CSSRules): Element;
  transition(props: string | TransitionOptions): Element;
  transform(value: string): Element;
  animate(keyframeName: string, options?: {
    duration?: string;
    timing?: string;
    delay?: string;
    iterations?: string | number;
    direction?: string;
    fillMode?: string;
  }): Element;

  // CSS property shorthands
  opacity(n: number | string): Element;
  zIndex(n: number | string): Element;
  cursor(type: string): Element;
  overflow(value: string): Element;
  display(value: string): Element;
  position(value: string): Element;
  size(w: string, h?: string): Element;

  // Form validation attributes
  minLength(n: number): Element;
  maxLength(n: number): Element;
  accept(types: string): Element;
  rows(n: number): Element;
  cols(n: number): Element;

  // Visibility / state toggles
  show(): Element;
  hide(): Element;
  enable(): Element;
  disable(): Element;
  focus(): Element;

  // Slots
  slot(name?: string): Element;
  fillSlot(name: string, contentFn: (slotEl: Element) => void): Element;

  // Portal
  portal(targetId: string): Element;

  // State & events
  bind(stateKey: string, templateFn?: (val: any) => any): Element;
  state(value: any): Element;
  computed(fn: () => any): Element;
  on(event: string, fn: (e: Event) => void): Element;
  bindState(target: Element, event: string, fn: (e: Event) => void): Element;

  // Event shorthands
  onClick(fn: (e: MouseEvent) => void): Element;
  onChange(fn: (e: Event) => void): Element;
  onInput(fn: (e: InputEvent) => void): Element;
  onSubmit(fn: (e: SubmitEvent) => void): Element;
  onKeydown(fn: (e: KeyboardEvent) => void): Element;
  onKeyup(fn: (e: KeyboardEvent) => void): Element;
  onKeypress(fn: (e: KeyboardEvent) => void): Element;
  onFocus(fn: (e: FocusEvent) => void): Element;
  onBlur(fn: (e: FocusEvent) => void): Element;
  onMouseenter(fn: (e: MouseEvent) => void): Element;
  onMouseleave(fn: (e: MouseEvent) => void): Element;
  onMousedown(fn: (e: MouseEvent) => void): Element;
  onMouseup(fn: (e: MouseEvent) => void): Element;
  onMousemove(fn: (e: MouseEvent) => void): Element;
  onDblclick(fn: (e: MouseEvent) => void): Element;
  onContextmenu(fn: (e: MouseEvent) => void): Element;
  onScroll(fn: (e: Event) => void): Element;
  onLoad(fn: (e: Event) => void): Element;
  onError(fn: (e: Event) => void): Element;
  onDragstart(fn: (e: DragEvent) => void): Element;
  onDragend(fn: (e: DragEvent) => void): Element;
  onDragover(fn: (e: DragEvent) => void): Element;
  onDrop(fn: (e: DragEvent) => void): Element;
  onTouchstart(fn: (e: TouchEvent) => void): Element;
  onTouchend(fn: (e: TouchEvent) => void): Element;
  onTouchmove(fn: (e: TouchEvent) => void): Element;

  // Tree manipulation
  replaceWith(other: Element): Element;
  prependChild(child: Element | string): Element;
  insertAt(index: number, child: Element | string): Element;
  childCount(): number;
  parent(): Element | null;
  index(): number;
  siblings(): Element[];
  nextSibling(): Element | null;
  prevSibling(): Element | null;
  isVoid(): boolean;
  tooltip(text: string): Element;

  // Component system
  component(name: string, props?: Record<string, any>, overrides?: ComponentOptions): Element;
  use(fn: ComponentFn, props?: Record<string, any>, tag?: string): Element;

  // Fragment rendering
  renderFragment(): Fragment;

  // SharedShortcuts implementations (see interface above)
  div(): Element;
  span(): Element;
  section(): Element;
  header(): Element;
  footer(): Element;
  main(): Element;
  nav(): Element;
  article(): Element;
  aside(): Element;
  form(): Element;
  ul(): Element;
  ol(): Element;
  table(): Element;
  tr(): Element;
  details(): Element;
  summary(): Element;
  dialog(): Element;
  pre(): Element;
  code(): Element;
  blockquote(): Element;
  h1(): Element;
  h2(): Element;
  h3(): Element;
  h4(): Element;
  h5(): Element;
  h6(): Element;
  li(text?: string | number): Element;
  th(text?: string | number): Element;
  td(text?: string | number): Element;
  p(text?: string | number): Element;
  img(src: string, alt?: string): Element;
  a(href: string, text?: string): Element;
  button(text?: string): Element;
  input(type?: string, attrs?: Record<string, any>): Element;
  textarea(attrs?: Record<string, any>): Element;
  select(options?: SelectOption[], attrs?: Record<string, any>): Element;
  br(): Element;
  hr(): Element;
  formGroup(label: string, inputType?: string, inputAttrs?: Record<string, any>): Element;
  checkbox(name: string, label: string, checked?: boolean): Element;
  radio(name: string, options?: RadioOption[]): Element;
  fieldset(legend?: string, setupFn?: (fs: Element) => void): Element;
  hiddenInput(name: string, value: string): Element;
  grid(columns: number | string, items?: Array<((el: Element) => void) | Element | string>, gap?: string): Element;
  flex(items?: Array<((el: Element) => void) | Element | string>, options?: {
    direction?: string;
    gap?: string;
    align?: string;
    justify?: string;
    wrap?: string;
  }): Element;
  stack(items?: Array<((el: Element) => void) | Element | string>, gap?: string): Element;
  row(items?: Array<((el: Element) => void) | Element | string>, gap?: string): Element;
  center(childFn?: (el: Element) => void): Element;
  container(childFn?: (el: Element) => void, maxWidth?: string): Element;
  spacer(height?: string): Element;
  divider(options?: { color?: string; margin?: string }): Element;
  columns(count: number, columnFns?: Array<(col: Element) => void>, gap?: string): Element;
  list<T>(items: T[], renderer?: (li: Element, item: T, index: number) => void, tag?: string): Element;
  dataTable(headers: string[] | null, rows: any[][], options?: { class?: string; autoHeaders?: boolean }): Element;
  each<T>(items: T[], fn: (self: Element, item: T, index: number) => void): Element;
  when(condition: boolean | any, fn: (self: Element) => void): Element;
}

// ─── Document ────────────────────────────────────────────────────────────────

export interface DocumentOptions {
  cache?: boolean;
  cacheKey?: string;
  nonce?: string;
  lang?: string;
}

export interface NodeDef {
  tag?: string;
  text?: string;
  id?: string;
  class?: string;
  attrs?: Record<string, any>;
  css?: CSSRules;
  children?: NodeDef[];
  [key: string]: any;
}

export interface PageDef {
  title?: string;
  lang?: string;
  charset?: string;
  viewport?: string | boolean;
  resetCss?: boolean;
  favicon?: string;
  canonical?: string;
  noindex?: boolean | 'nofollow';
  meta?: MetaAttrs[];
  links?: LinkAttrs[];
  scripts?: ScriptAttrs[];
  cssVars?: Record<string, string>;
  globalStyles?: Record<string, CSSRules>;
  sharedClasses?: Record<string, CSSRules>;
  keyframes?: Record<string, Record<string, CSSRules>>;
  darkMode?: Record<string, CSSRules>;
  print?: Record<string, CSSRules>;
  bodyCss?: CSSRules;
  bodyClass?: string | string[];
  ogTags?: Record<string, string>;
  twitterCard?: Record<string, string>;
  state?: Record<string, any>;
  body?: NodeDef | NodeDef[];
}

export declare class Document implements SharedShortcuts<Document> {
  body: Array<Element | string>;
  head: Head;

  constructor(options?: DocumentOptions);

  // HTML & BODY attributes
  lang(l: string): Document;
  htmlAttr(key: string, value: string): Document;
  bodyId(id: string): Document;
  bodyClass(...names: string[]): Document;
  bodyAttr(key: string, value: string): Document;
  bodyCss(rules: CSSRules): Document;

  // Head shortcuts
  title(t: string): Document;
  addMeta(attrs: MetaAttrs): Document;
  addLink(attrs: LinkAttrs): Document;
  addStyle(css: string): Document;
  addScript(attrs: ScriptAttrs): Document;
  meta(name: string, content: string): Document;
  viewport(v?: string): Document;
  charset(c?: string): Document;
  favicon(href: string, type?: string): Document;
  rawHead(html: string): Document;
  inlineScript(code: string): Document;
  inlineStyle(css: string): Document;
  preload(href: string, as: string, type?: string): Document;
  prefetch(href: string): Document;
  preconnect(href: string): Document;
  canonical(url: string): Document;
  ogTags(og: Record<string, string>): Document;
  twitterCard(tc: Record<string, string>): Document;
  jsonLd(schema: object): Document;
  noindex(nofollow?: boolean): Document;

  // Global CSS
  globalStyle(selector: string, rules: CSSRules): Document;
  sharedClass(name: string, rules: CSSRules): Document;
  defineClass(selector: string, rules: CSSRules, isRawSelector?: boolean): Document;
  resetCss(): Document;

  // CSS features
  keyframes(name: string, frames: Record<string, CSSRules>): Document;
  mediaQuery(query: string, selectorRules: Record<string, CSSRules>): Document;
  cssVar(name: string, value: string | number): Document;
  cssVars(obj: Record<string, string | number>): Document;
  darkMode(selectorRules: Record<string, CSSRules>): Document;
  print(selectorRules: Record<string, CSSRules>): Document;

  // State
  state(key: string, value: any): Document;
  states(obj: Record<string, any>): Document;

  // Lifecycle
  oncreate(fn: () => void): Document;

  // Element creation
  createElement(tag: string): Element;
  create(tag: string): Element;
  child(tag: string): Element;

  // Component system
  component(name: string, props?: Record<string, any>, overrides?: ComponentOptions): Element;
  use(fn: ComponentFn, props?: Record<string, any>, tag?: string): Element;
  useFragment(fn: (doc: Document) => void): Document;

  // Declarative builder
  build(defs: NodeDef | NodeDef[]): Document;

  // Utility APIs
  comment(text: string): Document;
  raw(html: string): Document;
  stamp(fragment: Fragment): Document;
  group(fn: (doc: Document) => void): Document;
  template(name: string, fn: (doc: Document, vars: Record<string, any>) => void): Document;
  useTemplate(name: string, vars?: Record<string, any>): Document;
  isEmpty(): boolean;
  elementCount(): number;

  // JSON import / export
  fromJSON(def: PageDef): Document;
  toJSON(): object;

  // Rendering
  render(): string;
  output(): string;
  save(path: string): Document;
  clear(): void;

  // SharedShortcuts implementations
  div(): Element;
  span(): Element;
  section(): Element;
  header(): Element;
  footer(): Element;
  main(): Element;
  nav(): Element;
  article(): Element;
  aside(): Element;
  form(): Element;
  ul(): Element;
  ol(): Element;
  table(): Element;
  tr(): Element;
  details(): Element;
  summary(): Element;
  dialog(): Element;
  pre(): Element;
  code(): Element;
  blockquote(): Element;
  h1(): Element;
  h2(): Element;
  h3(): Element;
  h4(): Element;
  h5(): Element;
  h6(): Element;
  li(text?: string | number): Element;
  th(text?: string | number): Element;
  td(text?: string | number): Element;
  p(text?: string | number): Element;
  img(src: string, alt?: string): Element;
  a(href: string, text?: string): Element;
  button(text?: string): Element;
  input(type?: string, attrs?: Record<string, any>): Element;
  textarea(attrs?: Record<string, any>): Element;
  select(options?: SelectOption[], attrs?: Record<string, any>): Element;
  br(): Document;
  hr(): Element;
  formGroup(label: string, inputType?: string, inputAttrs?: Record<string, any>): Element;
  checkbox(name: string, label: string, checked?: boolean): Element;
  radio(name: string, options?: RadioOption[]): Element;
  fieldset(legend?: string, setupFn?: (fs: Element) => void): Element;
  hiddenInput(name: string, value: string): Element;
  grid(columns: number | string, items?: Array<((el: Element) => void) | Element | string>, gap?: string): Element;
  flex(items?: Array<((el: Element) => void) | Element | string>, options?: {
    direction?: string;
    gap?: string;
    align?: string;
    justify?: string;
    wrap?: string;
  }): Element;
  stack(items?: Array<((el: Element) => void) | Element | string>, gap?: string): Element;
  row(items?: Array<((el: Element) => void) | Element | string>, gap?: string): Element;
  center(childFn?: (el: Element) => void): Element;
  container(childFn?: (el: Element) => void, maxWidth?: string): Element;
  spacer(height?: string): Element;
  divider(options?: { color?: string; margin?: string }): Element;
  columns(count: number, columnFns?: Array<(col: Element) => void>, gap?: string): Element;
  list<T>(items: T[], renderer?: (li: Element, item: T, index: number) => void, tag?: string): Element;
  dataTable(headers: string[] | null, rows: any[][], options?: { class?: string; autoHeaders?: boolean }): Element;
  each<T>(items: T[], fn: (self: Document, item: T, index: number) => void): Document;
  when(condition: boolean | any, fn: (self: Document) => void): Document;
}

// ─── Template Engine ──────────────────────────────────────────────────────────

export interface TemplateEngineOptions {
  viewsDir?: string;
  extension?: string;
  cache?: boolean;
}

export declare class TemplateParser {
  constructor(options?: TemplateEngineOptions);
  parse(source: string): (doc: Document) => void;
}

export declare function parseTemplate(source: string): (doc: Document) => void;
export declare function renderTemplate(source: string, vars?: Record<string, any>, options?: DocumentOptions): string;
export declare function compileTemplate(source: string): (vars?: Record<string, any>, options?: DocumentOptions) => string;
export declare function renderFile(filePath: string, vars?: Record<string, any>, options?: DocumentOptions): Promise<string>;
export declare function compileFile(filePath: string): Promise<(vars?: Record<string, any>, options?: DocumentOptions) => string>;
export declare function templateEngine(options?: TemplateEngineOptions): (filePath: string, options: Record<string, any>, callback: (err: Error | null, html?: string) => void) => void;

// ─── Middleware ───────────────────────────────────────────────────────────────

export interface MiddlewareOptions {
  nonce?: (req: any) => string;
}

export interface CacheStats {
  cache: { size: number; limit: number };
  inFlight: { size: number };
  pools: { elements: number; arrays: number };
  metrics: MetricsStats | null;
}

export interface HealthCheckResult {
  status: 'ok';
  timestamp: number;
  config: { mode: string; poolSize: number; cacheLimit: number };
  stats: CacheStats;
}

export declare function createCachedRenderer(
  builderFn: (req: any) => Document | Promise<Document>,
  cacheKeyOrFn: string | null | ((req: any) => string | null),
  options?: MiddlewareOptions
): (req: any, res: any, next: (err?: any) => void) => Promise<void>;

export declare function clearCache(pattern?: string): void;
export declare function getCacheStats(): CacheStats;
export declare function healthCheck(): HealthCheckResult;

// ─── Top-level helpers ────────────────────────────────────────────────────────

export declare function page(title: string, options?: DocumentOptions): Document;

export declare function renderFromJSON(def: PageDef, setup?: ((doc: Document) => void) | DocumentOptions, options?: DocumentOptions): string;

/** Alias for renderFromJSON */
export declare const renderJSON: typeof renderFromJSON;

export declare function resetPools(): void;

export declare const responseCache: {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  clear(): void;
  readonly size: number;
};
