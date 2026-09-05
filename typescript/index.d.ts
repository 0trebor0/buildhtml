// Type definitions for @trebor/buildhtml
// Project: https://github.com/0trebor0/buildhtml

export interface ConfigOptions {
  mode?: 'dev' | 'prod';
  poolSize?: number;
  cacheLimit?: number;
  maxComputedFnSize?: number;
  maxEventFnSize?: number;
  /** Exposes window.BuildHTMLDebug.inspect() in generated development pages. */
  debug?: boolean;
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
  /** Derived from CONFIG.enableMetrics; change it with configure(). */
  readonly enabled: boolean;
  counters: Map<string, number>;
  timings: Map<string, number[]>;
  increment(key: string, value?: number): void;
  timing(key: string, duration: number): void;
  getStats(): MetricsStats;
  reset(): void;
}

export declare const metrics: Metrics;

// ─── Components ──────────────────────────────────────────────────────────────

export type ComponentFn<TProps = Record<string, any>> = (el: Element, props: TProps, children?: any) => void;

export interface ComponentOptions {
  tag?: string;
  [key: string]: any;
}

export interface ComponentRegistry {
  register<TProps = Record<string, any>>(name: string, fn: ComponentFn<TProps>, options?: ComponentOptions): ComponentRegistry;
  get(name: string): { fn: ComponentFn<any>; options: ComponentOptions };
  has(name: string): boolean;
  unregister(name: string): ComponentRegistry;
  list(): string[];
  extend<TProps = Record<string, any>>(newName: string, baseName: string, extendFn: ComponentFn<TProps>, options?: ComponentOptions): ComponentRegistry;
  clear(): void;
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
  charset: string;
  metas: MetaAttrs[];
  links: string[];
  rawLinks: string[];
  styles: string[];
  scripts: string[];
  globalStyles: string[];
  classStyles: Record<string, string>;
  nonce: string | null;
  setTitle(t: string): Head;
  setCharset(c: string): Head;
  setNonce(nonce: string): Head;
  addMeta(attrs: MetaAttrs): Head;
  addLink(href: string): Head;
  addStyle(css: string): Head;
  addScript(src: string): Head;
  addRawLink(html: string): Head;
  globalCss(selector: string, rules: CSSRules): Head;
  addClass(name: string, rules: CSSRules): Head;
  hasStyles(): boolean;
  /** Renders the `<head>` contents. Does not consume the document. */
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

export type StateShape = Record<string, any>;
export type StateKey<S extends StateShape> = Extract<keyof S, string>;

/**
 * DOM properties `bindProp()` will compile a binding for.
 *
 * The markup sinks (`innerHTML`, `outerHTML`, `srcdoc`) are deliberately absent:
 * assigning state to them parses it as HTML. The URL properties are included but
 * compiled behind a scheme guard. Anything not listed is refused at runtime, so
 * the type mirrors what the implementation actually accepts.
 */
export type BindableProp =
  | 'value' | 'checked' | 'selected' | 'disabled' | 'open' | 'hidden'
  | 'readOnly' | 'required' | 'textContent'
  | 'href' | 'src' | 'action' | 'formAction' | 'poster' | 'cite';
export type StateValue<S extends StateShape, K extends StateKey<S>> = S[K];
export type ArrayItem<T> = T extends readonly (infer Item)[] ? Item : never;
export type ElementContent<S extends StateShape = StateShape> = string | number | ((element: Element<S>) => void);

export interface FieldOptions<S extends StateShape = StateShape> {
  type?: string;
  id?: string;
  name?: string;
  bind?: StateKey<S>;
  groupClass?: string;
  attrs?: Record<string, any>;
}

export interface FieldResult<S extends StateShape = StateShape> {
  group: Element<S>;
  label: Element<S>;
  input: Element<S>;
}

export interface ValidationIssue {
  code: string;
  message: string;
  tag?: string;
  id?: string | null;
  callbackType?: string;
  variables?: string[];
  reason?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export type ClientEventHandler<E extends Event = Event, C = any, S extends StateShape = StateShape> = (
  this: HTMLElement,
  event: E,
  state: S,
  element: HTMLElement,
  context: C
) => void | Promise<void>;

/**
 * Fourth argument to `on()` and the event shorthands.
 *
 * `once`, `passive` and `capture` are passed to `addEventListener`.
 * `preventDefault` and `stopPropagation` compile into the generated wrapper and
 * run before your handler.
 *
 * Unknown keys are ignored, and every value is coerced to a boolean.
 */
export interface EventOptions {
  /** Remove the listener after it fires once. */
  once?: boolean;
  /**
   * Promise never to call `preventDefault()`. Set this on `scroll`, `wheel` and
   * `touch*` handlers — browsers warn when a listener on those is not passive.
   */
  passive?: boolean;
  /** Fire during the capture phase instead of the bubble phase. */
  capture?: boolean;
  /** Call `event.preventDefault()` before the handler runs. */
  preventDefault?: boolean;
  /** Call `event.stopPropagation()` before the handler runs. */
  stopPropagation?: boolean;
}

// ─── Shortcut methods shared by Element and Document ─────────────────────────

export interface SharedShortcuts<TSelf, S extends StateShape = StateShape> {
  // Simple tag shortcuts
  div(content?: ElementContent<S>): Element<S>;
  span(content?: ElementContent<S>): Element<S>;
  section(content?: ElementContent<S>): Element<S>;
  header(content?: ElementContent<S>): Element<S>;
  footer(content?: ElementContent<S>): Element<S>;
  main(content?: ElementContent<S>): Element<S>;
  nav(content?: ElementContent<S>): Element<S>;
  article(content?: ElementContent<S>): Element<S>;
  aside(content?: ElementContent<S>): Element<S>;
  form(content?: ElementContent<S>): Element<S>;
  ul(content?: ElementContent<S>): Element<S>;
  ol(content?: ElementContent<S>): Element<S>;
  table(content?: ElementContent<S>): Element<S>;
  thead(content?: ElementContent<S>): Element<S>;
  tbody(content?: ElementContent<S>): Element<S>;
  tfoot(content?: ElementContent<S>): Element<S>;
  tr(content?: ElementContent<S>): Element<S>;
  details(content?: ElementContent<S>): Element<S>;
  summary(content?: ElementContent<S>): Element<S>;
  dialog(content?: ElementContent<S>): Element<S>;
  pre(content?: ElementContent<S>): Element<S>;
  code(content?: ElementContent<S>): Element<S>;
  blockquote(content?: ElementContent<S>): Element<S>;
  h1(content?: ElementContent<S>): Element<S>;
  h2(content?: ElementContent<S>): Element<S>;
  h3(content?: ElementContent<S>): Element<S>;
  h4(content?: ElementContent<S>): Element<S>;
  h5(content?: ElementContent<S>): Element<S>;
  h6(content?: ElementContent<S>): Element<S>;

  // Tags with optional text
  li(content?: ElementContent<S>): Element<S>;
  th(content?: ElementContent<S>): Element<S>;
  td(content?: ElementContent<S>): Element<S>;
  p(content?: ElementContent<S>): Element<S>;
  strong(content?: ElementContent<S>): Element<S>;
  small(content?: ElementContent<S>): Element<S>;
  label(content?: ElementContent<S>): Element<S>;
  caption(content?: ElementContent<S>): Element<S>;
  legend(content?: ElementContent<S>): Element<S>;
  em(content?: ElementContent<S>): Element<S>;
  b(content?: ElementContent<S>): Element<S>;
  i(content?: ElementContent<S>): Element<S>;

  // Special tags
  img(src: string, alt?: string): Element<S>;
  a(href: string, text?: string): Element<S>;
  button(text?: string): Element<S>;
  input(type?: string, attrs?: Record<string, any>): Element<S>;
  textarea(attrs?: Record<string, any>): Element<S>;
  /**
   * Builds a `<select>`.
   *
   * An option may be an object (`{ value, text?, selected?, disabled? }`) or a
   * plain string or number, which becomes both the value and the label.
   * Nullish entries are skipped.
   */
  select(options?: Array<SelectOption | string | number>, attrs?: Record<string, any>): Element<S>;
  br(): TSelf;
  hr(): Element<S>;

  // Form helpers
  formGroup(label: string, inputType?: string, inputAttrs?: Record<string, any>): Element<S>;
  /**
   * Builds a labelled form control, wiring `label[for]` to a generated input id.
   *
   * Returns `{ group, label, input }` so each part can be configured.
   */
  field(label: string, options?: FieldOptions<S>): FieldResult<S>;
  /**
   * Builds a checkbox with its label. Returns the **wrapper** element.
   */
  checkbox(name: string, label: string, checked?: boolean): Element<S>;
  /**
   * Builds a group of radio inputs with labels. Returns the **wrapper** element.
   */
  radio(name: string, options?: RadioOption[]): Element<S>;
  fieldset(legend?: string, setupFn?: (fs: Element<S>) => void): Element<S>;
  hiddenInput(name: string, value: string): Element<S>;

  // Layout helpers
  grid(columns: number | string, items?: Array<((el: Element<S>) => void) | Element<S> | string>, gap?: string): Element<S>;
  flex(items?: Array<((el: Element<S>) => void) | Element<S> | string>, options?: {
    direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
    gap?: string;
    align?: string;
    justify?: string;
    wrap?: string;
  }): Element<S>;
  stack(items?: Array<((el: Element<S>) => void) | Element<S> | string>, gap?: string): Element<S>;
  row(items?: Array<((el: Element<S>) => void) | Element<S> | string>, gap?: string): Element<S>;
  center(childFn?: (el: Element<S>) => void): Element<S>;
  container(childFn?: (el: Element<S>) => void, maxWidth?: string): Element<S>;
  spacer(height?: string): Element<S>;
  divider(options?: { color?: string; margin?: string }): Element<S>;
  columns(count: number, columnFns?: Array<(col: Element<S>) => void>, gap?: string): Element<S>;

  // Data helpers
  /**
   * Builds a list with one `<li>` per item, `<ul>` by default.
   *
   * Pass `tag` to change the container — `list(items, null, 'ol')`. Note that
   * the `ol()` shortcut takes text, not an array.
   */
  list<T>(items: T[], renderer?: (li: Element<S>, item: T, index: number) => void, tag?: string): Element<S>;
  /** Rows may be arrays (positional cells) or objects (keyed by `headers`, or by `autoHeaders` from the first row). */
  dataTable(headers: string[] | null, rows: Array<any[] | Record<string, any>>, options?: { class?: string; autoHeaders?: boolean }): Element<S>;

  // Utility
  each<T>(items: T[], fn: (self: TSelf, item: T, index: number) => void): TSelf;
  when(condition: boolean | any, fn: (self: TSelf) => void): TSelf;
}

// ─── Element ──────────────────────────────────────────────────────────────────

export declare class Element<S extends StateShape = StateShape> implements SharedShortcuts<Element<S>, S> {
  tag: string;
  attrs: Record<string, any>;
  children: Array<Element | string>;
  events: Array<{ event: string; id: string; targetId?: string; fn: Function }>;
  cssText: string;
  hydrate: boolean;

  // Tree building
  child(tag: string): Element<S>;
  create(tag: string): Element<S>;
  build(defs: NodeDef | NodeDef[]): this;
  append(child: Element<S> | string | number | null): this;
  appendUnsafe(html: string): this;
  text(content: string | number | null): this;
  set textContent(value: string | null);
  /**
   * Inserts a sibling immediately before this element.
   * A string is inserted as **escaped text**, not parsed as markup.
   */
  before(sibling: Element<S> | string): this;
  /**
   * Inserts a sibling immediately after this element.
   * A string is inserted as **escaped text**, not parsed as markup.
   */
  after(sibling: Element<S> | string): this;
  /**
   * Wraps this element in a new `tag` element, in place.
   *
   * Returns the **new wrapper**, not this element. Works whether this element
   * is nested or at the top level of the document.
   */
  wrap(tag: string): this;
  /**
   * Detaches this element from its parent, or from the document body when it
   * is a top-level element. Calling it twice is harmless.
   */
  remove(): this;
  empty(): this;
  clone(): Element<S>;
  find(tag: string): Element<S> | null;
  findById(id: string): Element<S> | null;
  findAll(tag: string): Element<S>[];
  closest(tag: string): Element<S> | null;
  html(): string;
  toString(): string;

  // Attributes
  attr(key: string, value: any): this;
  /** @deprecated Use {@link attr}. */
  attribute(key: string, value: any): this;
  id(value?: string): this;
  setAttrs(obj: Record<string, any>): this;
  data(obj: Record<string, string | number>): this;
  aria(obj: Record<string, string>): this;

  // Attribute shortcuts
  href(url: string): this;
  src(url: string): this;
  type(t: string): this;
  placeholder(t: string): this;
  value(v: string | number): this;
  name(n: string): this;
  role(r: string): this;
  for(id: string): this;
  title(t: string): this;
  tabindex(n: number | string): this;
  action(url: string): this;
  method(m: string): this;
  target(t: string): this;
  rel(r: string): this;
  alt(a: string): this;
  width(w: string | number): this;
  height(h: string | number): this;
  min(v: string | number): this;
  max(v: string | number): this;
  step(v: string | number): this;
  pattern(p: string): this;
  required(v?: boolean): this;
  readonly(v?: boolean): this;
  autofocus(v?: boolean): this;
  autocomplete(v?: string): this;
  multiple(v?: boolean): this;
  checked(v?: boolean): this;
  selected(v?: boolean): this;
  disabled(v?: boolean): this;
  hidden(v?: boolean): this;
  contentEditable(v?: boolean): this;
  draggable(v?: boolean): this;

  // CSS / Classes
  css(rules: CSSRules): this;
  style(prop: CSSRules): this;
  style(prop: string, value: string | number): this;
  addClass(...names: string[]): this;
  removeClass(...names: string[]): this;
  /**
   * Adds `name` when `condition` is true, removes it when false.
   * **The condition comes first** — `toggleClass(true, 'active')`.
   */
  toggleClass(condition: boolean, name: string): this;
  /**
   * Adds `trueClass` when `condition` holds, otherwise `falseClass` if given.
   * The condition comes first.
   */
  classIf(condition: boolean, trueClass: string, falseClass?: string): this;
  classMap(map: Record<string, boolean>): this;
  hasClass(name: string): boolean;

  // CSS pseudo-class & responsive
  hover(rules: CSSRules): this;
  focusCss(rules: CSSRules): this;
  active(rules: CSSRules): this;
  firstChild(rules: CSSRules): this;
  lastChild(rules: CSSRules): this;
  nthChild(n: string | number, rules: CSSRules): this;
  pseudo(which: 'before' | 'after' | string, rules: CSSRules): this;
  media(query: string, rules: CSSRules): this;
  transition(props: string | TransitionOptions): this;
  transform(value: string): this;
  animate(keyframeName: string, options?: {
    duration?: string;
    timing?: string;
    delay?: string;
    iterations?: string | number;
    direction?: string;
    fillMode?: string;
  }): this;

  // CSS property shorthands
  opacity(n: number | string): this;
  zIndex(n: number | string): this;
  cursor(type: string): this;
  overflow(value: string): this;
  display(value: string): this;
  position(value: string): this;
  size(w: string, h?: string): this;

  // Form validation attributes
  minLength(n: number): this;
  maxLength(n: number): this;
  accept(types: string): this;
  rows(n: number): this;
  cols(n: number): this;

  // Visibility / state toggles
  show(): this;
  hide(): this;
  enable(): this;
  disable(): this;
  focus(): this;

  // Slots
  /**
   * Marks this element as a named insertion point for `fillSlot()`.
   */
  slot(name?: string): this;
  /**
   * Populates a slot previously declared with `slot(name)`.
   */
  fillSlot(name: string, contentFn: (slotEl: Element<S>) => void): this;

  // Portal
  /**
   * Renders this element into the container with `targetId` at runtime rather
   * than at its position in the tree.
   */
  portal(targetId: string): this;

  // State & events
  bind<K extends StateKey<S>, C = any>(stateKey: K, templateFn?: (val: StateValue<S, K>, state: S, context: C) => any, context?: C): Element<S>;
  bindShow<K extends StateKey<S>, C = any>(stateKey: K, fn?: (val: StateValue<S, K>, state: S, context: C) => boolean | any, context?: C): Element<S>;
  showWhen<K extends StateKey<S>>(stateKey: K, expectedValue: StateValue<S, K>): Element<S>;
  bindClass<K extends StateKey<S>, C = any>(stateKey: K, fn: (val: StateValue<S, K>, state: S, context: C) => string, context?: C): Element<S>;
  classWhen<K extends StateKey<S>>(stateKey: K, expectedValue: StateValue<S, K>, className: string): Element<S>;
  bindAttr<K extends StateKey<S>, C = any>(stateKey: K, attrName: string, fn?: (val: StateValue<S, K>, state: S, context: C) => string | null | false, context?: C): Element<S>;
  bindStyle<K extends StateKey<S>, C = any>(stateKey: K, fn: (val: StateValue<S, K>, state: S, context: C) => Record<string, string>, context?: C): Element<S>;
  /**
   * Reactively assign a DOM property.
   *
   * Only the properties in `BindableProp` are accepted. `innerHTML`, `outerHTML`
   * and `srcdoc` parse their value as HTML and are refused outright; anything
   * outside the list is refused too, rather than guessed at. The six URL
   * properties are compiled with the same scheme guard a rendered `href` gets.
   * A refused binding is recorded and reported by `validate()`, and emits no
   * client code.
   */
  bindProp<K extends StateKey<S>, C = any>(stateKey: K, prop: BindableProp, fn?: (val: StateValue<S, K>, state: S, context: C) => any, context?: C): Element<S>;
  bindInput<K extends StateKey<S>>(stateKey: K): Element<S>;
  state(value: any): this;
  /**
   * Derives this element's text from `State`. The callback takes **no
   * arguments** — read state through the `State` global — and re-runs when the
   * keys it reads change.
   */
  computed(fn: () => any): this;
  on<C = any>(event: string, fn: ClientEventHandler<Event, C, S>, context?: C, options?: EventOptions): Element<S>;
  bindState<C = any>(target: Element<S>, event: string, fn: ClientEventHandler<Event, C, S>, context?: C): Element<S>;
  setStateOnClick<K extends StateKey<S>>(stateKey: K, value: StateValue<S, K>): Element<S>;
  onMount(fn: (this: HTMLElement, state: S) => void | (() => void)): Element<S>;
  onUpdate<K extends StateKey<S>>(stateKey: K, fn: (this: HTMLElement, value: StateValue<S, K>, state: S) => void): Element<S>;
  onDestroy(fn: (this: HTMLElement, state: S) => void): Element<S>;

  // Event shorthands
  onClick<C = any>(fn: ClientEventHandler<MouseEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onChange<C = any>(fn: ClientEventHandler<Event, C, S>, context?: C, options?: EventOptions): Element<S>;
  onInput<C = any>(fn: ClientEventHandler<InputEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onSubmit<C = any>(fn: ClientEventHandler<SubmitEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onKeydown<C = any>(fn: ClientEventHandler<KeyboardEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onKeyup<C = any>(fn: ClientEventHandler<KeyboardEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onKeypress<C = any>(fn: ClientEventHandler<KeyboardEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onFocus<C = any>(fn: ClientEventHandler<FocusEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onBlur<C = any>(fn: ClientEventHandler<FocusEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onMouseenter<C = any>(fn: ClientEventHandler<MouseEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onMouseleave<C = any>(fn: ClientEventHandler<MouseEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onMousedown<C = any>(fn: ClientEventHandler<MouseEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onMouseup<C = any>(fn: ClientEventHandler<MouseEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onMousemove<C = any>(fn: ClientEventHandler<MouseEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onDblclick<C = any>(fn: ClientEventHandler<MouseEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onContextmenu<C = any>(fn: ClientEventHandler<MouseEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onScroll<C = any>(fn: ClientEventHandler<Event, C, S>, context?: C, options?: EventOptions): Element<S>;
  onLoad<C = any>(fn: ClientEventHandler<Event, C, S>, context?: C, options?: EventOptions): Element<S>;
  onError<C = any>(fn: ClientEventHandler<Event, C, S>, context?: C, options?: EventOptions): Element<S>;
  onDragstart<C = any>(fn: ClientEventHandler<DragEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onDragend<C = any>(fn: ClientEventHandler<DragEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onDragover<C = any>(fn: ClientEventHandler<DragEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onDrop<C = any>(fn: ClientEventHandler<DragEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onTouchstart<C = any>(fn: ClientEventHandler<TouchEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onTouchend<C = any>(fn: ClientEventHandler<TouchEvent, C, S>, context?: C, options?: EventOptions): Element<S>;
  onTouchmove<C = any>(fn: ClientEventHandler<TouchEvent, C, S>, context?: C, options?: EventOptions): Element<S>;

  // Tree manipulation
  replaceWith(other: Element<S>): Element<S>;
  prependChild(child: Element<S> | string): this;
  insertAt(index: number, child: Element<S> | string): this;
  childCount(): number;
  parent(): Element<S> | null;
  index(): number;
  siblings(): Element<S>[];
  nextSibling(): Element<S> | null;
  prevSibling(): Element<S> | null;
  isVoid(): boolean;
  tooltip(text: string): this;

  // Component system
  /**
   * Builds a component previously registered with `components.register()`.
   *
   * The third argument is an **overrides object** — `overrides.tag` replaces the
   * tag the component was registered with. It is not children.
   */
  component(name: string, props?: Record<string, any>, overrides?: ComponentOptions): Element<S>;
  /**
   * Builds an inline component without registering it.
   *
   * The third argument is the **wrapper tag name** (default `'div'`), not children.
   */
  use<TProps = Record<string, any>>(fn: ComponentFn<TProps>, props?: TProps, tag?: string): Element<S>;

  // SPA compilation
  /**
   * Renders an array from state and keeps it in sync in the browser.
   *
   * `itemFn` returns a **node definition object** (`{ tag, text, class, ... }`),
   * not an Element. `filter` and `sort` also run during server rendering, and
   * `filterKeys` lists extra state keys that should trigger a re-render.
   */
  liveList<K extends StateKey<S>>(stateKey: K, itemFn: (item: ArrayItem<S[K]>, index: number) => NodeDef, options?: LiveListOptions<S, ArrayItem<S[K]>>): Element<S>;

  // Fragment rendering
  /**
   * Renders this subtree on its own.
   *
   * Returns `{ html, css }` — **not a string**. Static markup and CSS only:
   * events, state bindings, and lifecycle hooks on the subtree are dropped,
   * because a fragment has no page to attach them to.
   */
  renderFragment(): Fragment;

  // SharedShortcuts implementations (see interface above)
  div(content?: ElementContent<S>): Element<S>;
  span(content?: ElementContent<S>): Element<S>;
  section(content?: ElementContent<S>): Element<S>;
  header(content?: ElementContent<S>): Element<S>;
  footer(content?: ElementContent<S>): Element<S>;
  main(content?: ElementContent<S>): Element<S>;
  nav(content?: ElementContent<S>): Element<S>;
  article(content?: ElementContent<S>): Element<S>;
  aside(content?: ElementContent<S>): Element<S>;
  form(content?: ElementContent<S>): Element<S>;
  ul(content?: ElementContent<S>): Element<S>;
  ol(content?: ElementContent<S>): Element<S>;
  table(content?: ElementContent<S>): Element<S>;
  thead(content?: ElementContent<S>): Element<S>;
  tbody(content?: ElementContent<S>): Element<S>;
  tfoot(content?: ElementContent<S>): Element<S>;
  tr(content?: ElementContent<S>): Element<S>;
  details(content?: ElementContent<S>): Element<S>;
  summary(content?: ElementContent<S>): Element<S>;
  dialog(content?: ElementContent<S>): Element<S>;
  pre(content?: ElementContent<S>): Element<S>;
  code(content?: ElementContent<S>): Element<S>;
  blockquote(content?: ElementContent<S>): Element<S>;
  h1(content?: ElementContent<S>): Element<S>;
  h2(content?: ElementContent<S>): Element<S>;
  h3(content?: ElementContent<S>): Element<S>;
  h4(content?: ElementContent<S>): Element<S>;
  h5(content?: ElementContent<S>): Element<S>;
  h6(content?: ElementContent<S>): Element<S>;
  li(content?: ElementContent<S>): Element<S>;
  th(content?: ElementContent<S>): Element<S>;
  td(content?: ElementContent<S>): Element<S>;
  p(content?: ElementContent<S>): Element<S>;
  strong(content?: ElementContent<S>): Element<S>;
  small(content?: ElementContent<S>): Element<S>;
  label(content?: ElementContent<S>): Element<S>;
  caption(content?: ElementContent<S>): Element<S>;
  legend(content?: ElementContent<S>): Element<S>;
  em(content?: ElementContent<S>): Element<S>;
  b(content?: ElementContent<S>): Element<S>;
  i(content?: ElementContent<S>): Element<S>;
  img(src: string, alt?: string): Element<S>;
  a(href: string, text?: string): Element<S>;
  button(text?: string): Element<S>;
  input(type?: string, attrs?: Record<string, any>): Element<S>;
  textarea(attrs?: Record<string, any>): Element<S>;
  /**
   * Builds a `<select>`.
   *
   * An option may be an object (`{ value, text?, selected?, disabled? }`) or a
   * plain string or number, which becomes both the value and the label.
   * Nullish entries are skipped.
   */
  select(options?: Array<SelectOption | string | number>, attrs?: Record<string, any>): Element<S>;
  br(): this;
  hr(): Element<S>;
  formGroup(label: string, inputType?: string, inputAttrs?: Record<string, any>): Element<S>;
  /**
   * Builds a labelled form control, wiring `label[for]` to a generated input id.
   *
   * Returns `{ group, label, input }` so each part can be configured.
   */
  field(label: string, options?: FieldOptions<S>): FieldResult<S>;
  /**
   * Builds a checkbox with its label. Returns the **wrapper** element.
   */
  checkbox(name: string, label: string, checked?: boolean): Element<S>;
  /**
   * Builds a group of radio inputs with labels. Returns the **wrapper** element.
   */
  radio(name: string, options?: RadioOption[]): Element<S>;
  fieldset(legend?: string, setupFn?: (fs: Element<S>) => void): Element<S>;
  hiddenInput(name: string, value: string): Element<S>;
  grid(columns: number | string, items?: Array<((el: Element<S>) => void) | Element<S> | string>, gap?: string): Element<S>;
  flex(items?: Array<((el: Element<S>) => void) | Element<S> | string>, options?: {
    direction?: string;
    gap?: string;
    align?: string;
    justify?: string;
    wrap?: string;
  }): Element<S>;
  stack(items?: Array<((el: Element<S>) => void) | Element<S> | string>, gap?: string): Element<S>;
  row(items?: Array<((el: Element<S>) => void) | Element<S> | string>, gap?: string): Element<S>;
  center(childFn?: (el: Element<S>) => void): Element<S>;
  container(childFn?: (el: Element<S>) => void, maxWidth?: string): Element<S>;
  spacer(height?: string): Element<S>;
  divider(options?: { color?: string; margin?: string }): Element<S>;
  columns(count: number, columnFns?: Array<(col: Element<S>) => void>, gap?: string): Element<S>;
  /**
   * Builds a list with one `<li>` per item, `<ul>` by default.
   *
   * Pass `tag` to change the container — `list(items, null, 'ol')`. Note that
   * the `ol()` shortcut takes text, not an array.
   */
  list<T>(items: T[], renderer?: (li: Element<S>, item: T, index: number) => void, tag?: string): Element<S>;
  /** Rows may be arrays (positional cells) or objects (keyed by `headers`, or by `autoHeaders` from the first row). */
  dataTable(headers: string[] | null, rows: Array<any[] | Record<string, any>>, options?: { class?: string; autoHeaders?: boolean }): Element<S>;
  each<T>(items: T[], fn: (self: Element<S>, item: T, index: number) => void): this;
  when(condition: boolean | any, fn: (self: Element<S>) => void): this;
}

// ─── Document ────────────────────────────────────────────────────────────────

export interface DocumentOptions {
  cache?: boolean;
  cacheKey?: string;
  nonce?: string;
  lang?: string;
  /** Set to false to skip the viewport meta tag added by page(). Default: true */
  viewport?: boolean;
  /** Set to false to skip the CSS reset added by page(). Default: true */
  resetCss?: boolean;
}

export interface BindDescriptor {
  key: string;
  type?: 'show' | 'class' | 'attr' | 'style' | 'prop';
  fn?: (val: any) => any;
  /** Attribute name — required when type is 'attr' */
  attr?: string;
  /** Alias for attr */
  attrName?: string;
  /** Property name — required when type is 'prop' */
  prop?: string;
}

export interface LiveListNodeDef {
  stateKey: string;
  itemFn: (item: any, index: number) => NodeDef;
  filter?: (item: any, state: Record<string, any>) => boolean;
  filterKeys?: string[];
  sort?: (a: any, b: any, state: Record<string, any>) => number;
  sortKeys?: string[];
  empty?: NodeDef | string;
}

export interface NodeDef {
  tag?: string;
  text?: string | number;
  html?: string;
  id?: string;
  class?: string | string[];
  style?: CSSRules;
  attrs?: Record<string, any>;
  data?: Record<string, string | number>;
  aria?: Record<string, string>;
  css?: CSSRules;
  on?: Record<string, (e: Event) => void>;
  onMount?: (this: HTMLElement, state: Record<string, any>) => void | (() => void);
  onUpdate?: {
    key: string;
    fn: (this: HTMLElement, value: any, state: Record<string, any>) => void;
  } | Array<{
    key: string;
    fn: (this: HTMLElement, value: any, state: Record<string, any>) => void;
  }>;
  onDestroy?: (this: HTMLElement, state: Record<string, any>) => void;
  bind?: BindDescriptor | BindDescriptor[];
  liveList?: LiveListNodeDef;
  children?: NodeDef[];
  component?: string;
  use?: ComponentFn;
  props?: Record<string, any>;
  if?: boolean | any;
  each?: any[];
  itemTemplate?: (item: any, index: number) => NodeDef;
  state?: any;
  setup?: (el: Element) => void;
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
  links?: string[];
  scripts?: string[];
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

export declare class Document<S extends StateShape = StateShape> implements SharedShortcuts<Document<S>, S> {
  body: Array<Element<S> | string>;
  head: Head;

  constructor(options?: DocumentOptions);

  // HTML & BODY attributes
  lang(l: string): this;
  htmlAttr(key: string, value: string): this;
  bodyId(id: string): this;
  bodyClass(...names: string[]): this;
  bodyAttr(key: string, value: string): this;
  bodyCss(rules: CSSRules): this;

  // Head shortcuts
  title(t: string): this;
  addMeta(attrs: MetaAttrs): this;
  addLink(href: string): this;
  addStyle(css: string): this;
  addScript(src: string): this;
  meta(name: string, content: string): this;
  viewport(v?: string): this;
  charset(c?: string): this;
  favicon(href: string, type?: string): this;
  rawHead(html: string): this;
  inlineScript(code: string): this;
  inlineStyle(css: string): this;
  preload(href: string, as: string, type?: string): this;
  prefetch(href: string): this;
  preconnect(href: string): this;
  canonical(url: string): this;
  ogTags(og: Record<string, string>): this;
  twitterCard(tc: Record<string, string>): this;
  jsonLd(schema: object): this;
  noindex(nofollow?: boolean): this;

  // Global CSS
  globalCss(selector: string, rules: CSSRules): this;
  sharedClass(name: string, rules: CSSRules): this;
  /** @deprecated Use {@link globalCss}. */
  globalStyle(selector: string, rules: CSSRules): this;
  /**
   * @deprecated Use {@link sharedClass} for a class name, or {@link globalCss}
   * for a raw selector. `defineClass(name, rules)` is `sharedClass(name, rules)`;
   * `defineClass(sel, rules, true)` is `globalCss(sel, rules)`.
   */
  defineClass(selector: string, rules: CSSRules, isRawSelector?: boolean): this;
  resetCss(): this;

  // CSS features
  keyframes(name: string, frames: Record<string, CSSRules>): this;
  mediaQuery(query: string, selectorRules: Record<string, CSSRules>): this;
  cssVar(name: string, value: string | number): this;
  cssVars(obj: Record<string, string | number>): this;
  darkMode(selectorRules: Record<string, CSSRules>): this;
  print(selectorRules: Record<string, CSSRules>): this;

  // State
  state<K extends StateKey<S>>(key: K, value: StateValue<S, K>): Document<S>;
  states(obj: S): Document<S>;

  // Lifecycle
  /**
   * Runs once in the browser after the page is ready.
   *
   * The callback is invoked with **no arguments**; reach state through the
   * `State` global. May return a promise, whose rejection is reported.
   */
  oncreate(fn: () => void | Promise<void>): this;

  // Element creation
  create(tag: string): Element<S>;
  /** @deprecated Use {@link create}. */
  createElement(tag: string): Element<S>;
  /** @deprecated Use {@link create}. `Element.child()` is unaffected. */
  child(tag: string): Element<S>;

  // Component system
  /**
   * Builds a component previously registered with `components.register()`.
   *
   * The third argument is an **overrides object** — `overrides.tag` replaces the
   * tag the component was registered with. It is not children.
   */
  component(name: string, props?: Record<string, any>, overrides?: ComponentOptions): Element<S>;
  /**
   * Builds an inline component without registering it.
   *
   * The third argument is the **wrapper tag name** (default `'div'`), not children.
   */
  use<TProps = Record<string, any>>(fn: ComponentFn<TProps>, props?: TProps, tag?: string): Element<S>;
  useFragment(fn: (doc: Document<S>) => void): Document<S>;

  // Declarative builder
  build(defs: NodeDef | NodeDef[]): this;

  // SPA compilation
  /**
   * Renders an array from state and keeps it in sync in the browser.
   *
   * `itemFn` returns a **node definition object** (`{ tag, text, class, ... }`),
   * not an Element. `filter` and `sort` also run during server rendering, and
   * `filterKeys` lists extra state keys that should trigger a re-render.
   */
  liveList<K extends StateKey<S>>(stateKey: K, itemFn: (item: ArrayItem<S[K]>, index: number) => NodeDef, options?: LiveListOptions<S, ArrayItem<S[K]>>): Element<S>;
  hashRouter(options?: HashRouterOptions<S>): Document<S>;
  historyRouter(options?: HistoryRouterOptions<S>): Document<S>;
  views(options?: ViewsOptions<S>): Document<S>;

  // Utility APIs
  comment(text: string): this;
  raw(html: string): this;
  stamp(fragment: Fragment): this;
  group(fn: (doc: Document<S>) => void): this;
  template(name: string, fn: (doc: Document<S>, vars: Record<string, any>) => void): this;
  useTemplate(name: string, vars?: Record<string, any>): this;
  isEmpty(): boolean;
  elementCount(): number;
  /**
   * Inspects the document and returns `{ valid, errors, warnings }`.
   *
   * Call it **before** `render()`, which clears the body. Reports duplicate ids,
   * accessibility problems, undeclared state keys, and `W_CALLBACK_CAPTURE` for
   * callbacks referencing variables the browser will not have.
   */
  validate(): ValidationResult;

  // JSON import / export
  fromJSON(def: PageDef): this;
  toJSON(): object;

  // Rendering
  /**
   * Renders the complete HTML document.
   *
   * **Consumes the document**: clears the body and releases pooled elements, so
   * call it once and build a fresh document per request.
   */
  render(): string;
  renderStream(): import('stream').Readable;
  /**
   * Returns the **most recent** render.
   *
   * Does not render on its own, so this is `''` until `render()` or `save()`
   * has run.
   */
  output(): string;
  /**
   * Writes the page to `path`, rendering first if it has not been rendered.
   */
  save(path: string): this;
  clear(): void;

  // SharedShortcuts implementations
  div(content?: ElementContent<S>): Element<S>;
  span(content?: ElementContent<S>): Element<S>;
  section(content?: ElementContent<S>): Element<S>;
  header(content?: ElementContent<S>): Element<S>;
  footer(content?: ElementContent<S>): Element<S>;
  main(content?: ElementContent<S>): Element<S>;
  nav(content?: ElementContent<S>): Element<S>;
  article(content?: ElementContent<S>): Element<S>;
  aside(content?: ElementContent<S>): Element<S>;
  form(content?: ElementContent<S>): Element<S>;
  ul(content?: ElementContent<S>): Element<S>;
  ol(content?: ElementContent<S>): Element<S>;
  table(content?: ElementContent<S>): Element<S>;
  thead(content?: ElementContent<S>): Element<S>;
  tbody(content?: ElementContent<S>): Element<S>;
  tfoot(content?: ElementContent<S>): Element<S>;
  tr(content?: ElementContent<S>): Element<S>;
  details(content?: ElementContent<S>): Element<S>;
  summary(content?: ElementContent<S>): Element<S>;
  dialog(content?: ElementContent<S>): Element<S>;
  pre(content?: ElementContent<S>): Element<S>;
  code(content?: ElementContent<S>): Element<S>;
  blockquote(content?: ElementContent<S>): Element<S>;
  h1(content?: ElementContent<S>): Element<S>;
  h2(content?: ElementContent<S>): Element<S>;
  h3(content?: ElementContent<S>): Element<S>;
  h4(content?: ElementContent<S>): Element<S>;
  h5(content?: ElementContent<S>): Element<S>;
  h6(content?: ElementContent<S>): Element<S>;
  li(content?: ElementContent<S>): Element<S>;
  th(content?: ElementContent<S>): Element<S>;
  td(content?: ElementContent<S>): Element<S>;
  p(content?: ElementContent<S>): Element<S>;
  strong(content?: ElementContent<S>): Element<S>;
  small(content?: ElementContent<S>): Element<S>;
  label(content?: ElementContent<S>): Element<S>;
  caption(content?: ElementContent<S>): Element<S>;
  legend(content?: ElementContent<S>): Element<S>;
  em(content?: ElementContent<S>): Element<S>;
  b(content?: ElementContent<S>): Element<S>;
  i(content?: ElementContent<S>): Element<S>;
  img(src: string, alt?: string): Element<S>;
  a(href: string, text?: string): Element<S>;
  button(text?: string): Element<S>;
  input(type?: string, attrs?: Record<string, any>): Element<S>;
  textarea(attrs?: Record<string, any>): Element<S>;
  /**
   * Builds a `<select>`.
   *
   * An option may be an object (`{ value, text?, selected?, disabled? }`) or a
   * plain string or number, which becomes both the value and the label.
   * Nullish entries are skipped.
   */
  select(options?: Array<SelectOption | string | number>, attrs?: Record<string, any>): Element<S>;
  br(): this;
  hr(): Element<S>;
  formGroup(label: string, inputType?: string, inputAttrs?: Record<string, any>): Element<S>;
  /**
   * Builds a labelled form control, wiring `label[for]` to a generated input id.
   *
   * Returns `{ group, label, input }` so each part can be configured.
   */
  field(label: string, options?: FieldOptions<S>): FieldResult<S>;
  /**
   * Builds a checkbox with its label. Returns the **wrapper** element.
   */
  checkbox(name: string, label: string, checked?: boolean): Element<S>;
  /**
   * Builds a group of radio inputs with labels. Returns the **wrapper** element.
   */
  radio(name: string, options?: RadioOption[]): Element<S>;
  fieldset(legend?: string, setupFn?: (fs: Element<S>) => void): Element<S>;
  hiddenInput(name: string, value: string): Element<S>;
  grid(columns: number | string, items?: Array<((el: Element<S>) => void) | Element<S> | string>, gap?: string): Element<S>;
  flex(items?: Array<((el: Element<S>) => void) | Element<S> | string>, options?: {
    direction?: string;
    gap?: string;
    align?: string;
    justify?: string;
    wrap?: string;
  }): Element<S>;
  stack(items?: Array<((el: Element<S>) => void) | Element<S> | string>, gap?: string): Element<S>;
  row(items?: Array<((el: Element<S>) => void) | Element<S> | string>, gap?: string): Element<S>;
  center(childFn?: (el: Element<S>) => void): Element<S>;
  container(childFn?: (el: Element<S>) => void, maxWidth?: string): Element<S>;
  spacer(height?: string): Element<S>;
  divider(options?: { color?: string; margin?: string }): Element<S>;
  columns(count: number, columnFns?: Array<(col: Element<S>) => void>, gap?: string): Element<S>;
  /**
   * Builds a list with one `<li>` per item, `<ul>` by default.
   *
   * Pass `tag` to change the container — `list(items, null, 'ol')`. Note that
   * the `ol()` shortcut takes text, not an array.
   */
  list<T>(items: T[], renderer?: (li: Element<S>, item: T, index: number) => void, tag?: string): Element<S>;
  /** Rows may be arrays (positional cells) or objects (keyed by `headers`, or by `autoHeaders` from the first row). */
  dataTable(headers: string[] | null, rows: Array<any[] | Record<string, any>>, options?: { class?: string; autoHeaders?: boolean }): Element<S>;
  each<T>(items: T[], fn: (self: Document<S>, item: T, index: number) => void): this;
  when(condition: boolean | any, fn: (self: Document<S>) => void): this;
}

// ─── Template Engine ──────────────────────────────────────────────────────────

export interface TemplateEngineOptions {
  viewsDir?: string;
  extension?: string;
  cache?: boolean;
}

export type TemplateAttributeValue = string | boolean;

export interface TemplateHeadNode {
  title: string | null;
  metas: Array<Record<string, TemplateAttributeValue>>;
  links: string[];
  scripts: string[];
  viewport: boolean;
}

export type TemplateGlobalNode =
  | { type: 'reset' }
  | { type: 'globalStyle'; selector: string; css: CSSRules }
  | { type: 'sharedClass'; name: string; css: CSSRules };

export interface TemplateElementNode {
  type: 'element';
  tag: string;
  id: string | null;
  classes: string[];
  attrs: Record<string, TemplateAttributeValue>;
  css: CSSRules;
  text: string | null;
  rawHtml: string | null;
  events: Record<string, TemplateAttributeValue>;
  bind: TemplateAttributeValue | null;
  bindFn: TemplateAttributeValue | null;
  dataAttrs: Record<string, TemplateAttributeValue>;
  children: TemplateNode[];
}

export interface TemplateComponentNode {
  type: 'component';
  name: string | null;
  props: Record<string, TemplateAttributeValue>;
  children: TemplateNode[];
}

export interface TemplateConditionalNode {
  type: 'conditional';
  condition: string;
  trueBranch: TemplateNode[];
  falseBranch: TemplateNode[];
}

export interface TemplateLoopNode {
  type: 'loop';
  itemVar: string;
  indexVar: string | null;
  source: string;
  children: TemplateNode[];
}

export interface TemplateErrorNode {
  type: 'error';
  message: string;
}

export type TemplateNode =
  | TemplateElementNode
  | TemplateComponentNode
  | TemplateConditionalNode
  | TemplateLoopNode
  | TemplateErrorNode;

export interface TemplateAST {
  type: 'document';
  head: TemplateHeadNode | null;
  globals: Array<TemplateGlobalNode | null>;
  body: TemplateNode[];
}

export declare class TemplateParser {
  constructor(options?: TemplateEngineOptions);
  parse(source: string, variables?: Record<string, any>): TemplateAST;
  compile(source: string, variables?: Record<string, any>): Document;
}

export declare function parseTemplate(source: string, variables?: Record<string, any>): TemplateAST;
export declare function renderTemplate(source: string, variables?: Record<string, any>): string;
export declare function compileTemplate(source: string, variables?: Record<string, any>): Document;
export declare function renderFile(filePath: string, variables?: Record<string, any>): string;
export declare function compileFile(filePath: string, variables?: Record<string, any>): Document;
export declare function templateEngine(
  filePath: string,
  options: Record<string, any>,
  callback: (err: Error | null, html?: string) => void
): void;

// ─── Middleware ───────────────────────────────────────────────────────────────

export interface MiddlewareOptions {
  /** Per-response CSP nonce. Nonce-enabled rendering bypasses the rendered HTML cache. */
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

// ─── SPA Compilation ─────────────────────────────────────────────────────────

export interface LiveListOptions<S extends StateShape = StateShape, Item = any> {
  /** Client-side filter: (item, State) => boolean. Also applied server-side for initial render. */
  filter?: (item: Item, state: S) => boolean;
  /** Extra state keys that trigger a re-render when they change (e.g. ['view']). */
  filterKeys?: StateKey<S>[];
  /** Client-side ordering, also applied during server rendering. */
  sort?: (a: Item, b: Item, state: S) => number;
  /** Extra state keys that change the ordering. */
  sortKeys?: StateKey<S>[];
  /** Declarative content rendered when filtering leaves no items. */
  empty?: NodeDef | string;
}

export interface HashRouterOptions<S extends StateShape = StateShape> {
  /** State key to update on hash change (default: 'view'). */
  stateKey?: StateKey<S>;
  /** Hash value used when location.hash is empty (default: 'all'). */
  default?: string;
  /** Optional route patterns mapped to state values (e.g. { 'users/:id': 'user', '*': 'not-found' }). */
  routes?: Record<string, string>;
  /** State key populated with named route parameters (default: 'routeParams'). */
  paramsKey?: StateKey<S>;
  /** State value used when no route pattern matches and no '*' route exists (default: 'not-found'). */
  notFound?: string;
  /** CSS selector for nav links to highlight (e.g. 'header a'). */
  navSelector?: string;
  /** Inline styles applied to the active nav link. */
  activeStyle?: Record<string, string>;
  /** Inline styles applied to inactive nav links. */
  inactiveStyle?: Record<string, string>;
}

export interface HistoryRouterOptions<S extends StateShape = StateShape> extends HashRouterOptions<S> {
  /** Path used when the application path is empty after removing base (default: '/'). */
  default?: string;
  /** Path prefix removed before route matching (default: '/'). */
  base?: string;
  /** Selector for same-origin links handled without a page reload (default: 'a[data-route]'). */
  linkSelector?: string;
}

export interface ViewsOptionsBase {
  /** Selector for navigation controls (default: '[data-view-nav]'). */
  navigation?: string;
  /** Alias for navigation. */
  navSelector?: string;
  /** Selector for view containers (default: '[data-view]'). */
  viewSelector?: string;
  /** Class toggled on the active navigation control (default: 'active'). */
  activeClass?: string;
}

export type ViewsOptions<S extends StateShape = StateShape> = {
  [K in StateKey<S>]: ViewsOptionsBase & {
    /** Reactive state key used for the active view (default: 'activeView'). */
    stateKey?: K;
    /** Initial state value when the key has not already been declared (default: 'default'). */
    default?: S[K];
  }
}[StateKey<S>];

export declare function compileLiveList(
  doc: Document,
  parent: Document | Element,
  stateKey: string,
  itemFn: (item: any, index: number) => NodeDef,
  options?: LiveListOptions
): Element;

export declare function compileHashRouter(doc: Document, options?: HashRouterOptions): Document;
export declare function compileHistoryRouter(doc: Document, options?: HistoryRouterOptions): Document;
export declare function compileViews(doc: Document, options?: ViewsOptions): Document;

// ─── Top-level helpers ────────────────────────────────────────────────────────

export declare function page<S extends StateShape = StateShape>(title: string, options?: DocumentOptions): Document<S>;

export declare function renderFromJSON(def: PageDef, setup?: ((doc: Document) => void) | DocumentOptions, options?: DocumentOptions): string;

/** Alias for renderFromJSON */
export declare const renderJSON: typeof renderFromJSON;

export declare function resetPools(): void;

export interface ResponseCache {
  readonly limit: number;
  readonly size: number;
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): boolean;
  clear(): void;
  has(key: string): boolean;
}

export declare const responseCache: ResponseCache;

// ─── The browser-side State global ────────────────────────────────────────────

/**
 * Shape of the `State` global inside serialized callbacks.
 *
 * It is intentionally open so any key declared with `doc.states()` resolves.
 * To get real key completion, merge your own keys into it from your project:
 *
 *     declare module '@trebor/buildhtml' {
 *       interface BuildHtmlState {
 *         count: number;
 *         user: { name: string };
 *       }
 *     }
 */
export interface BuildHtmlState {
  [key: string]: any;
}

declare global {
  /**
   * The reactive state proxy, available inside event handlers, computed
   * bindings, lifecycle hooks, `liveList` item functions, and `oncreate`.
   *
   * It exists only in the browser: these callbacks are serialized as source
   * text and run on the page, so `State` is not defined on the server. Assigning
   * to a key updates every binding watching it.
   *
   * Handlers that receive a typed `state` argument should prefer that argument —
   * it carries the document's declared state shape, while this global is open.
   */
  const State: BuildHtmlState;
}
