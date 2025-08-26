/**
 * PWAxcode
 * First release: 26/08/2025
 * A lightweight, customizable code viewer and player with syntax highlighting,
 * folding, typing simulation, and UI controls.
 *
 * Author: PWAx.dev
 * Homepage: https://pwax.dev
 * License: MIT
 * 
 * Features:
 *  - Syntax highlighting for JS, JSON, HTML, CSS, SQL,...
 *  - Line numbers, folding, ruler, auto-indent
 *  - Playable sequences (step-by-step code reveal)
 *  - Copy, download, fullscreen, floatbar, toolbar
 *  - i18n support (EN, IT, extendable)
 */

class PWAxcode {
  constructor(root, opts = {}) {
    // Validate and initialize the root element (must be a valid HTMLElement).
    if (!root || root.nodeType !== 1) {
      throw new Error('PWAxcode: root element is required (HTMLElement or valid selector result)');
    }
    // Avoid duplicate initialization: if instance already exists, return it
    if (root.pwaxcode) {
      return root.pwaxcode; 
    }
    if (root.dataset.pwaxcodeInit === '1' && root.pwaxcode) {
      return root.pwaxcode;
    }
    // Mark element as initialized and attach reference
    root.dataset.pwaxcodeInit = '1';
    this.root = root;
    // Version string (for debugging, reporting, compatibility checks)
    this._version="PWAxCode v1.1.2b";
    
    // Options
    this.opts = Object.assign({
      bare: false,                       // If true, ignore header/footer and use root as body
      height: null,                      // (string|number|null = null) Fixed height of the code area (e.g. "280px", 320). Overrides maxHeight if present.
      maxHeight: null,                   // (string|number|null = null) Maximum height of the scrollable area (e.g. "50vh", 480).
      toolbarVisible: true,              // Toolbar visible
      footerControls: [],                // e.g.: ['prev','next','zoomOut','resetZoom','zoomIn','hl','fullscreen']
      footerAlign: 'between',            // Horizontal alignment of controls in footer: 'start' | 'center' | 'between' | 'end'
      wrap: false,                       // Automatic line wrapping (soft wrap)
      haptics: 'auto',                   // Haptic vibration on key events (mobile). 'off' to disable
      historyLimit: 100,                 // Undo stack size
      tabSize: 2,                        // Tab size
      tabs: 'both',                      // Tab policy: 'both': expands TABs in both view and copied text | 'view': expands only in view; copies original text | 'none': no expansion (keeps \t both in view and copy)
      showTokens: false,                 // Show tokens
      autoIndent: true,                  // Auto-indent code
      copyToastMs: 1300,                 // Toast duration
      toastPosition: 'top',              // Toast position: 'top' | 'bottom'
      toastMax: 3,                       // Max number of visible toasts in stack
      highlight: false,                  // Highlight code
      lang: 'auto',                      // Language for detection/tokenization. 'auto' tries to detect it.
      fade: true,                        // Enable top/bottom fades when content is scrollable
      theme: 'dark',                     // Default theme: 'dark' | 'light' | 'auto' | 'custom-name'
      fullscreen: true,                  // Show fullscreen button
      compressed: false,                 // Start in “compressed” state (only title visible)
      markSpec: '',                      // Initial line highlights (1-based), e.g. "3,7-9,15"
      dedent: true,                      // Remove common indent from all lines (before rendering)
      lineNumbers: true,                 // Show line numbers
      lineNumbersStart: 1,               // Starting number for line numbering
      fontSize: 13.5,                    // Font size
      fontLineHeight: 1.6,               // Font line-height
      fontMin: 10,                       // Minimum font size
      fontMax: 24,                       // Maximum font size
      fontStep: 1,                       // Step size when changing font
      searchOffsetPx: 48,                // Vertical offset to better center search results
      toggleHighlight: true,             // Show highlight toggle button
      download: true,                    // Show download button
      filename: '',                      // Filename for download
      downloadContent: 'view',           // What to download: visual text (view) or raw original text (raw)
      typingCPS: 30,                     // Characters per second when typed=true (mobile-friendly)
      autoFormatAfterTyped: true,        // Auto-format at end of set/append/delete/cursorInsert when typed
      // Player
      playerAutoplay: false,             // Autoplay code
      playerLoop: false,                 // Loop execution
      playerButtons: true,               // Show buttons in footer (if footer exists)
      playerWaitAfterActionMs: 0,        // Small delay after each step
      playerProgress: true,              // Show progress bar in footer (if requested)
      playerShowNotes: true,             // Show step notes in footer .text-start
      playerClosePopoverOnStop: false,   // Do not close popover when finished
      playerStopHoldMs: 0,               // Delay (ms) before closing popover when finished
      // Floatbar
      floatBar: false,                   // Show/hide floating bar
      floatBarControls: ['stepPrev',     // Controls on the floating bar (same semantics as footer). CSV or array
        'play','pause','stepNext',
        'prev','next','hl','wrap',
        'fullscreen','undo','redo'],
      floatBarRemember: true,            // Remember position with localStorage
      floatBarInFullscreen: true,        // Visible also in fullscreen
      floatBarToggleInHeader: false,     // Show floatBar button in header
      // Ruler
      ruler: false,                      // Show column ruler
      rulerStyle: 'tens',                // Ruler format: 'full' | 'tens'
      rulerPosition: 'top',              // Ruler position: 'top' | 'bottom'
      // Locale
      locale: 'auto',                    // 'auto' | 'it' | 'en' | ...
      translations: null,                // Additional dictionaries fr:{...}, es:{...}
      // Events
      onCopy: null,                      // Copy event
      onSearch: null,                    // Search event
      onToggleHL: null,                  // Toggle Highlight event
      onFullscreen: null,                // Fullscreen event
      onEdit: null,                      // Edit event 
    }, opts);
    // Initialize internal event registry.
    
    this._ev = {
      copy:       new Set(),
      search:     new Set(),
      toggleHL:   new Set(),
      fullscreen: new Set(),
      edit:       new Set(),
      player:     new Set(),
    };

    // Bind user-provided callbacks (from options) to the internal event registry.
    [
      ['copy','onCopy'],
      ['search','onSearch'],
      ['toggleHL','onToggleHL'],
      ['fullscreen','onFullscreen'],
      ['edit','onEdit'],
      ['player','onPlayer']
    ].forEach(([ev, opt]) => {
      if (typeof this.opts[opt] === 'function') this._ev[ev].add(this.opts[opt]);
    });

    // INSTANCE INITIALIZATION
    // Initialize theme system (dark/light/etc.)
    this._initTheme();
    // Store initial font size for reset/zoom
    this._fontSizeInitial      = this.opts.fontSize;
    // Store initial line height
    this._fontLineHeightInitial = this.opts.fontLineHeight;
    // List of unsubscribe callbacks (for event listeners cleanup)
    this._unsubs = [];    
    // Map of scroll-related event handlers        
    this._scrollSubs = new Map();
    // Flag to ensure scroll hub is bound only once
    this._scrollHubBound = false; 
    // Lifecycle flag to mark instance as destroyed
    this._destroyed = false;
    // Generic state store for extensions
    this.state = this.state || {};
    // Undo/redo history manager
    this._hist = { undo: [], redo: [], limit: this.opts.historyLimit|0 };
    // Flag to temporarily suspend history recording
    this._suspendHistory = false;   
    // Resolve main DOM references (body, footer, header icons)
    // If bare mode is enabled → use only the root as body, no footer/icons
    this.body = root.querySelector('.container-body') || root;
    this.footer = root.querySelector('.container-footer') || null;
    this.iconHost = root.querySelector('.container-title .title-icon') || null;
    if (this.opts.bare) {
      this.body = root;
      this.footer = null;
      this.iconHost = null;
      this.root.classList.add('pxc-bare');
    } else {
      this.body = root.querySelector('.container-body');
      this.footer = root.querySelector('.container-footer');
      this.iconHost = root.querySelector('.container-title .title-icon');
    }
    // Highlighting mode: start in 'hl' or 'plain' depending on options
    this.mode = this.opts.highlight ? 'hl' : 'plain';
    // Perform full setup of the editor
    this._setup();
    this.root.pwaxcode = this;
    // Ensure the root has a unique id
    if (!this.root.id) {
      let id;
      do { id = 'pxc-' + Math.random().toString(36).slice(2,8); }
      while (document.getElementById(id));
      this.root.id = id;
    }
    
    // EDITOR RUNTIME STATE
    // Flag for async runner (typing, playback)
    this._runnerActive = false;
    // Map of foldable sections
    this._foldMap = null;     
    // Currently folded ranges   
    this._foldedRanges = [];   
    // Player state (step sequences)
    this._player = { steps: [], idx: -1, playing: false, paused: false, busy: false, vars: Object.create(null) };
    // Current focus range
    this._focus = null;      
    // Range highlights (boxes)    
    this._rangeHls = [];     
    // Sequence id for highlights
    this._hlSeq = 0;
    // DOM layer for highlights
    this._rangeLayer = null;  
    // Flag for deferred layout scheduling
    this._rangeLayoutScheduled = false;
    }  

    // STATIC PROPERTIES
    // Registered language plugins
    static _langPlugins = Object.create(null);
    // Built-in themes
    static _themes  = new Set(['dark','light','funky','relax']);
    // Theme aliases (name → canonical)
    static _aliases = new Map();
    static autoInit(selector = '.container.PWAxcode') {

    document.querySelectorAll(selector).forEach(el => {
      // Auto-initialize all editors matching the selector
      if (el.dataset.pwaxcodeInit === '1') return;
      // Build options from dataset attributes
      const tabsAttr = (el.dataset.tabs || 'both').toLowerCase();
      const opts = {
        theme: (el.dataset.theme || 'dark'),
        height: el.dataset.height || null,
        maxHeight: el.dataset.maxheight || null,
        wrap: el.dataset.wrap === 'true',
        footerControls: (el.dataset.footerControls || '').split(',').map(s => s.trim()).filter(Boolean),
        footerAlign: el.dataset.footerAlign || 'between',
        tabSize: el.dataset.tabsize ? parseInt(el.dataset.tabsize, 10) : 2,
        tabs: (tabsAttr === 'view' || tabsAttr === 'none') ? tabsAttr : 'both',
        autoIndent: el.dataset.autoindent !== 'false',
        highlight: el.dataset.highlight === 'true',
        fade: el.dataset.fade !== 'false',
        fullscreen: el.dataset.fullscreen !== 'false',
        compressed: el.dataset.compressed === 'true',
        markSpec: el.dataset.mark || '',
        lang: (el.dataset.lang || 'auto'),
        dedent: el.dataset.dedent !== 'false',
        lineNumbers: el.dataset.linenumbers !== 'false',
        lineNumbersStart: el.dataset.linenumbersStart ? parseInt(el.dataset.linenumbersStart, 10) : 1,
        toggleHighlight: el.dataset.toggleHighlight !== 'false',
        download: el.dataset.download !== 'false',
        filename: el.dataset.filename || '',
        downloadContent: (el.dataset.downloadContent || 'view').toLowerCase(),
        typingCPS: el.dataset.typingCps ? parseInt(el.dataset.typingCps, 10) : 30,
        autoFormatAfterTyped: el.dataset.autoformatAfterTyped !== 'false',
        fontSize: el.dataset.fontSize ? parseFloat(el.dataset.fontSize) : 13.5,
        fontLineHeight: 1.6, 
        fontMin: el.dataset.fontMin ? parseFloat(el.dataset.fontMin) : 10,
        fontMax: el.dataset.fontMax ? parseFloat(el.dataset.fontMax) : 24,
        fontStep: el.dataset.fontStep ? parseFloat(el.dataset.fontStep) : 1,
        searchOffsetPx: el.dataset.searchOffset ? parseInt(el.dataset.searchOffset,10) : 48,
        haptics: (el.dataset.haptics || 'auto'),
        historyLimit: el.dataset.historyLimit ? parseInt(el.dataset.historyLimit,10) : 100,
        playerAutoplay: el.dataset.playerAutoplay === 'true',
        playerLoop: el.dataset.playerLoop === 'true',
        playerButtons: el.dataset.playerButtons !== 'false',
        playerWaitAfterActionMs: el.dataset.playerDelay ? parseInt(el.dataset.playerDelay,10) : 0,
        playerProgress: el.dataset.playerProgress !== 'false',
        playerShowNotes: el.dataset.playerShowNotes !== 'false',
        playerClosePopoverOnStop: el.dataset.playerClosePopoverOnStop === 'true',
        playerStopHoldMs: el.dataset.playerStopHoldMs ? parseInt(el.dataset.playerStopHoldMs, 10) : 0,
        ruler: el.dataset.ruler === 'true',
        rulerStyle: (el.dataset.rulerStyle || 'tens'),
        rulerPosition: (el.dataset.rulerPosition === 'bottom' ? 'bottom' : 'top'),
        floatBar: el.dataset.floatbar === 'true',
        floatBarControls: (el.dataset.floatbarControls || 'stepPrev,play,pause,stepNext'),
        floatBarInFullscreen: el.dataset.floatbarInFullscreen !== 'false',
        floatBarRemember: el.dataset.floatbarRemember !== 'false',
        floatBarToggleInHeader: el.dataset.floatbarToggleInHeader === 'true',
      };
      // Instantiate editor
      new PWAxcode(el, opts);
    });
  }

  static get(elOrSelector) {
    // Get the PWAxcode instance bound to a DOM element.
    const el = (typeof elOrSelector === 'string')
      ? document.querySelector(elOrSelector)
      : elOrSelector;
    return (el && el.pwaxcode) ? el.pwaxcode : null;
  }

  static registerLanguage({ id, tokenize, autoIndent, detect }) {
    // Register a custom language plugin for syntax highlighting.
    const key = String(id || '').toLowerCase();
    if (!key) throw new Error('registerLanguage: id richiesto');
    PWAxcode._langPlugins[key] = { tokenize, autoIndent, detect };
  }

  static listLanguages() {
    // List all available languages (built-in + registered plugins).
    const builtins = ['js','json','html','css','sql','mysql'];
    const plugins = Object.keys(PWAxcode._langPlugins);
    return builtins.concat(plugins);
  }

  static registerTheme(name, { aliasOf } = {}) {
    // Register a new theme name, optionally as an alias of another.
    if (!name) return;
    this._themes.add(name);
    if (aliasOf) this._aliases.set(name.toLowerCase(), aliasOf.toLowerCase());
  }

  static listThemes() {
    // List all registered themes.
    return Array.from(this._themes);
  }

  _setup() {
    // Perform initial setup of the editor instance.
    this.root.classList.add('PWAxcode');
    this.body.style.overflow = 'auto';
    this._installScrollInner();
    if (this.opts.maxHeight != null) {
      const mh = typeof this.opts.maxHeight === 'number' ? this.opts.maxHeight + 'px' : this.opts.maxHeight;
      this.body.style.maxHeight = mh;
    }
    if (this.opts.height != null) {
      const h = typeof this.opts.height === 'number' ? this.opts.height + 'px' : this.opts.height;
      this.body.style.height = h; // fissa; se c'è, prevale su max-height
    }
    let pre  = this.scrollEl.querySelector('pre');
    let code = pre ? pre.querySelector('code') : null;
    if (!pre || !code) {
      // Bare mode: automatically wrap content inside <pre><code>.
      const wrapPre  = document.createElement('pre');
      const wrapCode = document.createElement('code');
      wrapPre.style.margin = '0';
      // IMPORTANT: read only from the scroll container’s textContent.
      const src = (this.scrollEl.textContent || '').replace(/^\n+|\n+$/g, '');
      // Clear the scroll container to avoid duplicated content.
      this.scrollEl.replaceChildren();
      wrapCode.textContent = src;
      wrapPre.appendChild(wrapCode);
      this.scrollEl.appendChild(wrapPre);
      pre = wrapPre;
      code = wrapCode;
    }
    this._applyFont();
    pre.style.margin = '0';
    // Extract raw source code from markup (<code> node)
    const rawOriginal = (code.children && code.children.length > 0)
      ? code.innerHTML
      : (code.textContent || '');
    this.rawOriginal = rawOriginal;
    const srcURL = code.getAttribute('data-src');
    if (srcURL) { this.loadFrom(srcURL, { typed:false }); }
    // Detect language (from attribute, option, dataset, or auto-detection)
    const langAttr = (code.getAttribute('data-lang') || '').toLowerCase();
    this.lang = (langAttr || this.opts.lang || this.root.dataset.lang || 'auto').toLowerCase();
    if (this.lang === 'auto') this.lang = this._detect(rawOriginal);
     // Prepare plain-text version for copy-to-clipboard
    this.copyText = (this.opts.tabs === 'both')
      ? this._expandTabs(rawOriginal, this.opts.tabSize)
      : rawOriginal;
    // Ensure toast notification container is available
    this._ensureToastHost?.();
    // Hidden textarea used as clipboard store
    const store = document.createElement('textarea');
    store.className = 'pxc-raw-store';
    store.setAttribute('readonly', 'readonly');
    store.setAttribute('aria-hidden', 'true');
    store.tabIndex = -1;
    store.spellcheck = false;
    store.value = this.copyText;
    // Fully hide the store element from layout and accessibility
    store.style.position = 'absolute';
    store.style.left = '-9999px';
    store.style.width = '1px';
    store.style.height = '1px';
    store.style.opacity = '0';
    store.style.pointerEvents = 'none';
    // Build displayed text (apply dedent, tabs expansion, auto-indent if enabled)
    let display = this.opts.dedent ? this._dedent(rawOriginal) : rawOriginal;
    if (this.opts.tabs === 'both' || this.opts.tabs === 'view') {
      display = this._expandTabs(display, this.opts.tabSize);
    }
    if (this.opts.autoIndent) {
      display = this._autoIndentByLang(display, this.lang, this.opts.tabSize);
    }
    if (this.opts.floatBar) { this.showFloatBar?.(); }
    this.viewText = display;
    // Build safe DOM views (highlighted and plain)
    this.viewHL    = this._buildViewHL_DOM(this.viewText, this.lang);
    this.viewPlain = this._buildViewPlain_DOM(this.viewText);
    pre.replaceChildren(this.viewHL, this.viewPlain, store);
    // Setup visual ruler for columns
    this._setupRuler();
    // Show tokens if enabled in options
    this.root.classList.toggle('pxc-show-tokens', !!this.opts.showTokens);
    // Apply existing marks (highlighted lines, etc.)
    this._applyMarks();
    // Apply current display mode (highlight/plain)
    this._applyMode();
    // Setup header and footer controls
    this._setupHeaderButtons();
    if (this.footer && this.opts.footerControls.length) this._setupFooterControls();
    if (this.opts.floatBar) this._setupFloatBar();
    // Enable fade overlays if requested
    if (this.opts.fade) {
      this._setupFades(); 
    }
    if (this.opts.compressed) this._enterCompressed(true);
    // Apply additional layout options
    this._applyLineNumbersVisibility?.();
    this._applyHeights?.();
    this._applyTabSize?.();
    // Setup scroll/resize hooks
    this._bindScrollHooks();
    this._updateRuler?.();
    this._onWin('resize', () => this._updateRuler?.());
    // Enable folding by clicking on gutter (line numbers area)
    this._on(this.body, 'click', (e) => {
      const bodyRect = this.body.getBoundingClientRect();
      const x = e.clientX - bodyRect.left;
      const cs = getComputedStyle(this.body);
      const gutter = parseFloat(cs.getPropertyValue('--pxc-gutter-w')) || 32;
      const gap    = parseFloat(cs.getPropertyValue('--pxc-gap')) || 5;
      if (x > gutter + gap) return; 
      const lineEl = e.target.closest('.pxc-line');
      const view = (this.mode==='hl') ? this.viewHL : this.viewPlain;
      if (!lineEl || !view || !view.contains(lineEl)) return;
      const ln = parseInt(lineEl.getAttribute('data-ln')||'0',10);
      if (!ln) return;
      if (!this.isFoldable(ln)) return;
      this.toggleFoldAt(ln);
      e.preventDefault(); e.stopPropagation();
    }, { passive:true });
  }

  _applyMode() {
    // Apply the current display mode (highlighted vs plain).
    const whiteSpace = this.opts.wrap ? 'pre-wrap' : 'pre';
    [this.viewHL, this.viewPlain].forEach(v => {
      if (!v) return;
      v.style.whiteSpace = whiteSpace;
      v.style.wordBreak  = this.opts.wrap ? 'break-word' : 'normal';
      v.style.tabSize = String(this.opts.tabSize);
      v.style.MozTabSize = String(this.opts.tabSize);
    });
    if (this.mode === 'hl') {
      this.viewHL.style.display = 'block';
      this.viewPlain.style.display = 'none';
    } else {
      this.viewHL.style.display = 'none';
      this.viewPlain.style.display = 'block';
    }
    if (Array.isArray(this._foldedRanges) && this._foldedRanges.length) {
      const v = (this.mode==='hl') ? this.viewHL : this.viewPlain;
      this._foldedRanges.forEach(([s,e]) => this._applyFoldToView(v, s, e, false));
    }
    this._applyFocusBothViews();
    this._scheduleRangeLayout?.();
  }

  _detect(text) {
    // Detect the best language or mode from the given text.
    const t = text.trim();
    if (/^\s*[\{\[][\s\S]*[\}\]]\s*$/.test(t)) return 'json';
    if (/{\s*[^}]*;\s*}/.test(t) || /:[^;]+;/.test(t)) return 'css';
    if (/<!DOCTYPE|<html|<\/?[a-z-]/i.test(t)) return 'html';
    if (/\b(select|insert|update|delete|create|drop|alter|with|begin|commit|rollback|case)\b/i.test(t)) return 'sql';
    // Plugin detect
    let best = null, bestScore = 0;
    for (const [id,def] of Object.entries(PWAxcode._langPlugins)) {
      if (!def || !def.detect) continue;
      try {
        const s = def.detect(text);
        const score = (s === true) ? 1 : (typeof s === 'number' ? s : 0);
        if (score > bestScore) { bestScore = score; best = id; }
      } catch {}
    }
    if (best) return best;
    return 'js';
  }

  _dedent(text) {
    // Normalize indentation of a multi-line string.
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    if (lines.length && /^\s*$/.test(lines[0])) lines.shift();
    //if (lines.length && /^\s*$/.test(lines[lines.length - 1])) lines.pop();
    let min = Infinity;
    for (const l of lines) {
      if (!l.trim()) continue;
      const m = l.match(/^[ \t]*/)[0].length;
      if (m < min) min = m;
    }
    if (!isFinite(min)) min = 0;
    const re = new RegExp('^[ \\t]{0,' + min + '}');
    return lines.map(l => l.replace(re, '')).join('\n');
  }

  _expandTabs(text, size) {
    // Expand tab characters based on the tab size and policy.
    let out = '', col = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n') { out += '\n'; col = 0; continue; }
      if (ch === '\t') {
        const toNext = size - (col % size) || size;
        out += ' '.repeat(toNext);
        col += toNext;
      } else { out += ch; col += 1; }
    }
    return out;
  }

  _autoIndentByLang(text, lang, size) {
    // Auto-format indentation according to language rules.
    if (lang === 'js')   return this._autoIndentJS(text, size);
    if (lang === 'json') {
      const pretty = this._autoIndentJSON(text, size);
      if (pretty != null) return pretty;
      return this._autoIndentBraces(text, size, ['{','['], ['}',']']);
    }
    if (lang === 'css')  return this._autoIndentBraces(text, size, ['{'], ['}']);
    if (lang === 'html') return this._autoIndentHTML(text, size);
    if (lang === 'sql' || lang === 'mysql') return this._autoIndentSQL(text, size);
    const plug = PWAxcode._langPlugins[lang];
    if (plug && typeof plug.autoIndent === 'function') {
      try { return plug.autoIndent(text, size); } catch {}
    }
    return text;
  }

  _autoIndentJSON(text, size) {
    // Pretty-print JSON with the configured indentation.
    try { return JSON.stringify(JSON.parse(text), null, size); }
    catch { return null; }
  }

  _autoIndentBraces(text, size, openArr, closeArr) {
    // Auto-format indentation according to language rules.
    const opens = new Set(openArr), closes = new Set(closeArr);
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    let depth = 0, inLineCom = false, inBlockCom = false, inStr = false, strQ = '';
    const out = [];
    for (let raw of lines) {
      const trimmed = raw.replace(/^[ \t]+/, '');
      const firstCh = trimmed[0] || '';
      let level = depth;
      if (closes.has(firstCh)) level = Math.max(0, level - 1);
      out.push(' '.repeat(level * size) + trimmed);
      inLineCom = false;
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i], nx = raw[i+1];
        if (inLineCom) break;
        if (inBlockCom) { if (ch === '*' && nx === '/') { inBlockCom = false; i++; } continue; }
        if (inStr) { if (ch === '\\') { i++; continue; } if (ch === strQ) inStr = false; continue; }
        if (ch === '/' && nx === '/') { inLineCom = true; break; }
        if (ch === '/' && nx === '*') { inBlockCom = true; i++; continue; }
        if (ch === '"' || ch === '\'') { inStr = true; strQ = ch; continue; }
        if (opens.has(ch)) depth++;
        else if (closes.has(ch)) depth = Math.max(0, depth - 1);
      }
    }
    return out.join('\n');
  }

  _autoIndentJS(text, size) {
    // Auto-indent JavaScript code.
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    let depth = 0, inBlockCom = false, inStr = false, strQ = '', inTemplate = false, tplExprDepth = 0;
    const out = [];
    for (let rawLine of lines) {
      let line = rawLine.replace(/^[ \t]+/, '');
      const firstCh = (line.match(/^\s*(.)/)||[])[1] || '';
      let level = depth;
      if (firstCh === '}') level = Math.max(0, level - 1);
      out.push(' '.repeat(level * size) + line);
      let i = 0, inLineCom = false;
      while (i < rawLine.length) {
        const ch = rawLine[i], nx = rawLine[i+1];
        if (inLineCom) break;
        if (inBlockCom) { if (ch==='*'&&nx=== '/') { inBlockCom=false; i+=2; continue; } i++; continue; }
        if (inStr) {
          if (ch==='\\') { i+=2; continue; }
          if (inTemplate && ch==='$' && nx==='{') { tplExprDepth++; i+=2; continue; }
          if (inTemplate && ch==='}' && tplExprDepth>0) { tplExprDepth--; i++; continue; }
          if (ch===strQ && (!inTemplate || tplExprDepth===0)) { inStr=false; inTemplate=false; i++; continue; }
          i++; continue;
        }
        if (ch==='/'&&nx==='/' ){ inLineCom = true; break; }
        if (ch==='/'&&nx==='*' ){ inBlockCom = true; i+=2; continue; }
        if (ch==='`'){ inStr=true; strQ='`'; inTemplate=true; tplExprDepth=0; i++; continue; }
        if (ch==='"'||ch==='\''){ inStr=true; strQ=ch; i++; continue; }
        if (ch==='{'){ depth++; i++; continue; }
        if (ch==='}'){ depth = Math.max(0, depth-1); i++; continue; }
        i++;
      }
    }
    return out.join('\n');
  }

  _autoIndentHTML(text, size) {
    // Auto-indent HTML-like markup.
    const voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    let depth = 0, inComment = false;
    const out = [];
    const isSelfClosing = s => /\/\s*>$/.test(s);
    const tagRegex = /<\s*\/?\s*([a-zA-Z0-9:-]+)([^>]*)>/g;
    for (let raw of lines) {
      let line = raw.replace(/^[ \t]+/, '');
      let trimmed = line.trim();
      if (inComment) {
        out.push(' '.repeat(depth * size) + line);
        if (trimmed.includes('-->')) inComment = false;
        continue;
      }
      if (trimmed.includes('<!--') && !trimmed.includes('-->')) {
        const pre = trimmed.startsWith('</') ? Math.max(0, depth-1) : depth;
        out.push(' '.repeat(pre * size) + line);
        inComment = true;
        continue;
      }
      let level = depth;
      if (/^<\s*\//.test(trimmed)) level = Math.max(0, depth - 1);
      out.push(' '.repeat(level * size) + line);
      let m;
      while ((m = tagRegex.exec(line)) !== null) {
        const full = m[0];
        const name = (m[1] || '').toLowerCase();
        const closing = /^<\s*\//.test(full);
        const selfc = isSelfClosing(full) || voids.has(name);
        if (!closing && !selfc) depth++;
        if (closing && depth > 0) depth--;
      }
    }
    return out.join('\n');
  }

  _autoIndentSQL(text, size) {
    // Auto-indent SQL code.
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    let depth = 0;
    const out = [];
    const decFirstRe = /^\s*(\)|END\b|ELSE\b|WHEN\b)\b/i;
    const incKeywords = /\b(BEGIN|CASE)\b/i;
    const decKeywords = /\b(END)\b/i;
    for (let raw of lines) {
      const stripped = raw.replace(/^[ \t]+/, '');
      let level = depth;
      if (decFirstRe.test(stripped)) level = Math.max(0, level - 1);
      out.push(' '.repeat(level * size) + stripped);
      const openPar = (raw.match(/\(/g) || []).length;
      const closePar = (raw.match(/\)/g) || []).length;
      if (incKeywords.test(raw)) depth++;
      if (decKeywords.test(raw)) depth = Math.max(0, depth - 1);
      depth += openPar;
      depth = Math.max(0, depth - closePar);
    }
    return out.join('\n');
  }

  _buildViewPlain_DOM(textForView) {
    // Build the code view DOM structure (plain).
    const el = document.createElement('code');
    el.className = 'pxc-viewPlain';
    this._fillLinesDOM(el, textForView, null);
    return el;
  }

  _buildViewHL_DOM(textForView, lang) {
    // Build the code view DOM structure (higlighted).
    const el = document.createElement('code');
    el.className = 'pxc-viewHL';
    el.setAttribute('data-lang', lang);
    const plug = PWAxcode._langPlugins[lang];
    if (plug && typeof plug.tokenize === 'function') {
      const tok = t => plug.tokenize(t);
      this._fillLinesDOM(el, textForView, tok);
      return el;
    }
    const pick =
      lang === 'js'   ? this._tokenizeJS.bind(this)   :
      lang === 'json' ? this._tokenizeJSON.bind(this) :
      lang === 'html' ? this._tokenizeHTML.bind(this) :
      (lang === 'sql' || lang === 'mysql') ? this._tokenizeSQL.bind(this) :
      lang === 'css'  ? this._tokenizeCSS.bind(this)  :
      null;
    this._fillLinesDOM(el, textForView, pick);
    return el;
  }

  destroy({ restoreDOM = false } = {}) {
    // Dispose component resources and detach listeners.
    if (this._destroyed) return true;
    // Ferma player e popup
    if (this._player) { this._player.playing = false; this._player.paused = false; }
    this.closePopover?.(true);
    // Timers
    clearTimeout(this.state?.popoverTimeout);
    // Fullscreen?
    try { if (this.fullscreen) this._exitFullscreen(); } catch {}
    if (this._pop) { try { this.closePopover(true); } catch {} }
    try { (this._unsubs||[]).forEach(fn => { try{ fn(); }catch{} }); } finally { this._unsubs = []; }
    // Floatbar
    try { this._destroyFloatBar?.(); } catch {}
    // Fade
    this.body?.classList.remove('pxc-fade-t','pxc-fade-b');
    ['.pxc-copy','.pxc-toggle','.pxc-fbtn'].forEach(sel => {
      this.root.querySelectorAll(sel).forEach(btn => btn.replaceWith(btn.cloneNode(true)));
    });
    this.clearSearch?.();
    this.clearMark?.();
    this.unfoldAll?.();
    this._scrollSubs?.clear();
    this._scrollHubBound = false;
    if (restoreDOM) {
      const pre   = this.body.querySelector('pre');
      const store = this.body.querySelector('textarea.pxc-raw-store');
      if (pre && store) {
        const code = document.createElement('code');
        code.textContent = store.value;
        pre.replaceChildren(code);
        store.remove();
      }
    }
    // Flag
    delete this.root.dataset.pwaxcodeInit;
    delete this.root.pwaxcode;
    this._destroyed = true;
    this._emit?.('destroy', {});
    return true;
  }

  reinit(opts = {}) {
    // Reinitialize the component with current options.
    this.destroy();                       
    Object.assign(this.opts, opts || {}); 
    this._destroyed = false;
    this._setup();
    this._applyLineNumbersVisibility?.();
    this._applyHeights?.();
    this._applyTabSize?.();
    return this;
  }

  listLanguages() {
    // List available language identifiers.
    return PWAxcode.listLanguages(); 
  }

  ver() {
    // PWAxcode version
    return this._version;
  }

  changeLanguage(lang) {
    // Resolve or map languages and aliases.
    const id = String(lang || '').toLowerCase();
    if (!this.listLanguages().includes(id)) throw new Error(`Unsupported language: ${id}`);
    this.lang = id;
    let display = this.opts.dedent ? this._dedent(this.rawOriginal) : this.rawOriginal;
    if (this.opts.tabs === 'both' || this.opts.tabs === 'view') display = this._expandTabs(display, this.opts.tabSize);
    if (this.opts.autoIndent) display = this._autoIndentByLang(display, this.lang, this.opts.tabSize);
    this.viewText = display;
    const pre = this.scrollEl.querySelector('pre');
    const store = this.scrollEl.querySelector('textarea.pxc-raw-store');
    this.viewHL    = this._buildViewHL_DOM(this.viewText, this.lang);
    this.viewPlain = this._buildViewPlain_DOM(this.viewText);
    pre.replaceChildren(this.viewHL, this.viewPlain, store);
    this.rebuildFoldMap();
    this._applyMode();
    this._applyMarks();
    if (this._searchHits && this._searchHits.length) this._applySearchHits(new Set(this._searchHits));
    this._reapplyInlineHitsCurrentView();
    if (this.opts.fade) this._updateFades();
    this._applyFocusBothViews?.();
    this._scheduleRangeLayout?.();
    this._updateRuler?.();
  }

  _appendTextPreserveIndent(cell, text, atLineStartRef) {
    // Append text and preserve indentation
    if (!text) return;
    if (atLineStartRef.atLineStart) {
      let i = 0; while (i < text.length && text[i] === ' ') i++;
      if (i > 0) {
        cell.appendChild(document.createTextNode('\u00A0'.repeat(i)));
        text = text.slice(i);
      }
    }
    if (text.length) {
      cell.appendChild(document.createTextNode(text));
      if (/\S/.test(text)) atLineStartRef.atLineStart = false;
    }
  }

  _fillLinesDOM(container, raw, tokenizer) {
    // Render the given source into line DOM nodes inside container.
    const start = this.opts.lineNumbers ? this.opts.lineNumbersStart : null;
    let ln = start ?? 0;
    const lineWrap = () => {
      const div = document.createElement('div');
      div.className = 'pxc-line';
      if (start !== null) div.setAttribute('data-ln', ln++);
      const cell = document.createElement('span');
      cell.className = 'pxc-code';
      div.appendChild(cell);
      container.appendChild(div);
      return { cell, atLineStart: true };
    };
    let line = lineWrap();
    if (!raw.length) return;

    if (!tokenizer) {
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === '\n') { line = lineWrap(); }
        else { this._appendTextPreserveIndent(line.cell, ch, line); }
      }
      return;
    }
    const tokens = tokenizer(raw);
    for (const t of tokens) {
      if (t.text === '\n') { line = lineWrap(); continue; }
      if (t.type) {
        const span = document.createElement('span');
        span.setAttribute('data-tok', t.type);
        span.appendChild(document.createTextNode(t.text));
        line.cell.appendChild(span);
        line.atLineStart = false;
      } else {
        this._appendTextPreserveIndent(line.cell, t.text, line);
      }
    }
  }

  _tokenizeJS(src) {
    // Convert between tokens and text (JS).
    const tokens = [];
    const push = (type, text) => { tokens.push({ type, text }); lastTok = { type, text }; };
    const pushTxt = (text) => { tokens.push({ text }); lastTok = (/\S/.test(text) ? { type:'txt', text } : lastTok); };
    const isIdStart = c => /[A-Za-z_$]/.test(c);
    const isIdPart  = c => /[A-Za-z0-9_$]/.test(c);
    // Reserved keywords in JS
    const KW = new Set(['async','await','break','case','catch','class','const','continue','default','delete','do','else',
      'export','extends','finally','for','from','function','if','import','in','instanceof','let','new','of','return','super',
      'switch','this','throw','try','typeof','var','void','while','with','yield']);
    // Built-in literals
    const LIT = new Set(['true','false','null','undefined','NaN','Infinity']);
    let i = 0, n = src.length, lastTok = null;
    // Consume characters while predicate is true
    const readWhile = (pred) => { const j=i; while (i<n && pred(src[i])) i++; return src.slice(j,i); };
    // Parse numbers: integers, floats, scientific notation, binary/octal/hex
    const readNumber = () => {
      const j=i;
      if (src[i]==='0' && /[boxBOX]/.test(src[i+1])) { i+=2; readWhile(ch=>/[0-9a-fA-F]/.test(ch)); }
      else { readWhile(ch=>/[0-9]/.test(ch)); if (src[i]==='.') { i++; readWhile(ch=>/[0-9]/.test(ch)); }
             if (/[eE]/.test(src[i])) { i++; if (/[+-]/.test(src[i])) i++; readWhile(ch=>/[0-9]/.test(ch)); } }
      return src.slice(j,i);
    };
    // Parse strings (single, double, or template literals with ${...})
    const readString = (quote) => {
      let out = src[i++]; 
      while (i<n) {
        const c = src[i]; out += c; i++;
        if (c==='\\') { if (i<n) { out += src[i]; i++; } continue; }
        // Handle template literal interpolation
        if (quote==='`' && c==='$' && src[i]==='{') {
          out += src[i++]; let d=1;
          while (i<n && d>0) {
            const cc = src[i]; out += cc; i++;
            if (cc==='\\') { if (i<n) { out += src[i]; i++; } continue; }
            if (cc==='{') d++; else if (cc==='}') d--;
          }
          continue;
        }
        if (c===quote) break;
      }
      return out;
    };
     // Parse regular expressions (/, flags, character classes)
    const readRegex = () => {
      let out = src[i++]; 
      let inClass = false;
      while (i<n) {
        const c = src[i]; out += c; i++;
        if (c==='\\') { if (i<n) { out += src[i]; i++; } continue; }
        if (c==='[') { inClass = true; continue; }
        if (c===']') { inClass = false; continue; }
        if (c==='/' && !inClass) break; 
      }
      while (i<n && /[a-z]/i.test(src[i])) { out += src[i]; i++; }
      return out;
    };
    // Determine if a regex can start at the current position
    const canStartRegex = (lt) => {
      if (!lt) return true;
      const t = lt.type || '';
      const v = (lt.text || '').trim();
      if (t==='num' || t==='str' || t==='lit' || t==='fn' || t==='id') return false;
      if (v===')' || v===']' || v==='}' || v==='++' || v==='--') return false;
      if (t==='kw') return true;
      if (t==='pun' || t==='op' || t==='com' || t==='txt') return true;
      return true;
    };
    while (i < n) {
      const ch = src[i], nx = src[i+1];
      // Line breaks
      if (ch === '\n') { pushTxt('\n'); i++; continue; }
      // Whitespace (excluding line breaks)
      if (/\s/.test(ch)) { pushTxt(readWhile(c=>/\s/.test(c) && c!=='\n')); continue; }
      // Line and block comments
      if (ch==='/'&&nx==='/' ){ let j=i+2; while (j<n && src[j]!=='\n') j++; push('com', src.slice(i,j)); i=j; continue; }
      if (ch==='/'&&nx==='*' ){ let j=i+2; while (j<n && !(src[j]==='*'&&src[j+1]==='/')) j++; j=Math.min(n,j+2); push('com', src.slice(i,j)); i=j; continue; }
      // Slash: division, regex, or operator
      if (ch === '/') {
        if (nx === '=') { push('pun', '/='); i+=2; continue; }
        if (canStartRegex(lastTok)) { push('re', readRegex()); continue; }
        push('pun', '/'); i++; continue;
      }
      // Strings
      if (ch==='\''||ch==='"'||ch==='`') { push('str', readString(ch)); continue; }
      // Numbers
      if (/[0-9]/.test(ch) || (ch==='.' && /[0-9]/.test(nx))) { push('num', readNumber()); continue; }
      // Identifiers, keywords, literals, function names
      if (isIdStart(ch)) {
        const id = readWhile(isIdPart);
        if (KW.has(id))  { push('kw', id);  continue; }
        if (LIT.has(id)) { push('lit', id); continue; }
        let k=i; while (k<n && /\s/.test(src[k])) k++;
        if (src[k]==='(') { push('fn', id); continue; }
        push('id', id); continue;
      }
      // Punctuation
      if (',;(){}[]?:.'.includes(ch)) { push('pun', ch); i++; continue; }
      // Operators (including multi-character ones like ==, ===, <=, etc.)
      if ('+-*%<>=!&|^~'.includes(ch)) {
        const j=i;
        i++;
        if (i<n && '=<>|&+-'.includes(src[i])) i++;
        if (i<n && src[i]==='=') i++;
        push('op', src.slice(j,i));
        continue;
      }
      // Default: treat as plain text
      pushTxt(ch); i++;
    }
    return tokens;
  }

  _tokenizeJSON(src) {
    // Convert between tokens and text (JSON).
    const tokens = [];
    const push = (type, text) => tokens.push({ type, text });
    const pushTxt = (text) => tokens.push({ text });
    let i=0, n=src.length;
    // Reads a JSON string, including escape sequences ("...")
    const readString = () => { let out=src[i++]; while(i<n){ const c=src[i]; out+=c; i++; if(c==='\\'){ if(i<n){ out+=src[i]; i++; } continue; } if(c=== '"') break; } return out; };
    // Reads a JSON number: supports -, decimals, and exponents
    const readNumber = () => { const j=i; if(src[i]==='-') i++; while(/[0-9]/.test(src[i])) i++; if(src[i]==='.') { i++; while(/[0-9]/.test(src[i])) i++; } if(/[eE]/.test(src[i])) { i++; if(/[+-]/.test(src[i])) i++; while(/[0-9]/.test(src[i])) i++; } return src.slice(j,i); };
    while (i<n) {
      const ch = src[i];
      // Preserve line breaks
      if (ch === '\n') { pushTxt('\n'); i++; continue; }
      // Whitespace (excluding newline)
      if (/\s/.test(ch)) { let j=i; while (/\s/.test(src[i]) && src[i] !== '\n') i++; pushTxt(src.slice(j,i)); continue; }
      // String: distinguish between object keys and normal strings
      if (ch === '"') { const str = readString(); let k=i; while (k<n && /\s/.test(src[k])) k++; if (src[k] === ':') push('key', str); else push('str', str); continue; }
      // Numbers
      if (ch === '-' || /[0-9]/.test(ch)) { push('num', readNumber()); continue; }
      // Literals: true / false / null
      if (src.startsWith('true', i))  { push('lit','true');  i+=4; continue; }
      if (src.startsWith('false', i)) { push('lit','false'); i+=5; continue; }
      if (src.startsWith('null', i))  { push('lit','null');  i+=4; continue; }
      // Default: punctuation (e.g., { } [ ] : ,)
      pushTxt(ch); i++;
    }
    return tokens;
  }

  _tokenizeHTML(src) {
    // Convert between tokens and text (HTML).
    const tokens = [];
    let inRaw = null;
    const push = (type, text) => tokens.push({ type, text });
    const pushTxt = (text) => tokens.push({ text });
    // Character classification helpers
    const isWS = c => /[\s\f]/.test(c);
    const isNameStart = c => /[A-Za-z]/.test(c);
    const isNameChar  = c => /[A-Za-z0-9:_-]/.test(c);
    const isAttrChar  = c => /[A-Za-z0-9:_-]/.test(c);
    let i = 0, n = src.length;
    // Utility readers
    const readWhile = pred => { const j=i; while (i<n && pred(src[i])) i++; return src.slice(j,i); };
    const readUntil = needle => { const j=i; const k=src.indexOf(needle, i); i=(k===-1)?n:k+needle.length; return src.slice(j,i); };
    const readQuoted = q => { let out=src[i++]; while(i<n){ const c=src[i]; out+=c; i++; if(c===q) break; if(c==='\\'&&i<n){ out+=src[i]; i++; } } return out; };
    while (i < n) {
      const ch = src[i], nx = src[i+1];
      // Handle raw text mode (<script>, <style>)
      if (inRaw) {
       const closeTag = `</${inRaw}`;
       const k = src.toLowerCase().indexOf(closeTag, i);
       const end = k === -1 ? n : k;
       push('txt', src.slice(i, end)); i = end;
       inRaw = null;
       continue;
      }
      // Line breaks
      if (ch === '\n') { pushTxt('\n'); i++; continue; }
       // HTML entities (&amp;, &lt;, etc.)
      if (ch === '&') { const j=src.indexOf(';', i+1); if(j!==-1){ push('ent', src.slice(i,j+1)); i=j+1; continue; } }
      // Comments <!-- ... -->
      if (src.startsWith('<!--', i)) { push('com', readUntil('-->')); continue; }
      // Doctype or CDATA
      if (src.startsWith('<!DOCTYPE', i) || src.startsWith('<!doctype', i) || src.startsWith('<![CDATA[', i)) {
        push('doctype', readUntil(src.startsWith('<![CDATA[', i) ? ']]>' : '>')); continue;
      }
      // Opening of a tag
      if (ch === '<') {
        push('pun','<'); i++;
        if (src[i] === '/') { push('pun','/'); i++; }
        // Tag name
        if (isNameStart(src[i])) { const name=readWhile(isNameChar); push('tag', name); }
        // Parse attributes and tag punctuation
        while (i<n) {
          if (isWS(src[i])) { pushTxt(readWhile(isWS)); continue; }
          // Closing '>' or self-closing '/>'
          if (src[i] === '>' ) {
            push('pun','>'); i++;
            const last = tokens[tokens.length-2];
            if (last?.type === 'tag') {
              const lname = last.text.toLowerCase();
              if (lname === 'script' || lname === 'style') inRaw = lname;
            }
            break;
          }
          if (src[i] === '/' && src[i+1] === '>') { push('pun','/'); push('pun','>'); i+=2; break; }
          // Attribute name and value
          if (isAttrChar(src[i])) {
            const an=readWhile(isAttrChar); push('attr', an);
            if (isWS(src[i])) pushTxt(readWhile(isWS));
            if (src[i] === '=') {
              push('pun','='); i++;
              if (isWS(src[i])) pushTxt(readWhile(isWS));
              if (src[i] === '"' || src[i] === "'") { push('str', readQuoted(src[i])); }
              else { const v = readWhile(c => !isWS(c) && c!=='>' && c!=='/'); if (v) push('str', v); }
            }
            continue;
          }
          // Any other punctuation inside tag
          push('pun', src[i]); i++;
        }
        continue;
      }
      // Default: plain text node
      pushTxt(ch); i++;
    }
    return tokens;
  }

  _tokenizeCSS(src) {
    // Convert between tokens and text (CSS).
    const tokens = [];
    const push = (type, text) => tokens.push({ type, text });
    const pushTxt = (text) => tokens.push({ text });
    const isWS = c => /\s/.test(c);
    const isNameStart = c => /[A-Za-z_-]/.test(c);
    const isNameChar  = c => /[A-Za-z0-9_-]/.test(c);
    let i = 0, n = src.length;
    let inBlock = false;               
    let inStr = false, q = '"'; 
    let expectingProp = false;  
    // Read while predicate holds
    const readWhile = pred => { const j=i; while(i<n && pred(src[i])) i++; return src.slice(j,i); };
    // Read quoted string (handles escapes)
    const readQuoted = qq => { let out=src[i++]; while(i<n){ const c=src[i]; out+=c; i++; if(c===qq) break; if(c==='\\'&&i<n){ out+=src[i]; i++; } } return out; };
    // Read number with optional unit (px, rem, %, etc.)
    const readNumberUnit = () => {
      const j=i;
      if (src[i]==='-' || src[i]==='+') i++;
      let sawDigit = false;
      while (/[0-9]/.test(src[i])) { i++; sawDigit = true; }
      if (src[i]==='.' && /[0-9]/.test(src[i+1])) { i++; while(/[0-9]/.test(src[i])) i++; sawDigit = true; }
      if (!sawDigit) return null;
      while (/[A-Za-z%]/.test(src[i])) i++;
      return src.slice(j,i);
    };
    while (i < n) {
      const ch = src[i], nx = src[i+1];
      if (ch === '\n') { pushTxt('\n'); i++; continue; }
      // Block comment /* ... */
      if (!inStr && ch==='/' && nx==='*') { 
        let j=i+2; while(j<n && !(src[j]==='*' && src[j+1]==='/')) j++;
        j = Math.min(n, j+2); push('com', src.slice(i,j)); i=j; continue;
      }
      // Quoted strings
      if (!inStr && (ch === '"' || ch === "'")) { push('str', readQuoted(ch)); continue; }
      // Whitespace
      if (!inStr && isWS(ch)) { pushTxt(readWhile(isWS)); continue; }
      // Common punctuation and block delimiters
      if (!inStr && '{}:;(),>.#[]+'.includes(ch)) {
        if (ch === '{') { inBlock = true; expectingProp = true; }
        if (ch === '}') { inBlock = false; expectingProp = false; }
        push('pun', ch); i++; continue;
      }
      // Hexadecimal color values (#fff, #a1b2c3)
      if (!inStr && ch === '#') {
        let j=i+1; while (/[0-9A-Fa-f]/.test(src[j])) j++;
        if (j>i+1) { push('num', src.slice(i,j)); i=j; continue; }
      }
      // Numeric values with units (12px, .5rem, 100%)
      if (!inStr) {
        const nu = readNumberUnit();
        if (nu) { push('num', nu); continue; }
      }
      // At-rules (@media, @supports, @keyframes...)
      if (!inStr && ch === '@') {
        let j=i+1; while (isNameChar(src[j])) j++;
        push('kw', src.slice(i, j)); i=j; continue;
      }
      // Function call (e.g., url(...), rgba(...))
      if (!inStr && isNameStart(ch)) {
        const start = i;
        const name = readWhile(isNameChar);
        if (src[i] === '(') { push('fn', name); push('pun','('); i++; continue; }
        if (inBlock) {
          // Property inside block
          if (expectingProp) {
            push('prop', name);
            // Optional whitespace
            if (isWS(src[i])) pushTxt(readWhile(isWS));
            // Colon following property
            if (src[i] === ':') { push('pun', ':'); i++; expectingProp = false; }
            continue;
          }
          // Fallback: treat as raw text
          pushTxt(src.slice(start, i));
          continue;
        } else {
          // Outside block → treat as selector
          push('sel', name);
          continue;
        }
      }
      // Default: treat as plain text
      pushTxt(ch); i++;
      if (ch === ';' && inBlock) expectingProp = true;
    }
    return tokens;
  }

  _tokenizeSQL(src) {
    // Convert between tokens and text (SQL).
    const tokens = [];
    const push = (type, text) => tokens.push({ type, text });
    const pushTxt = (text) => tokens.push({ text });
    // SQL reserved keywords
    const KW = new Set([
      'select','insert','update','delete','from','where','and','or','not','null','true','false',
      'join','left','right','full','inner','outer','on','group','by','order','limit','offset','having',
      'as','into','values','create','table','primary','key','unique','index','if','exists','drop','alter','add','column',
      'constraint','foreign','references','engine','default','auto_increment','current_timestamp','case','when','then','else','end',
      'begin','commit','rollback','union','all','distinct','between','in','like','is','desc','asc'
    ]);
    // Common SQL functions
    const FN = new Set([
      'count','sum','avg','min','max','now','current_date','current_time','concat','coalesce','ifnull','upper','lower','substr','substring','round','abs'
    ]);
    // Character classification helpers
    const isWS = c => /\s/.test(c);
    const isIdStart = c => /[A-Za-z_]/.test(c);
    const isIdPart  = c => /[A-Za-z0-9_\$]/.test(c);
    let i=0, n=src.length;
    // Utility readers
    const readWhile = pred => { const j=i; while(i<n && pred(src[i])) i++; return src.slice(j,i); };
    const readNumber = () => { const j=i; if(src[i]==='-') i++; while(/[0-9]/.test(src[i])) i++; if(src[i]==='.') { i++; while(/[0-9]/.test(src[i])) i++; } return src.slice(j,i); };
    const readQuoted = q => { let out=src[i++]; while(i<n){ const c=src[i]; out+=c; i++; if(c===q){ break; } if(c==='\\'&&i<n){ out+=src[i]; i++; } } return out; };
    const readBacktick = () => { let out=src[i++]; while(i<n){ const c=src[i]; out+=c; i++; if(c==='`') break; } return out; };
    while (i<n) {
      const ch = src[i], nx = src[i+1];
      if (ch === '\n') { pushTxt('\n'); i++; continue; }
      // Whitespace
      if (isWS(ch)) { pushTxt(readWhile(isWS)); continue; }
      // Single-line comments: -- ... or # ...
      if (ch==='-' && nx==='-') { let j=i+2; while(j<n && src[j] !== '\n') j++; push('com', src.slice(i,j)); i=j; continue; }
      if (ch==='#') { let j=i+1; while(j<n && src[j] !== '\n') j++; push('com', src.slice(i,j)); i=j; continue; }
      // Block comments: /* ... */
      if (ch==='/' && nx==='*') { let j=i+2; while(j<n && !(src[j]==='*' && src[j+1]==='/')) j++; j=Math.min(n,j+2); push('com', src.slice(i,j)); i=j; continue; }
      // Quoted strings and identifiers
      if (ch==="'" || ch === '"') { push('str', readQuoted(ch)); continue; }
      if (ch==='`') { push('str', readBacktick()); continue; }
      // Numbers (integer, decimal)
      if (/[0-9]/.test(ch) || (ch==='.' && /[0-9]/.test(nx))) { push('num', readNumber()); continue; }
      // Identifiers, keywords, functions
      if (isIdStart(ch)) {
        const id = readWhile(isIdPart);
        const low = id.toLowerCase();
        // SQL keyword
        if (KW.has(low))  { 
          if (low === 'true' || low === 'false' || low === 'null') push('lit', id);
          else push('kw', id);
          continue;
        }
        // Known function
        if (FN.has(low))  { push('fn', id); continue; }
        // Function if followed directly by '('
        let k=i; while (k<n && /\s/.test(src[k])) k++;
        if (src[k]==='(') { push('fn', id); continue; }
        // Otherwise plain identifier
        pushTxt(id); continue;
      }
      // Punctuation and operators
      if (',;().=*<>!+-/%|&^'.includes(ch)) { push('pun', ch); i++; continue; }
      // Fallback: plain text
      pushTxt(ch); i++;
    }
    return tokens;
  }

  _setupHeaderButtons() {
    // Initialize and render the interactive header buttons for the code editor UI.
    if (!this.iconHost) return;
    // COPY button
    let icon = this.iconHost.querySelector('i.fa-clipboard, i.fa.fa-clipboard');
    if (!icon) { icon = document.createElement('i'); icon.className = 'fa fa-clipboard'; }
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'pxc-copy';
    copyBtn.classList.add('anim-icon');
    copyBtn.setAttribute('aria-label', this.t('ui.copy'));
    copyBtn.appendChild(icon);
    this.iconHost.innerHTML = '';
    this.iconHost.appendChild(copyBtn);
    copyBtn.addEventListener('click', () => this._copy(copyBtn));
    // TOGGLE HIGHLIGHT button
    if (this.opts.toggleHighlight) {
      const tbtn = document.createElement('button');
      tbtn.type = 'button';
      tbtn.className = 'pxc-toggle';
      tbtn.classList.add('anim-icon');
      tbtn.setAttribute('aria-pressed', this.mode === 'hl' ? 'true' : 'false');
      tbtn.title =  this.t('ui.toggleHL.help');
      const ic = document.createElement('i');
      ic.className = this.mode === 'hl' ? 'fa fa-fw fa-code' : 'fa fa-fw fa-file-lines';
      tbtn.appendChild(ic);
      tbtn.addEventListener('click', () => {
        this.mode = (this.mode === 'hl') ? 'plain' : 'hl';
        this._applyMode();
        this._reapplyInlineHitsCurrentView();
        if (this.opts.fade) this._setupFades();   
        this._emit('toggleHL', { mode: this.mode });
        ic.className = this.mode === 'hl' ? 'fa fa-fw fa-code' : 'fa fa-fw fa-file-lines';
        tbtn.setAttribute('aria-pressed', this.mode === 'hl' ? 'true' : 'false');
        tbtn.title = (this.mode === 'hl')
          ? this.t('ui.toggleHL.on')
          : this.t('ui.toggleHL.off');
      });
      this.iconHost.appendChild(tbtn);
    }
    // DOWNLOAD button
    if (this.opts.download) {
      const dbtn = document.createElement('button');
      dbtn.type = 'button';
      dbtn.className = 'pxc-download';
      dbtn.classList.add('anim-icon');
      dbtn.setAttribute('aria-label', this.t('ui.download'));
      const di = document.createElement('i');
      di.className = 'fa fa-download';
      dbtn.appendChild(di);
      dbtn.addEventListener('click', () => this._download());
      this.iconHost.appendChild(dbtn);
    }
    // FULLSCREEN button
    if (this.opts.fullscreen) {
      const fbtn = document.createElement('button');
      fbtn.type = 'button';
      fbtn.className = 'pxc-fullscreen';
      fbtn.classList.add('anim-icon');
      fbtn.setAttribute('aria-pressed', 'false');
      fbtn.title = this.fullscreen
        ? this.t('ui.fullscreen.exit')
        : this.t('ui.fullscreen.enter');
      const fi = document.createElement('i');
      fi.className = 'fa fa-fw fa-expand';
      fbtn.appendChild(fi);
      fbtn.addEventListener('click', () => {
        this._toggleFullscreen();
        const on = !!this.fullscreen;
        fbtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        fi.className = on ? 'fa fa-fw fa-compress' : 'fa fa-fw fa-expand';
      });
      this.iconHost.appendChild(fbtn);
    }
    // FLOATBAR button
    if (this.opts.floatBarToggleInHeader) {
      const fbtn = document.createElement('button');
      fbtn.type = 'button';
      fbtn.className = 'pxc-floatbar-toggle anim-icon';
      fbtn.title = this.t('ui.floatbar.help');
      fbtn.setAttribute('aria-label',this.t('ui.floatbar.help'));
      const fi = document.createElement('i');
      fi.className = 'fa fa-grip-lines';
      fbtn.appendChild(fi);
      fbtn.addEventListener('click', () => this.toggleFloatBar());
      this.iconHost.appendChild(fbtn);
    }
    // COLLAPSE/EXPAND button
    const cbtn = document.createElement('button');
    cbtn.type = 'button';
    cbtn.className = 'pxc-collapse';
    cbtn.classList.add('anim-icon');
    cbtn.setAttribute('aria-expanded', 'true');
    cbtn.title = this.compressed ? this.t('ui.expand') : this.t('ui.collapse');
    const ci = document.createElement('i');
    ci.className = 'fa fa-chevron-up';
    cbtn.appendChild(ci);
    cbtn.addEventListener('click', () => this._toggleCompressed());
    this.iconHost.appendChild(cbtn);
    this.collapseBtn = cbtn;
    this._applyToolbarVisibility?.();
  }

  _extForLang(lang) {
    // Language extension
    if (lang === 'js') return 'js';
    if (lang === 'json') return 'json';
    if (lang === 'html') return 'html';
    if (lang === 'css') return 'css';
    if (lang === 'sql' || lang === 'mysql') return 'sql';
    return 'txt';
  }

  _filename() {
    // Filename
    if (this.opts.filename) return this.opts.filename;
    const title = (this.root.querySelector('.container-title .title-text')?.textContent || 'snippet')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const ext = this._extForLang(this.lang);
    return `${title || 'snippet'}.${ext}`;
  }

  _download() {
    // Download file
    const content = (this.opts.downloadContent === 'raw') ? this.copyText : this.viewText;
    const ext = this._extForLang(this.lang);
    const mime = {
      js: 'text/javascript',
      json: 'application/json',
      html: 'text/html',
      css: 'text/css',
      sql: 'application/sql',
      txt: 'text/plain'
    }[ext] || 'text/plain';
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = this._filename();
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  async _copy(btn) {
    // Copy to clipboard
    const text = this.copyText || '';
    const legacyCopy = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch {}
      ta.remove();
      return ok;
    };
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        if (!legacyCopy()) throw new Error('Legacy copy failed');
      }
      this._toast(this.t('msg.copy.ok'));
      this._haptic('copy');
      this._swapIcon(btn, true);
      this._emit('copy', { success:true, length:text.length, mode:this.mode, via: (navigator.clipboard && window.isSecureContext) ? 'clipboard' : 'legacy' });
      setTimeout(() => this._swapIcon(btn, false), 900);
    } catch (e) {
      let ok = false;
      try { ok = legacyCopy(); } catch {}
      if (ok) {
        this._toast(this.t('msg.copy.ok'));
        this._haptic('copy');
        this._swapIcon(btn, true);
        this._emit('copy', { success:true, length:text.length, mode:this.mode, via:'legacy-fallback' });
        setTimeout(() => this._swapIcon(btn, false), 900);
      } else {
        this._emit('copy', { success:false, error:String(e) });
        this._toast(this.t('msg.copy.errPerm'));
      }
    }
  }

  _swapIcon(btn, ok) {
    // Internal helper
    const i = btn.querySelector('i');
    if (!i) return;
    i.className = ok ? 'fa fa-check fa-fw' : 'fa fa-clipboard fa-fw';
    i.setAttribute('aria-hidden','true');
  }

  _toast(message, options = {}) {
    // System toast
    const isObj = message && typeof message === 'object';
    const text = isObj ? (message.text || '') : String(message ?? '');
    const {
      ms,
      type = (isObj ? (message.type || 'warning') : 'warning'),
      position,
      icon: iconOverride
    } = (isObj ? message : options) || {};
    if (position) { this.opts.toastPosition = position; this._positionToastHost?.(); }
    const host = this._ensureToastHost?.() || this.body;
    const ICONS = {
      info:    'fa-solid fa-circle-info',
      success: 'fa-solid fa-circle-check',
      warning: 'fa-solid fa-triangle-exclamation',
      error:   'fa-solid fa-circle-xmark'
    };
    const iconClass = (iconOverride === null) ? null : (iconOverride || ICONS[type] || ICONS.warning);
    const toast = document.createElement('div');
    toast.className = `pxc-toast ${type}`.trim();
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    if (iconClass) {
      const ic = document.createElement('i');
      ic.className = `pxc-toast-ic ${iconClass}`;
      ic.setAttribute('aria-hidden', 'true');
      toast.appendChild(ic);
    }
    const span = document.createElement('span');
    span.className = 'pxc-toast-text';
    span.textContent = text;
    toast.appendChild(span);
    host.appendChild(toast);
    const max = (this.opts.toastMax|0) || 3;
    const all = host.querySelectorAll('.pxc-toast');
    if (all.length > max) {
      for (let i = 0; i < all.length - max; i++) all[i].remove();
    }
    requestAnimationFrame(() => toast.classList.add('show'));
    const duration = Number.isFinite(ms)
      ? ms
      : (this.opts.toastMs ?? this.opts.copyToastMs ?? 1300);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 220);
    }, duration);
  }

  _installScrollInner() {
    // Wrap the body content into an inner .pxc-scroll container
    const cs = getComputedStyle(this.body);
    const padT = parseFloat(cs.paddingTop)    || 0;
    const padR = parseFloat(cs.paddingRight)  || 0;
    const padB = parseFloat(cs.paddingBottom) || 0;
    const padL = parseFloat(cs.paddingLeft)   || 0;
    let wrap = this.body.querySelector(':scope > .pxc-scroll');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'pxc-scroll';
      while (this.body.firstChild) wrap.appendChild(this.body.firstChild);
      this.body.appendChild(wrap);
    }
    wrap.style.paddingTop    = padT + 'px';
    wrap.style.paddingRight  = padR + 'px';
    wrap.style.paddingBottom = padB + 'px';
    wrap.style.paddingLeft   = padL + 'px';
    this.body.style.padding  = '0';
    this.scrollEl = wrap;
  }

  _setupFades() {
    // Create top/bottom fade overlays and bind scroll/resize listeners
    if (!this._fadeTop) {
      const ft = document.createElement('div');
      ft.className = 'pxc-fade pxc-fade-top';
      this._fadeTop = ft;
      this.body.prepend(ft);
    }
    if (!this._fadeBot) {
      const fb = document.createElement('div');
      fb.className = 'pxc-fade pxc-fade-bottom';
      this._fadeBot = fb;
      this.body.appendChild(fb);
    }
    const cs = getComputedStyle(this.body);
    if (cs.position === 'static') this.body.style.position = 'relative';
    this._boundUpdateFades = this._updateFades.bind(this);
    this._onWin('resize', this._boundUpdateFades);
    this._onBodyScroll('fade', this._boundUpdateFades);
    queueMicrotask(this._boundUpdateFades);
  }

  _updateFades() {
    // Update visibility of top/bottom fade elements based on current scroll position
    const el = this.body;
    const sh = el.scrollHeight;
    const ch = el.clientHeight;
    const st = el.scrollTop;
    const over = sh > ch + 1;
    const atTop = st <= 1;
    const atBottom = st + ch >= sh - 1;
    if (this._fadeTop) this._fadeTop.classList.toggle('show', over && !atTop);
    if (this._fadeBot) this._fadeBot.classList.toggle('show', over && !atBottom);
  }

  _updateFadeShadows() { 
    // Alias for _updateFades, kept for API/semantic clarity.
    this._updateFades(); 
  }

  _toggleFullscreen() { 
    //  Toggle fullscreen mode: enter if not active, exit if active.
    if (this.fullscreen) this._exitFullscreen(); 
    else this._enterFullscreen(); 
  }

  _enterFullscreen() {
    // Enter fullscreen mode: update state, lock scroll, add styles/classes and listen for ESC to exit.
    if (this.compressed) this._exitCompressed();
    this._fs = true;
    this.fullscreen = true;
    document.documentElement.classList.add('pxc-lock');
    document.body.classList.add('pxc-lock');
    this.root.classList.add('pxc-fullscreen');
    this._onEsc = (e) => { if (e.key === 'Escape') this._exitFullscreen(); };
    document.addEventListener('keydown', this._onEsc);
    if (this.opts.fade) this._updateFades();
    this._emit('fullscreen', { state:'enter', fullscreen:true });
  }

  _exitFullscreen() {
    // Exit fullscreen mode: restore state, remove classes, detach ESC listener, and update fades.
    this._fs = false;
    this.fullscreen = false;
    document.documentElement.classList.remove('pxc-lock');
    document.body.classList.remove('pxc-lock');
    this.root.classList.remove('pxc-fullscreen');
    if (this._onEsc) {
      document.removeEventListener('keydown', this._onEsc);
      this._onEsc = null;
    }
    if (this.opts.fade) this._updateFades();
    this._emit('fullscreen', { state:'exit', fullscreen:false });
  }

  _parseMarkSpec(spec, base) {
    // Parse a mark specification string (e.g., "1,3,5-8") into a Set of line numbers, using base as starting index.
    const s = new Set();
    if (!spec) return s;
    for (const part of spec.split(',')) {
      const p = part.trim();
      if (!p) continue;
      const m = p.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        const a = parseInt(m[1],10), b = parseInt(m[2],10);
        const [lo, hi] = a <= b ? [a,b] : [b,a];
        for (let n=lo; n<=hi; n++) s.add(n);
      } else {
        const n = parseInt(p,10);
        if (!isNaN(n)) s.add(n);
      }
    }
    return s;
  }

  _applyMarks() {
    // Apply marked line styling according to current mark specification across both highlighted and plain views.
    const spec = (this._markSpecOverride != null ? this._markSpecOverride : this.opts.markSpec || '').trim();
    const base = this.opts.lineNumbers ? (this.opts.lineNumbersStart || 1) : 1;
    const marks = this._parseMarkSpec(spec, base);
    const apply = (view) => {
      if (!view) return;
      const lines = view.querySelectorAll('.pxc-line');
      lines.forEach((lnEl, idx) => {
        const ln = lnEl.hasAttribute('data-ln')
          ? parseInt(lnEl.getAttribute('data-ln'), 10)
          : (base + idx);
        lnEl.classList.toggle('marked', marks.has(ln));
      });
    };
    apply(this.viewHL);
    apply(this.viewPlain);
  }

  mark(spec) {
    // Set a new mark specification (string or array of line numbers) and apply it to the views.
    if (Array.isArray(spec)) {
      this._markSpecOverride = spec
        .filter(n => Number.isFinite(n))
        .sort((a,b) => a-b)
        .join(',');
    } else if (typeof spec === 'string') {
      this._markSpecOverride = spec;
    } else {
      this._markSpecOverride = '';
    }
    this._applyMarks();
  }

  clearMark() {
    //Clear any existing mark specification and remove all marks.
    this._markSpecOverride = '';
    this._applyMarks();
  }

  goto(lineNumber, { behavior = 'smooth', offset = this.opts.searchOffsetPx } = {}) {
    // Scroll to a specific line number, aligning it in view. Supports smooth scrolling and offset adjustments.
    const view = this._getActiveView();
    if (!view) return;
    const base = this.opts.lineNumbers ? (this.opts.lineNumbersStart || 1) : 1;
    let targetEl = null;
    if (this.opts.lineNumbers) {
      targetEl = view.querySelector(`.pxc-line[data-ln="${lineNumber}"]`);
    }
    if (!targetEl) {
      const idx = Math.max(0, (lineNumber - base));
      const lines = view.querySelectorAll('.pxc-line:not(.pxc-fold-summary)');
      targetEl = lines[idx] || null;
    }
    if (!targetEl) return;
    let anchorEl = targetEl;
    if (anchorEl.classList.contains('pxc-folded')) {
      let p = anchorEl.previousElementSibling;
      while (p && !p.classList.contains('pxc-fold-start')) p = p.previousElementSibling;
      if (p) anchorEl = p;
    }
    const bodyRect = this.body.getBoundingClientRect();
    const lineRect = anchorEl.getBoundingClientRect();
    const top = (lineRect.top - bodyRect.top) + this.body.scrollTop - (offset ?? 0);
    const prefersNoMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.body.scrollTo({ top, behavior: prefersNoMotion ? 'auto' : behavior });
  }

  lockScroll(state = true) {
    //  Lock or unlock body scroll: hides overflow, prevents touch scrolling, and toggles CSS class to indicate locked state.
    if (state) {
      if (this._scrollLocked) return;
      this._scrollLocked = true;
      this._prevOverflow = this.body.style.overflow;
      this.body.style.overflow = 'hidden';
      this._preventTouch = (e) => e.preventDefault();
      this.body.addEventListener('touchmove', this._preventTouch, { passive: false });
      this.body.classList.add('pxc-scroll-locked');
    } else {
      if (!this._scrollLocked) return;
      this._scrollLocked = false;
      this.body.style.overflow = this._prevOverflow || 'auto';
      if (this._preventTouch) {
        this.body.removeEventListener('touchmove', this._preventTouch);
        this._preventTouch = null;
      }
      this.body.classList.remove('pxc-scroll-locked');
    }
  }

  async _toggleCompressed() {
    // Toggle compressed (collapsed) mode of the widget.
    if (this.compressed) await this._exitCompressed();
    else await this._enterCompressed();
  }

  async _enterCompressed(initial = false) {
    // Enter compressed mode: hide or slide up body/footer, update UI controls and apply fades.
    if (this.iconHost) {
      this.iconHost.querySelectorAll('button:not(.pxc-collapse)').forEach(b => {
        b.setAttribute('aria-hidden', 'true');
        b.setAttribute('tabindex', '-1');
      });
    }
    this.compressed = true;
    this.root.classList.add('pxc-compressed');
    if (initial) {
      this.body.style.display = 'none';
      if (this.footer) this.footer.style.display = 'none';
    } else {
      if (this.footer) this._slideUp(this.footer, { duration: 180 });
      await this._slideUp(this.body, { duration: 220 });
    }
    if (this.collapseBtn) {
      this.collapseBtn.setAttribute('aria-expanded', 'false');
      this.collapseBtn.title = this.t('ui.expand');
      this.collapseBtn?.querySelector('i')?.classList.add('active');
    }
    if (this.opts.fade) this._updateFades();
  }

  async _exitCompressed() {
    // Exit compressed mode: restore body/footer visibility, update controls and remove restrictions.
    this.compressed = false;
    this.root.classList.remove('pxc-compressed');
    this._slideDown(this.body, { duration: 220 });
    if (this.footer) await this._slideDown(this.footer, { duration: 180 });
    if (this.collapseBtn) {
      this.collapseBtn.setAttribute('aria-expanded', 'true');
      this.collapseBtn.title = this.t('ui.collapse');
      this.collapseBtn?.querySelector('i')?.classList.remove('active');
    }
    if (this.iconHost) {
      this.iconHost.querySelectorAll('button:not(.pxc-collapse)').forEach(b => {
        b.removeAttribute('aria-hidden');
        b.removeAttribute('tabindex');
      });
    }
    if (this.opts.fade) this._updateFades();
  }

  _getActiveView() { 
    // Return the currently active view element (highlighted or plain).
    return this.mode === 'hl' ? this.viewHL : this.viewPlain; 
  }

  _clearSearchHits() {
    // Clear all search hit markings from both views.
    ['viewHL','viewPlain'].forEach(k => {
      const v = this[k]; if (!v) return;
      v.querySelectorAll('.pxc-line.hit').forEach(e => { e.classList.remove('hit','curr'); });
    });
  }

  _applySearchHits(linesSet) {
    // Apply search hit highlighting to the given set of line numbers across both views, marking hits and clearing non-matches.
    const apply = (view) => {
      if (!view) return;
      const lines = view.querySelectorAll('.pxc-line');
      lines.forEach((lnEl, idx) => {
        const ln = lnEl.hasAttribute('data-ln')
          ? parseInt(lnEl.getAttribute('data-ln'), 10)
          : (this.opts.lineNumbers ? (this.opts.lineNumbersStart || 1) + idx : (1 + idx));
        if (linesSet.has(ln)) lnEl.classList.add('hit'); else lnEl.classList.remove('hit','curr');
      });
    };
    apply(this.viewHL); apply(this.viewPlain);
  }

  _searchScrollToIndex(i) {
    //  Scroll to the i-th search hit, mark it as current, and align it in the viewport with offset.
    const view = this._getActiveView();
    if (!view || !this._searchHits || !this._searchHits.length) return;
    view.querySelectorAll('.pxc-line.hit.curr').forEach(e=>e.classList.remove('curr'));
    const ln = this._searchHits[i];
    let el = null;
    if (this.opts.lineNumbers) el = view.querySelector(`.pxc-line[data-ln="${ln}"]`);
    if (!el) {
      const base = this.opts.lineNumbers ? (this.opts.lineNumbersStart || 1) : 1;
      el = view.querySelectorAll('.pxc-line')[ln - base] || null;
    }
    if (!el) return;
    el.classList.add('curr');
    const bodyRect = this.body.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const offset = (this._searchOffsetPx != null) ? this._searchOffsetPx : (this.opts.searchOffsetPx ?? 48);
    const top = (r.top - bodyRect.top) + this.body.scrollTop - offset;
    this.body.scrollTo({ top, behavior: 'smooth' });
  }

  async set(code, typed = false) {
    //  Replace the editor content with new code. Optionally simulate typed input with delays for animation.
    if (!this._suspendHistory) this._pushHistory('set');
    this._foldMap = null;
    const txt = String(code ?? '');
    if (!typed) {
      this._rebuildViewsFrom(txt, { format: true });
      return;
    }
    let acc = '';
    const delay = this._typingDelay();
    for (let i = 0; i < txt.length; i++) {
      acc += txt[i];
      this._rebuildViewsFrom(acc, { format: false });
      await this._delay(delay);
    }
    this._rebuildViewsFrom(acc, { format: !!this.opts.autoFormatAfterTyped });
    this._emit('edit', { op:'set', typed: !!typed, length: (this.viewText||'').length });
  }

  async loadFrom(url, { typed = false, signal } = {}) {
    // Fetch code from a remote URL and load it into the editor.
    try {
     const res = await fetch(url, { cache: 'no-store', signal });
     if (!res.ok) throw new Error(`HTTP ${res.status}`);
     const txt = await res.text();
     await this.set(txt, typed);
     if (!this.opts.filename) {
       const name = (url.split('/').pop() || 'snippet.txt').split('?')[0];
       this.opts.filename = name;
     }
     return txt;
    } catch (e) {
     this._toast?.(this.t('msg.wait') + ' ' + (e?.message || e));
     this._emit?.('edit', { op:'loadFrom', error:String(e) });
     throw e;
    }
  }

  async cursorInsert(text, typed = false) {
    // Insert text at the current cursor position.
    if (!this._suspendHistory) this._pushHistory('insert');
    this._foldMap = null;
    const ins = String(text ?? '');
    if (!this._cursorPos) {
      // Se il cursore non c'è, append in coda
      return this.append(ins, null, null, typed);
    }
    const base = this.viewText || '';
    const idx = this._indexFromLineCol(base, this._cursorPos.line, Math.max(0, this._cursorPos.col || 0));
    if (!typed) {
      const out = base.slice(0, idx) + ins + base.slice(idx);
      this._rebuildViewsFrom(out, { format: !!this.opts.autoFormatAfterTyped });
      this.moveCursor(this._cursorPos.line, this._cursorPos.col + ins.length);
      return;
    }
    let head = base.slice(0, idx), tail = base.slice(idx);
    const delay = this._typingDelay();
    for (let i = 0; i < ins.length; i++) {
      head += ins[i];
      this._rebuildViewsFrom(head + tail, { format: false });
      this.moveCursor(this._cursorPos.line, this._cursorPos.col + i + 1);
      await this._delay(delay);
    }
    const final = head + tail;
    this._rebuildViewsFrom(final, { format: !!this.opts.autoFormatAfterTyped });
    this._emit('edit', { op:'cursorInsert', typed: !!typed, line: this._cursorPos?.line, col: this._cursorPos?.col, delta: String(text||'').length, length: (this.viewText||'').length });
  }

  clear() {
    // Clear the editor content.
    if (!this._suspendHistory) this._pushHistory('clear');
    this._foldMap = null;
    this._rebuildViewsFrom('', { format: false });
    this._emit('edit', { op:'clear', typed: false, length: 0 });
  }

  async append(snippet, riga = null, colx = null, typed = false) {
    // Append a snippet of text at a given line/column or at the end.
    if (!this._suspendHistory) this._pushHistory('append'); 
    this._foldMap = null;
    const ins = String(snippet ?? '');
    let base = this.viewText || '';
    let idx;
    if (riga == null) {
      idx = base.length;
    } else {
      idx = this._indexFromLineCol(base, riga, Math.max(0, colx || 0));
    }
    if (!typed) {
      const out = base.slice(0, idx) + ins + base.slice(idx);
      this._rebuildViewsFrom(out, { format: false });
      if (this.opts.autoFormatAfterTyped) this._rebuildViewsFrom(out, { format: true });
      return;
    }
    // typed
    let accHead = base.slice(0, idx), tail = base.slice(idx);
    const delay = this._typingDelay();
    for (let i = 0; i < ins.length; i++) {
      accHead += ins[i];
      this._rebuildViewsFrom(accHead + tail, { format: false });
      await this._delay(delay);
    }
    const final = accHead + tail;
    this._rebuildViewsFrom(final, { format: !!this.opts.autoFormatAfterTyped });
    this._emit('edit', { op:'append', typed: !!typed, line: riga, col: colx, delta: String(snippet||'').length, length: (this.viewText||'').length });
  }

  async delete(riga, colx, coly, typed = false) {
    // Delete a range of text within a line, between colx and coly.
    if (!this._suspendHistory) this._pushHistory('delete'); 
    let base = this.viewText || '';
    const i0 = this._indexFromLineCol(base, riga, Math.max(0, colx || 0));
    const i1 = this._indexFromLineCol(base, riga, Math.max(0, coly || 0));
    const [a, b] = i0 <= i1 ? [i0, i1] : [i1, i0];
    if (!typed) {
      const out = base.slice(0, a) + base.slice(b);
      this._rebuildViewsFrom(out, { format: false });
      if (this.opts.autoFormatAfterTyped) this._rebuildViewsFrom(out, { format: true });
      return;
    }
    let head = base.slice(0, a), mid = base.slice(a, b), tail = base.slice(b);
    const delay = this._typingDelay();
    for (let i = mid.length - 1; i >= 0; i--) {
      mid = mid.slice(0, i);
      this._rebuildViewsFrom(head + mid + tail, { format: false });
      await this._delay(delay);
    }
    const final = head + tail;
    this._rebuildViewsFrom(final, { format: !!this.opts.autoFormatAfterTyped });
    this._emit('edit', { op:'delete', typed: !!typed, line: riga, from: colx, to: coly, length: (this.viewText||'').length });
  }

  showCursor(show = true) {
    // Show or hide the blinking text cursor.
    if (show) {
      this._ensureCaret();
      this._cursorVisible = true;
      this._caret.style.display = 'block';
      this._positionCaret();
    } else {
      this._cursorVisible = false;
      if (this._caret) this._caret.style.display = 'none';
    }
  }

  moveCursor(riga, colx = 0) {
    // Move the logical cursor to a specific line/column.
    const base = this.opts.lineNumbers ? (this.opts.lineNumbersStart || 1) : 1;
    this._cursorPos = { line: riga, col: Math.max(0, colx) };
    if (!this._cursorVisible) this.showCursor(true);
    this.goto(riga, { behavior: 'auto', offset: 6 });
    this._positionCaret();
  }

  /* 
  * Options:
  *  - caseSensitive, regex, wholeWord
  *  - inline: mark line hits
  *  - inlineHL: mark inline token parts
  *  - viewOffsetPx: vertical scroll offset
  *
  * - Highlights matching lines and optionally inline parts.
  * - Maintains list of hits and current search index.
  * - Emits a 'search' event with details.
  * - Returns number of hits found.
  */
  search(query, { caseSensitive = false, regex = false, wholeWord = false, inline = true, inlineHL = false, viewOffsetPx = null } = {}) {
    // Search for a query in the editor content.
    this._searchQuery = String(query ?? '');
    this._searchIndex = -1;
    this._searchHits  = [];
    this._searchOpts  = { caseSensitive, regex, wholeWord, inline, inlineHL };
    this._clearSearchHitParts();
    this._clearSearchHits();
    if (!this._searchQuery) { if (this.opts.fade) this._updateFades(); return 0; }
    let source;
    if (regex) source = this._searchQuery;
    else {
      source = this._searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) source = `\\b${source}\\b`;
    }
    const flags = caseSensitive ? 'g' : 'gi';
    let rx;
    try { rx = new RegExp(source, flags); }
    catch { console.warn('search: invalid regex'); return 0; }
    this._searchRxSource = source;
    this._searchRxFlags  = flags;
    this._searchOffsetPx = (viewOffsetPx != null) ? viewOffsetPx : this.opts.searchOffsetPx;
    const text  = this.viewText || '';
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const base  = this.opts.lineNumbers ? (this.opts.lineNumbersStart || 1) : 1;
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
      rx.lastIndex = 0;
      if (rx.test(lines[i])) hits.push(base + i);
    }
    this._searchHits = hits;
    this._applySearchHits(new Set(hits));
    if (inline && hits.length) {
      this._applySearchHitPartsPlain(rx);
      if (inlineHL) this._applySearchHitPartsHL(rx);
    }
    this._inlineIndex = -1;
    const parts = this._getInlineParts();
    if (parts.length) this._searchInlineFocus(0);

    if (hits.length) { this._searchIndex = 0; this._searchScrollToIndex(0); }
    if (this.opts.fade) this._updateFades();
    this._emit('search', {
      query: this._searchQuery,
      options: this._searchOpts,
      hits: hits.length,
      inlineParts: (this._getInlineParts?.() || []).length
    });
    if (hits.length > 0) this._haptic('searchHit');
    return hits.length;
  }

  async searchAsync(query, opts = {}) {
    // Asynchronous version of `search`.
    const hits = this.search(query, opts);
    await this._afterPaintCycles(1);
    await this._waitForScrollIdle(500);
    await this._afterPaintCycles(1);
    return hits;
  }

  async searchThenPopover(query, popoverOptions = {}, searchOptions = {}) {
    // Perform a search and, if there are hits, show a popover at the first match position.
    const hits = await this.searchAsync(query, searchOptions);
    if (!hits) return 0;
    const pos = this.getSearchPosition();
    if (pos) this.showPopover(pos.rectPage, popoverOptions);
    return hits;
  }

  searchNext() {
    // Advance to the next search hit in the list.
    if (!this._searchHits || !this._searchHits.length) return 0;
    this._searchIndex = (this._searchIndex + 1) % this._searchHits.length;
    this._searchScrollToIndex(this._searchIndex);
    return this._searchIndex + 1;
  }

  searchPrevious() {
    // Move to the previous search hit in the list.
    if (!this._searchHits || !this._searchHits.length) return 0;
    this._searchIndex = (this._searchIndex - 1 + this._searchHits.length) % this._searchHits.length;
    this._searchScrollToIndex(this._searchIndex);
    return this._searchIndex + 1;
  }

  searchNextInline() {
    // Advance to the next inline search match.
    const parts = this._getInlineParts();
    if (!parts.length) return 0;
    const next = (typeof this._inlineIndex === 'number' ? this._inlineIndex + 1 : 0);
    const n = this._searchInlineFocus(next);
    this._emit('search', {
      query: this._searchQuery || '',
      options: this._searchOpts || {},
      hits: (this._searchHits && this._searchHits.length) || 0,
      inlineParts: parts.length
    });
    return n;
  }

  searchPreviousInline() {
    // Move to the previous inline search match.
    const parts = this._getInlineParts();
    if (!parts.length) return 0;
    const prev = (typeof this._inlineIndex === 'number' ? this._inlineIndex - 1 : parts.length - 1);
    const n = this._searchInlineFocus(prev);
    this._emit('search', {
      query: this._searchQuery || '',
      options: this._searchOpts || {},
      hits: (this._searchHits && this._searchHits.length) || 0,
      inlineParts: parts.length
    });
    return n;
  }

  clearSearch() {
    // Clear current search state.
    this._clearSearchHitParts();   
    this._clearSearchHits();  
    this._searchQuery   = '';
    this._searchHits    = [];
    this._searchIndex   = -1;
    this._inlineIndex   = -1;
    this._searchOpts    = null;
    this._searchRxSource = null;
    this._searchRxFlags  = null;
    if (this.opts.fade) this._updateFades();
  }

  /*
  * - Returns bounding rectangles (viewport/page/container).
  * - Returns line number if determinable.
  * - Distinguishes between inline hit vs. line hit.
  * - Useful for popovers or UI overlays.
  */
  getSearchPosition({ preferInline = true } = {}) {
    // Get the position of the current search hit.
    const view = this._getActiveView();
    if (!view) return null;
    let el = null;
    if (preferInline) {
      el = view.querySelector('.pxc-hitpart.curr')
         || view.querySelector('.pxc-hitpart');
    }
    if (!el) {
      el = view.querySelector('.pxc-line.hit.curr')
         || view.querySelector('.pxc-line.hit');
    }
    if (!el) return null;
    let anchorEl = el;
    const lineEl = anchorEl.closest('.pxc-line');
    if (lineEl && anchorEl === lineEl) {
      anchorEl = lineEl.querySelector('.pxc-code') || lineEl;
    }
    const r = anchorEl.getBoundingClientRect();
    const scrollX = (window.visualViewport && typeof visualViewport.pageLeft === 'number')
      ? visualViewport.pageLeft : (window.scrollX || window.pageXOffset || 0);
    const scrollY = (window.visualViewport && typeof visualViewport.pageTop === 'number')
      ? visualViewport.pageTop : (window.scrollY || window.pageYOffset || 0);
    const rectViewport = { top:r.top, left:r.left, right:r.right, bottom:r.bottom, width:r.width, height:r.height };
    const rectPage     = { top:r.top+scrollY, left:r.left+scrollX, right:r.right+scrollX, bottom:r.bottom+scrollY, width:r.width, height:r.height };
    const cr = this.root.getBoundingClientRect();
    const rectInContainer = {
      top: r.top - cr.top,
      left: r.left - cr.left,
      right: r.right - cr.left,
      bottom: r.bottom - cr.top,
      width: r.width,
      height: r.height
    };
    let line = null;
    if (lineEl) {
      if (lineEl.hasAttribute('data-ln')) {
        line = parseInt(lineEl.getAttribute('data-ln'), 10);
      } else if (this.opts.lineNumbers) {
        const lines = Array.from(view.querySelectorAll('.pxc-line'));
        const idx = lines.indexOf(lineEl);
        const base = this.opts.lineNumbersStart || 1;
        if (idx >= 0) line = base + idx;
      }
    }
    return {
      type: anchorEl.classList.contains('pxc-hitpart') ? 'inline' : 'line',
      element: anchorEl,
      line,
      rectViewport,
      rectPage,
      rectInContainer
    };
  }

  setFontSize(px) {
    // Set the editor font size in pixels.
    const v = Math.max(this.opts.fontMin, Math.min(this.opts.fontMax, parseFloat(px)));
    if (!isFinite(v)) return;
    this.opts.fontSize = v;
    this._applyFont();
    if (this._cursorVisible) this._positionCaret();
    if (this.opts.fade) this._updateFades();
    this._updateRuler?.();
    return v;
  }

  zoomIn(step = this.opts.fontStep)  { 
    // Increase font size by a step amount.
    return this.setFontSize(this.opts.fontSize + step); 
  }
  
  zoomOut(step = this.opts.fontStep) { 
    // Decrease font size by a step amount.
    return this.setFontSize(this.opts.fontSize - step); 
  }

  resetZoom() {
    // Reset font size and line height to initial values.
    const fs = (this._fontSizeInitial != null) ? this._fontSizeInitial : 13.5;
    const lh = (this._fontLineHeightInitial != null) ? this._fontLineHeightInitial : 1.6;
    this.opts.fontSize = fs;
    this.opts.fontLineHeight = lh;
    this._applyFont();
    if (this._cursorVisible) this._positionCaret();
    if (this.opts.fade) this._updateFades();
    return { fontSize: fs, lineHeight: lh };
  }

  scrollUp(lines = 1) {
    // Smoothly scroll upward by a number of lines.
    const dy = this._lineHeightPx() * Math.max(0, lines);
    this.body.scrollBy({ top: -dy, behavior: 'smooth' });
    return this.body.scrollTop;
  }

  scrollDown(lines = 1) {
    // Smoothly scroll downward by a number of lines.
    const dy = this._lineHeightPx() * Math.max(0, lines);
    this.body.scrollBy({ top: dy, behavior: 'smooth' });
    return this.body.scrollTop;
  }

  toast(message, opts = {}) {
    // Show a toast notification with a given message and options.
    this._toast(message, opts);
  }

  /*
  * - Supports title, content, arrow direction, and auto-close timeout.
  * - Closes any existing popover before showing a new one.
  */
  showPopover(targetOrRect, options = {}) {
    // Display a popover dialog anchored to an element, selector, or rect.
    let anchorEl = null, rect = null;
    if (typeof targetOrRect === 'string') {
      const key = targetOrRect.trim().toLowerCase();
      if (key === 'container') {
        anchorEl = this.root;
      } else if (key === 'search') {
        const pos = this.getSearchPosition?.();
        if (pos) rect = pos.rectPage;
      } else {
        anchorEl = document.querySelector(targetOrRect) || null;
      }
    } else if (targetOrRect && targetOrRect.nodeType === 1) {
      anchorEl = targetOrRect;
    } else if (targetOrRect && typeof targetOrRect === 'object') {
      // {top,left,width,height}
      rect = targetOrRect.rectPage || targetOrRect; 
    }
    if (!anchorEl && !rect) {
      console.warn('showPopover: invalid target', targetOrRect);
      return;
    }
    this.closePopover(true);
    const pop = document.createElement('div');
    pop.className = 'popover';
    pop.setAttribute('role','dialog');
    pop.setAttribute('aria-modal','true');
    pop.style.zIndex = String(this._nextZ());
    const inner = document.createElement('div'); inner.className = 'popover-inner';
    if (options.title) {
      const t = document.createElement('div'); t.className = 'popover-title';
      t.innerHTML = (options.title instanceof HTMLElement) ? options.title.outerHTML : this._safeHTML(options.title);
      inner.appendChild(t);
    }
    if (options.content) {
      const c = document.createElement('div'); c.className = 'popover-content';
      if (options.content instanceof HTMLElement) c.appendChild(options.content);
      else c.innerHTML = this._safeHTML(options.content);
      inner.appendChild(c);
    }
    const arrow = document.createElement('div'); arrow.className = 'popover-arrow';
    inner.appendChild(arrow);
    pop.appendChild(inner);
    document.body.appendChild(pop);
    let direction = options.direction || 'top';
    pop.classList.add('arrow-' + direction);
    const place = () => {
      const vv = window.visualViewport;
      const pageLeft = vv && Number.isFinite(vv.pageLeft) ? vv.pageLeft : (window.pageXOffset || 0);
      const pageTop  = vv && Number.isFinite(vv.pageTop)  ? vv.pageTop  : (window.pageYOffset || 0);
      let tr;
      if (anchorEl) {
        const r = anchorEl.getBoundingClientRect();
        tr = {
          top: r.top + pageTop, left: r.left + pageLeft,
          width: r.width, height: r.height,
          right: r.left + pageLeft + r.width, bottom: r.top + pageTop + r.height
        };
      } else {
        tr = {
          top: rect.top, left: rect.left,
          width: rect.width || 0, height: rect.height || 0,
          right: (rect.left + (rect.width||0)),
          bottom: (rect.top + (rect.height||0))
        };
      }
      const pw = pop.offsetWidth, ph = pop.offsetHeight;
      const viewW = window.innerWidth, viewH = window.innerHeight;
      if (direction === 'top' && (tr.top - pageTop) - ph - 8 < 0) direction = 'bottom', pop.classList.replace('arrow-top','arrow-bottom');
      if (direction === 'bottom' && (tr.bottom - pageTop) + ph + 8 > viewH) direction = 'top', pop.classList.replace('arrow-bottom','arrow-top');
      let top, left;
      if (direction === 'top') {
        top  = tr.top - ph - 8;
        left = tr.left + tr.width/2 - pw/2;
      } else {
        top  = tr.bottom + 8;
        left = tr.left + tr.width/2 - pw/2;
      }
      const minX = pageLeft + 8, maxX = pageLeft + viewW - pw - 8;
      const minY = pageTop  + 8, maxY = pageTop  + viewH - ph - 8;
      left = Math.max(minX, Math.min(left, maxX));
      top  = Math.max(minY, Math.min(top,  maxY));
      pop.style.left = left + 'px';
      pop.style.top  = top  + 'px';
      const triggerCenter = tr.left + tr.width/2;
      const arrowOffset = Math.max(12, Math.min(triggerCenter - left - 8, pw - 24));
      if (direction === 'top' || direction === 'bottom') arrow.style.left = arrowOffset + 'px';
    };
    place();
    requestAnimationFrame(() => pop.classList.add('show'));
    const onDoc = (e) => { if (!pop.contains(e.target) && !(anchorEl && anchorEl.contains(e.target))) this.closePopover(); };
    const onKey = (e) => { if (e.key === 'Escape') this.closePopover(); };
    const onRes = () => place();
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onRes);
    const vv = window.visualViewport;
    const onVV = () => place();
    if (vv) { vv.addEventListener('resize', onVV); vv.addEventListener('scroll', onVV); }
    this._popEl = pop;
    this._popOff = () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onRes);
      if (vv) { vv.removeEventListener('resize', onVV); vv.removeEventListener('scroll', onVV); }
    };
    clearTimeout(this.state?.popoverTimeout);
    if (options.autoClose && typeof options.autoClose === 'number') {
      this.state ||= {};
      this.state.popoverTimeout = setTimeout(() => this.closePopover(), options.autoClose);
    }
  }

  closePopover(immediate = false) {
    // Close the current popover.
    try { if (this.state && this.state.popoverTimeout) clearTimeout(this.state.popoverTimeout); } catch {}
    if (typeof this._popOff === 'function') { try { this._popOff(); } catch {} this._popOff = null; }
    const pop = this._popEl || document.querySelector('.popover');
    if (!pop) return;
    this._popEl = null;
    if (immediate) { pop.remove(); return; }
    pop.classList.remove('show');
    const prefersNoMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => { if (pop.parentNode) pop.parentNode.removeChild(pop); }, prefersNoMotion ? 0 : 300);
  }

  loadSteps(steps=[], { autoplay = this.opts.playerAutoplay } = {}) {
    // Load a program (array of steps) into the player.
    this._player.steps = Array.isArray(steps)? steps.slice(): [];
    this._player.idx = -1;
    this._player.playing = false;
    this._player.paused = false;
    this._emit?.('player', { phase:'load', count:this._player.steps.length });
    if (autoplay && this._player.steps.length) this.playerPlay();
  }

  clearSteps(opts = {}) {
    // Clear all loaded player steps.
    const { stop = true, toast = false } = opts;
    if (stop && typeof this.playerStop === 'function') this.playerStop();
    if (Array.isArray(this._steps)) this._steps.length = 0;
    if (this.player && Array.isArray(this.player.steps)) this.player.steps.length = 0;
    if (typeof this._resetPlayerState === 'function') this._resetPlayerState();
    if (typeof this._updatePlayerUI === 'function') this._updatePlayerUI();
    if (typeof this.loadSteps === 'function') {
      try { this.loadSteps([]); } catch (_) {}
    }
    this._emit?.('steps:cleared');
    if (toast) this._toast({ text:'Programma rimosso', type:'info', ms:1000 });
  }

  playerPlay() {
    // Start playback of steps from current or first index.
    if (!this._player.steps.length) return;
    this._player.playing = true;
    this._player.paused = false;
    if (this._player.idx < 0) this._player.idx = 0; 
    this._emit?.('player', { phase:'play', index:this._player.idx });
    this._kickRunner(); 
  }

  playerResume() {
    // Resume playback from the current index.
    if (!this._player.steps.length) return;
    this._player.playing = true;
    this._player.paused = false;
    this._emit?.('player', { phase:'play', index:this._player.idx });
    this._kickRunner(); 
  }

  _kickRunner() {
    // Ensure the player runner loop is active; start if not already running.
    if (!this._runnerActive) this._runFromCurrent();
  }


  playerPause() {
    // Pause playback without resetting index.
    if (!this._player.playing) return;
    this._player.paused = true;
    this._emit?.('player', { phase:'pause', index:this._player.idx });
  }

  playerStop() {
    // Stop playback and reset index.
    this._player.playing = false;
    this._player.paused = false;
    this._player.idx = -1;
    if (this.opts.playerClosePopoverOnStop) {
      if (this.opts.playerStopHoldMs > 0) {
        setTimeout(() => this.closePopover?.(true), this.opts.playerStopHoldMs);
      } else {
        this.closePopover?.(true);
      }
    }
    this._emit?.('player', { phase:'stop' });
  }

  async playerNext() {
    // Advance to the next step in the sequence.
    if (!this._player?.steps?.length) return;
    if (this._player.busy) return;
    if (this._player.playing) { this._kickRunner(); return; }
    const total = this._player.steps.length;
    const cur = (typeof this._player.idx === 'number') ? this._player.idx : -1;
    const next = cur + 1;
    if (next >= total) {
      this._emit?.('player', { phase:'end', index: total ? total - 1 : -1 });
      this._syncProgress?.();
      return;
    }
    this._player.idx = next;
    this._runStepPreview?.();              
    await this._runStep(this._player.steps[next], next);
    this._syncProgress?.();
  }

  async playerPrev() {
    // Go back to the previous step in the sequence and run it once.
    if (!this._player?.steps?.length) return;
    if (this._player.busy) return;
    if (this._player.playing) { this._kickRunner(); return; }
    const prev = Math.max(0, (this._player.idx ?? -1) - 1);
    this._player.idx = prev;
    this._runStepPreview?.();
    await this._runStep(this._player.steps[prev], prev);
    this._syncProgress?.();
  }

  async playerGoto(indexOrLabel) {
    // Jump to a specific step by index or label.
    const idx = (typeof indexOrLabel==='number')
      ? indexOrLabel
      : this._player.steps.findIndex(s => s.label && s.label===indexOrLabel);
    if (idx<0) return false;
    this._player.idx = idx;
    if (this._player.playing) {
      this._runFromCurrent();
    } else {
      this._player.playing = true;
      this._player.paused  = false;
      this._emit?.('player', { phase:'play', index:this._player.idx });
      await this._runStepOnce();
      this.playerPause();
    }
    return true;
  }

  getOption(key) { 
    // Retrieve a single option value by key.
    return this.opts[key]; 
  }
  
  getOptions() { 
    // Get a shallow copy of all current options.
    return Object.assign({}, this.opts); 
  }

  getText(kind = 'view') {
    // Get editor content as string: 'view': visible text, 'raw': original raw text.
    return kind === 'raw' ? this._getRawText() : (this.viewText || '');
  }

  getState() {
    // Capture the full editor state into a serializable object.
    const o = this.opts || {};
    const state = {
      version: '1',
      timestamp: Date.now(),
      content: this._getRawText(),
      lang: this.lang || 'auto',
      mode: this.mode || 'plain',              
      opts: {
        wrap: !!o.wrap,
        tabSize: o.tabSize || 2,
        tabs: o.tabs || 'both',
        lineNumbers: o.lineNumbers !== false,
        lineNumbersStart: o.lineNumbersStart || 1,
        height: o.height ?? null,
        maxHeight: o.maxHeight ?? null,
        fade: !!o.fade,
        download: !!o.download,
        downloadContent: o.downloadContent || 'raw',
        filename: o.filename || '',
        footerControls: Array.isArray(o.footerControls) ? o.footerControls.slice() : (o.footerControls || ''),
        footerAlign: o.footerAlign || 'between',
        playerAutoplay: !!o.playerAutoplay,
        playerLoop: !!o.playerLoop,
        playerButtons: !!o.playerButtons,
        playerProgress: !!o.playerProgress,
        playerShowNotes: !!o.playerShowNotes,
        playerWaitAfterActionMs: o.playerWaitAfterActionMs || 0,
        playerClosePopoverOnStop: !!o.playerClosePopoverOnStop,
        playerStopHoldMs: o.playerStopHoldMs || 0,
        haptics: o.haptics || 'auto',
        historyLimit: o.historyLimit || 100
      },
      fontSize: this._getFontSize(),
      scrollTop: this.body.scrollTop || 0,
      cursor: this._cursorPos ? { line: this._cursorPos.line, col: this._cursorPos.col } : null,
      compressed: !!this.compressed,
      fullscreen: !!this._fs,
      marks: { lines: this._getMarkedLines() },
      search: this._searchQuery
        ? {
            query: this._searchQuery || '',
            options: Object.assign({}, this._searchOpts || {}),
            index: (typeof this._searchIndex === 'number' && this._searchIndex >= 0) ? this._searchIndex : 0
          }
        : null
    };
    return state;
  }

  getStateJSON(pretty = false) {
    // Serialize current state into JSON.
    const s = this.getState();
    return JSON.stringify(s, null, pretty ? 2 : 0);
  }

  /*
  * - Can merge options or reset defaults.
  * - Applies content, cursor, marks, search, compressed/fullscreen state.
  * - Returns true on success.
  */
  async setState(state, opts = {}) {
    // Restore editor state from an object.
    if (!state || typeof state !== 'object') return false;
    const {
      mergeOptions = true,
      applyContent = true,
      reSearch = true,
      allowFullscreen = false
    } = opts;
    this.playerPause?.();
    this.closePopover?.(true);
    if (!this._suspendHistory) this._pushHistory?.('setState');
    if (mergeOptions) this.setOptions?.(state.opts || {});
    else {
      this.setOptions?.({
        wrap:false, tabSize:2, tabs:'both', lineNumbers:true, lineNumbersStart:1,
        height:null, maxHeight:null, fade:false,
        download:false, downloadContent:'raw', filename:'',
        footerControls:'', footerAlign:'between',
        playerAutoplay:false, playerLoop:false, playerButtons:true,
        playerProgress:true, playerShowNotes:true, playerWaitAfterActionMs:0,
        playerClosePopoverOnStop:false, playerStopHoldMs:0,
        haptics:'auto', historyLimit:100
      });
      if (state.opts) this.setOptions?.(state.opts);
    }
    if (state.lang) this.setOption?.('lang', state.lang);
    if (state.mode) this.setOption?.('highlight', state.mode === 'hl');
    if (applyContent && typeof state.content === 'string') {
      this.set?.(state.content, false); 
    } else {
      this._rebuildViewsFromRaw?.({ keepMode: true });
    }
    if (state.fontSize) this.setFontSize?.(state.fontSize);
    if (typeof state.scrollTop === 'number') this.body.scrollTop = state.scrollTop;
    if (state.cursor && typeof state.cursor.line === 'number') {
      this.moveCursor?.(state.cursor.line, state.cursor.col || 0);
    }
    this.clearMark?.();
    if (state.marks && Array.isArray(state.marks.lines) && state.marks.lines.length) {
      this.mark?.(state.marks.lines, 'mark-ok'); 
    }
    if (reSearch && state.search && state.search.query) {
      const hits = await (this.searchAsync?.(state.search.query, state.search.options || {}) || Promise.resolve(0));
      if (hits && typeof state.search.index === 'number' && state.search.index > 0) {
        for (let i=1; i<=state.search.index; i++) this.searchNextInline?.();
      }
    }
    if (typeof state.compressed === 'boolean') {
      if (state.compressed && !this.compressed) await this._enterCompressed();
      if (!state.compressed && this.compressed) await this._exitCompressed();
    }
    if (allowFullscreen && typeof state.fullscreen === 'boolean') {
      if (state.fullscreen && !this._fs) this._enterFullscreen?.();
      if (!state.fullscreen && this._fs) this._exitFullscreen?.();
    }
    this._applyMode?.();
    this._applyLineNumbersVisibility?.();
    this._applyTabSize?.();
    this._updateFadeShadows?.();
    this._reapplyInlineHitsCurrentView?.();
    return true;
  }

  async setStateJSON(json, opts = {}) {
    // Restore state from a JSON string.
    try {
      const obj = JSON.parse(String(json || '{}'));
      return await this.setState(obj, opts);
    } catch(e) {
      console.warn('setStateJSON: invalid JSON', e);
      return false;
    }
  }

  setOption(key, value) {
    // Apply a single option update by key.
    switch (key) {
      case 'wrap':
        return this.setWrap(!!value);
      case 'showTokens': {
        this.opts.showTokens = !!value;
        this.root.classList.toggle('pxc-show-tokens', this.opts.showTokens);
        return;
      }
      case 'theme':
        this.setTheme(value);
        return;
      case 'tabSize':
        this.opts.tabSize = parseInt(value, 10) || 2;
        if (this.opts.tabs !== 'none' || this.opts.autoIndent) {
          this._rebuildViewsFrom?.(this.rawOriginal, { format: true });
          this._updateRuler?.();
        } else {
          this._applyTabSize?.();
        }
        return;
      case 'tabs': 
        this.opts.tabs = String(value || 'both');
        this._rebuildViewsFromRaw({ keepMode: true });
        return;
      case 'floatBar': {
        const on = !!value;
        this.opts.floatBar = on;
        if (on) this.showFloatBar(); else this.hideFloatBar();
        return;
      }
      case 'toolbarVisible': {
        this.opts.toolbarVisible = !!value;
        this._applyToolbarVisibility?.();
        return;
      }
      case 'floatBarControls': {
        this.opts.floatBarControls = Array.isArray(value)
          ? value.slice()
          : String(value||'').split(',').map(s=>s.trim()).filter(Boolean);
        if (this._floatbar) { this._destroyFloatBar(); this._setupFloatBar(); }
        return;
      }
      case 'floatBarInFullscreen':
        this.opts.floatBarInFullscreen = !!value; return;
      case 'floatBarRemember':
        this.opts.floatBarRemember = !!value; return;
      case 'ruler':
        this.opts.ruler = !!value;
        this._setupRuler();
        return;
      case 'rulerStyle':
        this.opts.rulerStyle = (value === 'full') ? 'full' : 'tens';
        this._updateRuler?.();
        return;
      case 'rulerPosition':
        this.opts.rulerPosition = (value === 'bottom') ? 'bottom' : 'top';
        this._repositionRuler?.();
        this._updateRuler?.();
        return;
      case 'lang': { 
        const v = String(value || 'auto').toLowerCase();
        if (v === 'auto') {
          const raw =
            (typeof this.rawOriginal === 'string')
              ? this.rawOriginal
              : (this.body.querySelector('.pxc-raw-store')?.value || '');
          this.lang = this._detect(raw);
        } else {
          this.lang = v;
        }
        this._rebuildViewsFromRaw({ keepMode: true });
        return;
      }
      case 'highlight': { 
        const on = !!value;
        this.mode = on ? 'hl' : 'plain';
        this._applyMode();
        this._reapplyInlineHitsCurrentView?.();
        this._emit?.('toggleHL', { mode:this.mode });
        return;
      }
      case 'lineNumbers':
        this.opts.lineNumbers = !!value;
        this._applyLineNumbersVisibility();
        //this._rebuildViewsFromRaw?.({ keepMode: true });
        this._updateRuler?.();
      return;
      case 'lineNumbersStart':
        this.opts.lineNumbersStart = parseInt(value,10) || 1;
        // serve ricostruire per aggiornare data-ln
        this._rebuildViewsFrom?.(this.rawOriginal, { format: true });
        return;
      case 'height':
        this.opts.height = value;
        this._applyHeights();
        return;
      case 'maxHeight':
        this.opts.maxHeight = value;
        this._applyHeights();
        return;
      case 'fade': {
        const on = !!value;
        this.opts.fade = on;
        this._updateFadeShadows?.();
        return;
      }
      case 'download':
        this.opts.download = !!value; return;
      case 'downloadContent':
        this.opts.downloadContent = (value==='raw'?'raw':'view'); return;
      case 'filename':
        this.opts.filename = String(value || 'snippet.txt'); return;
      case 'footerControls': {
        // rimuovi barra esistente e ricrea
        this.opts.footerControls = Array.isArray(value)
          ? value.slice()
          : String(value||'').split(',').map(s=>s.trim()).filter(Boolean);
        if (this.footer) {
          const old = this.footer.querySelector('.pxc-footbar');
          if (old) old.remove();
          this._setupFooterControls();
        }
        return;
      }
      case 'footerAlign':
        this.opts.footerAlign = String(value || 'between');
        if (this.footer) {
          this.footer.classList.remove('start','center','between','end');
          this.footer.classList.add(this.opts.footerAlign);
        }
        return;
      case 'playerAutoplay':
      case 'playerLoop':
      case 'playerButtons':
      case 'playerProgress':
      case 'playerShowNotes':
      case 'playerWaitAfterActionMs':
      case 'playerClosePopoverOnStop':
      case 'playerStopHoldMs':
        this.opts[key] = value;
        return;
      case 'haptics':
        this.opts.haptics = (value==='off') ? 'off' : 'auto';
        return;
      case 'historyLimit':
        this.opts.historyLimit = parseInt(value,10) || 0;
        this._hist.limit = this.opts.historyLimit;
        return;
      default:
        this.opts[key] = value;
    }
  }

  setOptions(partial) {
    // Apply multiple options at once.
    if (!partial || typeof partial !== 'object') return;
    const order = [
      'lang','wrap','tabSize','tabs',
      'lineNumbers','lineNumbersStart',
      'height','maxHeight','fade',
      'download','downloadContent','filename',
      'footerControls','footerAlign',
      'floatBar','floatBarControls','floatBarInFullscreen','floatBarRemember','floatBarToggleInHeader',
      'playerAutoplay','playerLoop','playerButtons','playerProgress','playerShowNotes','playerWaitAfterActionMs','playerClosePopoverOnStop','playerStopHoldMs',
      'haptics','historyLimit','highlight'
    ];
    const keys = Object.keys(partial).sort((a,b)=>order.indexOf(a)-order.indexOf(b));
    keys.forEach(k => this.setOption(k, partial[k]));
  }

  option(k, v) { 
    // Alias for setOption.
    return this.setOption(k, v); 
  }
  
  options(obj) { 
    // Alias for setOptions.
    return this.setOptions(obj); 
  }

  showRuler(on = true) { 
    // Enable or disable the column ruler display.
    this.setOption('ruler', !!on); 
  }

  toggleRuler() { 
    // Toggle ruler visibility.
    this.setOption('ruler', !this.opts.ruler); 
  }

  setRulerStyle(style = 'tens') {
    // Set the ruler tick style: 'tens' or 'full'.
    this.setOption('rulerStyle', style === 'full' ? 'full' : 'tens');
  }

  setRulerPosition(pos = 'top') {
    // Set vertical position of the ruler: 'top' or 'bottom'.
    this.setOption('rulerPosition', pos === 'bottom' ? 'bottom' : 'top');
  }

  showRule(on = true) { 
    // Alias for showRuler.
    return this.showRuler(on); 
  }

  showLineNumbers(on = true) { 
    // Enable or disable line number display.
    this.setOption('lineNumbers', !!on); 
  }

  toggleLineNumbers() { 
    // Toggle line numbers on or off.
    this.setOption('lineNumbers', !this.opts.lineNumbers); 
  }

  setLineNumbersStart(n = 1) { 
    // Set the starting number for line numbering.
    this.setOption('lineNumbersStart', (n|0) || 1); 
  }

  setHighlight(on = true) { 
    // Enable or disable syntax highlighting mode.
    this.setOption('highlight', !!on); 
  }

  toggleHighlight() { 
    // Toggle between highlighted and plain modes.
    this.setOption('highlight', !(this.mode === 'hl')); 
  }

  setLang(lang = 'auto') { 
    // Set language for syntax highlighting. 'auto' triggers automatic detection.
    this.setOption('lang', lang); 
  }

  setTabSize(n = 2) { 
    // Set tab size (spaces per tab).
    this.setOption('tabSize', parseInt(n,10) || 2); 
  }

  setTabsMode(mode='both') { 
    // Control how TAB characters expand
    this.setOption('tabs', mode); 
  } 

  setHeights({ height = null, maxHeight = null } = {}) {
    // Set fixed height and/or maximum height for editor body.
    this.setOption('height', height);
    this.setOption('maxHeight', maxHeight);
  }

  showFade(on = true) { 
    // Enable or disable top/bottom fade overlays.
    this.setOption('fade', !!on); 
  }
  
  downloadEnabled(on=true) { 
    // Enable or disable download functionality.
    this.setOption('download', !!on); 
  }
  
  setFilename(name='') { 
    // Set the default filename used for downloads.
    this.setOption('filename', String(name||'')); 
  }
  
  setDownloadContent(kind='view') { 
    // Set what content is downloaded: 'raw' or 'view'.
    this.setOption('downloadContent', kind === 'raw' ? 'raw' : 'view'); 
  }

  persistDataAttrs() {
    // Persist current options into container dataset attributes. Keeps HTML in sync with runtime configuration.
    const d = this.root.dataset;
    const o = this.opts;
    d.theme = o.theme || 'dark';
    d.lang = this.lang;
    d.toolbarVisible = String(!!o.toolbarVisible);
    d.wrap = String(!!o.wrap);
    d.tabsize = String(o.tabSize||2);
    d.tabs = o.tabs || 'both';
    d.highlight = String(this.mode==='hl');
    d.linenumbers = String(!!o.lineNumbers);
    d.linenumbersStart = String(o.lineNumbersStart||1);
    if (o.height!=null) d.height = String(o.height);
    if (o.maxHeight!=null) d.maxheight = String(o.maxHeight);
    d.fade = String(!!o.fade);
    d.download = String(!!o.download);
    d.downloadContent = o.downloadContent || 'raw';
    d.filename = o.filename || '';
    d.footerControls = Array.isArray(o.footerControls) ? o.footerControls.join(',') : (o.footerControls||'');
    d.footerAlign = o.footerAlign || 'between';
    d.playerAutoplay = String(!!o.playerAutoplay);
    d.playerLoop = String(!!o.playerLoop);
    d.playerButtons = String(!!o.playerButtons);
    d.playerProgress = String(!!o.playerProgress);
    d.playerShowNotes = String(!!o.playerShowNotes);
    d.playerDelay = String(o.playerWaitAfterActionMs||0);
    d.playerClosePopoverOnStop = String(!!o.playerClosePopoverOnStop);
    d.playerStopHoldMs = String(o.playerStopHoldMs||0);
    d.haptics = o.haptics || 'auto';
    d.historyLimit = String(o.historyLimit||0);
  }

  async _runFromCurrent() {
    // Execute steps continuously from current index while playing.
    if (!this._player.playing) return;
    if (this._runnerActive) return;
    this._runnerActive = true;
    try {
      while (this._player.playing) {
        for (; this._player.idx < this._player.steps.length; this._player.idx++) {
          if (!this._player.playing) break;
          if (this._player.paused) {
            await this._waitWhilePaused();
            if (!this._player.playing) break;
          }
          const step = this._player.steps[this._player.idx];
          if (this.opts.playerShowNotes && step.note) {
            this.setFooterText?.(step.note, '.text-start');
          }
          this._emit?.('player', { phase:'stepStart', index:this._player.idx, step, note: step.note || null });
          this._player.busy = true;
          try {
            await this._runStep(step, this._player.idx);
          } finally {
            this._player.busy = false;
          }
          this._emit?.('player', { phase:'stepEnd', index:this._player.idx, step });
          this._haptic('step');
        }
        // Fine script
        const total = this._player.steps.length;
        if (this.opts.playerLoop && total > 0 && this._player.playing) {
          // ricomincia senza ricorsione
          this._player.idx = 0;
          this._emit?.('player', { phase:'play', index:this._player.idx }); // utile per UI (progress, pulsanti)
          continue;
        }
        // Pausa a fine programma
        this._player.idx = total ? Math.min(this._player.idx, total - 1) : -1;
        this._emit?.('player', { phase:'end', index:this._player.idx });
        this._player.playing = false;
        this._player.paused  = true;
        this._emit?.('player', { phase:'pause', index:this._player.idx });
        break;
      }
    } finally {
      this._runnerActive = false;
    }
  }

  async _runStepOnce() {
    // Execute the current step once, advance index.
    if (!this._player.steps.length) return;
    const total = this._player.steps.length;
    const i = Math.max(0, Math.min(this._player.idx < 0 ? 0 : this._player.idx, total - 1));
    const step = this._player.steps[i];
    if (this.opts.playerShowNotes && step.note) {
      this.setFooterText?.(step.note, '.text-start');
    }
    this._emit?.('player', { phase:'stepStart', index:i, step, note: step.note || null });
    this._player.busy = true;
    try {
      await this._runStep(step, i);
    } finally {
      this._player.busy = false;
    }
    this._emit?.('player', { phase:'stepEnd', index:i, step });
    this._player.idx = Math.min(i + 1, total - 1);
    this._emit?.('player', { phase:'preview', index:this._player.idx });
    this._syncProgress?.();
  }

  _runStepPreview() {
    // Emit a preview event for the current step without executing it.
    const step = this._player.steps[this._player.idx];
    this._emit?.('player', { phase:'preview', index:this._player.idx, step });
  }

  async _waitWhilePaused() {
    // Await while the player is paused, polling until resumed.
    while (this._player.paused && this._player.playing) await this._delay(80);
  }

  /*
  * - Supports waitBefore/After delays, pause actions,
  *   string/function actions, popups, toasts, and questions.
  * - Emits lifecycle events and manages UI accordingly.
  */
  async _runStep(step, idx) {
    // Execute a single step.
    if (this._stepRunning) return;      
    this._stepRunning = true;
    this._disableFootbar?.(true);       
    let autoClosePopup = false;         
    try {
      this.closePopover?.(true);
      const pre = (step.waitBeforeMs ?? step.waitMsBefore);
      if (pre) await this._delay(pre);
      if (step.pause === true) { this.playerPause(); await this._waitWhilePaused(); }
      if (typeof step.action === 'function') {
        await step.action.call(this, this, step.args || {}, idx);
      } else if (typeof step.action === 'string') {
        await this._runNamedAction(step.action, step.args || {});
      }
      if (step.popup) {
        const p = step.popup;
        let target = null;
        if (p.target === 'search') {
          const pos = this.getSearchPosition?.();
          if (pos) target = pos.rectPage;
        } else if (typeof p.target === 'string' || (p.target && p.target.nodeType === 1)) {
          target = p.target;
        } else if (p.target && typeof p.target === 'object') {
          target = p.target;
        }
        if (target) {
          this.showPopover(target, {
            title: p.title || '',
            content: p.content || '',
            direction: p.direction || 'bottom',
            autoClose: p.autoClose
          });
          autoClosePopup = !!p.autoClose; 
        }
      }
      if (step.toast) {
        if (typeof step.toast === 'string') this._toast(step.toast);
        else this._toast(step.toast.text || '', step.toast);
      }
      if (step.question) {
        const q = step.question;
        const pos = this.getSearchPosition?.();
        const target = q.target || (pos && pos.rectPage) || ('#' + this.root.id);
        const wrap = document.createElement('div');
        wrap.style.maxWidth = '280px';
        wrap.classList?.add('pxc-popover');
        wrap.innerHTML = `
          <div>${this._safeHTML(q.text || this.t('ui.popover.sure'))}</div>
          <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end">
            <button class="pxc-q-no">${this._safeHTML(q.noText || this.t('ui.popover.no'))}</button>
            <button class="pxc-q-yes">${this._safeHTML(q.yesText || this.t('ui.popover.yes'))}</button>
          </div>`;
        this.showPopover(target, { title: q.title || this.t('ui.popover.question'), content: wrap, direction: q.direction || 'bottom' });
        const yesBtn = wrap.querySelector('.pxc-q-yes');
        const noBtn  = wrap.querySelector('.pxc-q-no');
        const ans = await new Promise(resolve => {
          yesBtn?.addEventListener('click', () => resolve(true),  { once:true });
          noBtn ?.addEventListener('click', () => resolve(false), { once:true });
        });
        this.closePopover?.();
        if (ans) {
          if (q.yes?.footerText) this.setFooterText(q.yes.footerText, q.yes.footerSelector || '.text-start');
          if (q.yes?.goto != null) this._player.idx = (parseInt(q.yes.goto,10) - 1);
        } else {
          if (q.no?.footerText) this.setFooterText(q.no.footerText, q.no.footerSelector || '.text-start');
          if (q.no?.goto != null) this._player.idx = (parseInt(q.no.goto,10) - 1);
        }
      }
      const post = (step.waitMs ?? step.waitAfterMs) ?? this.opts.playerWaitAfterActionMs;
      if (post) await this._delay(post);
    } finally {
      this._disableFootbar?.(false);
      this._stepRunning = false;
      if (autoClosePopup) this.closePopover?.();
    }
  }

  _disableFootbar(lock = true) {
    // Disable or re-enable footer control buttons.
    const bar = this.footer?.querySelector('.pxc-footbar');
    if (!bar) return;
    const buttons = Array.from(bar.querySelectorAll('button.pxc-fbtn'));
    if (lock) {
      buttons.forEach(b => {
        if (!b.hasAttribute('data-prev-disabled')) {
          b.setAttribute('data-prev-disabled', b.disabled ? '1' : '0');
        }
        if (!b.classList.contains('pxc-pause')) {
          b.disabled = true;
        }
      });
    } else {
      buttons.forEach(b => {
        const prev = b.getAttribute('data-prev-disabled');
        if (prev != null) {
          b.disabled = (prev === '1');
          b.removeAttribute('data-prev-disabled');
        } else {
          b.disabled = false;
        }
      });
    }
  }

  _waitForTap({
    // Show a popover prompting the user to tap/click to continue.
    text = this.t('ui.popover.tap'),
    title = this.t('ui.popover.continue'),
    direction = 'bottom',
    target = 'container',
    autoClose = 0
  } = {}) {
    return new Promise(resolve => {
      const tgt = (target === 'search')
        ? (this.getSearchPosition?.()?.rectPage || '#'+this.root.id)
        : (target === 'container' ? '#'+this.root.id : target);
      const wrap = document.createElement('div');
      wrap.style.maxWidth = '260px';
      wrap.classList?.add('pxc-popover');
      wrap.innerHTML = `
        <div>${this._safeHTML(text)}</div>
        <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:8px">
          <button class="pxc-tap-continue">${this.t('ui.popover.continue')}</button>
        </div>`;
      this.showPopover(tgt, { title, content: wrap, direction, autoClose });
      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        try { this.closePopover?.(); } catch {}
        this.root.removeEventListener('click', onRootTap, captureOpts);
        btn?.removeEventListener('click', onBtn, { once:true });
        resolve(true);
      };
      const btn = wrap.querySelector('.pxc-tap-continue');
      const onBtn = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._haptic?.('tap');
        cleanup();
      };
      btn?.addEventListener('click', onBtn, { once:true });
      const captureOpts = { once:true, capture:true, passive:true };
      const onRootTap = (e) => {
        if (wrap.contains(e.target)) return;
        this._haptic?.('tap');
        cleanup();
      };
      this.root.addEventListener('click', onRootTap, captureOpts);
    });
  }

  _snapshot() {
    // Take a snapshot of the current editor state for undo/redo.
    return {
      text: this._getRawText ? this._getRawText() : (this.body.querySelector('.pxc-raw-store')?.value || ''),
      mode: this.mode,
      wrap: !!this.opts.wrap,
      fontSize: this._fontSize || 13.5,
      scrollTop: this.body.scrollTop,
      cursor: this._cursorPos ? { line:this._cursorPos.line, col:this._cursorPos.col } : null,
    };
  }
  
  _restoreSnap(s) {
    // Restore a previously saved snapshot into the editor.
    this._suspendHistory = true;
    try {
      this.set?.(s.text, false);
      this.mode = s.mode; this.opts.wrap = !!s.wrap; this._applyMode();
      if (this.setFontSize) this.setFontSize(s.fontSize);
      this.body.scrollTop = s.scrollTop;
      if (s.cursor) this.moveCursor?.(s.cursor.line, s.cursor.col);
      this._reapplyInlineHitsCurrentView?.();
    } finally { this._suspendHistory = false; }
    this._emit?.('edit', { op:'restore' });
  }
  
  _pushHistory(tag) {
    // Push a new snapshot into the undo history stack.
    const snap = this._snapshot();
    const u = this._hist.undo; u.push({ snap, tag, ts: Date.now() });
    if (u.length > this._hist.limit) u.shift();
    this._hist.redo.length = 0; 
  }
  
  canUndo() { 
    // Check if undo history has at least one snapshot.
    return (this._hist.undo.length > 0); 
  }
  
  canRedo() { 
    // Check if redo history has at least one snapshot.
    return (this._hist.redo.length > 0); 
  }
  
  undo() {
    // Undo the last change by restoring the previous snapshot.
    if (!this.canUndo()) return false;
    const cur = this._snapshot();
    const prev = this._hist.undo.pop();
    this._hist.redo.push({ snap:cur, tag:'redo', ts:Date.now() });
    this._restoreSnap(prev.snap);
    this._haptic('undo');
    return true;
  }

  redo() {
    // Redo the last undone change by restoring from redo stack.
    if (!this.canRedo()) return false;
    const cur = this._snapshot();
    const next = this._hist.redo.pop();
    this._hist.undo.push({ snap:cur, tag:'undo', ts:Date.now() });
    this._restoreSnap(next.snap);
    this._haptic('redo');
    return true;
  }

  setWrap(on) {
    // Enable or disable line wrapping mode.
    const val = !!on;
    if (this.opts.wrap === val) return;
    this.opts.wrap = val;
    this._applyMode();
    this._reapplyInlineHitsCurrentView?.();
  }

  toggleWrap() { 
    // Toggle line wrapping mode on/off.
    this.setWrap(!this.opts.wrap); 
  }

  /*
  * Supports editing actions (set, append, delete, cursorInsert, moveCursor, goto, etc.),
  * UI actions (toast, popover, fullscreen), and search/mark actions.
  * Falls back to invoking a method with the same name if defined.
  */
  async _runNamedAction(name, args) {
    // Execute a named action by string identifier.
    switch (name) {
      case 'set':           return this.set?.(args.code||'', !!args.typed);
      case 'append':        return this.append?.(args.code||'', args.line ?? null, args.col ?? null, !!args.typed);
      case 'delete':        return this.delete?.(args.line||1, args.from||0, args.to||0, !!args.typed);
      case 'cursorInsert':  return this.cursorInsert?.(args.code||'', !!args.typed);
      case 'moveCursor':    return this.moveCursor?.(args.line||1, args.col||0);
      case 'goto':
        if (args && 'label' in args) {
          return this.playerGoto?.(args.label || 1);
        } else if (args && 'line' in args) {
          return this.goto?.(args.line || 1, { behavior: 'smooth' });
        }
      case 'waitForTap':    return this._waitForTap(args || {});
      case 'search':        return this.searchAsync?.(args.query||'', args.options||{});
      case 'searchThenPopover':
        await this.searchAsync?.(args.query||'', args.options||{});
        const pos = this.getSearchPosition?.(); if (pos) this.showPopover(pos.rectPage, args.popover||{ title:'Info', content:'', direction:'bottom' });
        return;
      case 'mark':          return this.mark?.(args.lines||[], args.className||'');
      case 'clearMark':     return this.clearMark?.();
      case 'wait': {
        const ms = (args && typeof args.ms === 'number')
          ? args.ms
          : (typeof args === 'number' ? args : 0);
        return this._delay(ms);
      }
      case 'lockScroll':    return this.lockScroll?.(!!args.lock);
      case 'focus':
        return this.focusLines?.(args.start||1, args.end||1, args||{});
      case 'clearFocus':
        return this.clearFocus?.();
      case 'highlightRange': {
        const from = {
          line: (args?.from?.line ?? args?.sLine ?? 1)|0,
          col:  (args?.from?.col  ?? args?.sCol  ?? 0)|0
        };
        const to = {
          line: (args?.to?.line   ?? args?.eLine ?? from.line)|0,
          col:  (args?.to?.col    ?? args?.eCol  ?? from.col)|0
        };
        // className opzionale: accetta ancora "pxc-rangehl" per retro-compat
        const className = (args?.className || '').trim();
        return this.addRangeHighlight?.({ from, to, className });
      }
      case 'clearHighlightRange':
        return this.clearRangeHighlights?.(args?.id ?? null);

      case 'toggleHL':
        this.mode = (this.mode === 'hl') ? 'plain' : 'hl'; this._applyMode(); this._reapplyInlineHitsCurrentView?.(); this._emit?.('toggleHL',{mode:this.mode}); return;
      case 'fullscreen':    return (args.on ? this._enterFullscreen?.() : this._exitFullscreen?.());
      case 'showPopup':     return this.showPopover?.(args.target||('#'+this.root.id), args.options||{});
      case 'clearPopup':    return this.closePopover?.(true);
      case 'toast':         return this._toast?.(args?.text || args?.message || '', args);
      default:
        // Metodo omonimo viene invocato
        if (typeof this[name] === 'function') return this[name](...(Array.isArray(args)? args : [args]));
        console.warn('player: unknow action', name);
    }
  }

  _afterPaintCycles(n = 2) {
    // Wait for a number of animation frames to complete.
    return new Promise(resolve => {
      const step = (k) => requestAnimationFrame(() => k <= 1 ? resolve() : step(k-1));
      step(n);
    });
  }

  _waitForScrollIdle(timeoutMs = 500) {
    // Wait until scrolling becomes idle or timeout expires.
    return new Promise(resolve => {
      let t = null;
      const done = () => { this.body.removeEventListener('scroll', onScroll); resolve(); };
      const onScroll = () => { clearTimeout(t); t = setTimeout(done, 120); };
      this.body.addEventListener('scroll', onScroll, { passive: true });
      t = setTimeout(done, timeoutMs);
      onScroll();
    });
  }

  _clearSearchHitParts() {
    // Remove all inline search highlight spans .pxc-hitpart
    const clearView = (v) => {
      if (!v) return;
      v.querySelectorAll('.pxc-hitpart').forEach(span => {
        const parent = span.parentNode;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
      });
    };
    clearView(this.viewPlain);
    clearView(this.viewHL);
  }

  _applySearchHitPartsPlain(rx) {
    // Apply inline search highlighting in plain-text view.
    const v = this.viewPlain;
    if (!v) return;
    const base = this.opts.lineNumbers ? (this.opts.lineNumbersStart || 1) : 1;
    const lines = v.querySelectorAll('.pxc-line');
    lines.forEach((lnEl, idx) => {
      const cell = lnEl.querySelector('.pxc-code');
      if (!cell) return;
      const raw = cell.textContent;
      rx.lastIndex = 0;
      const matches = [];
      let m;
      while ((m = rx.exec(raw)) !== null) {
        matches.push({ start: m.index, end: m.index + (m[0]?.length || 0) });
        if (!m[0]?.length) rx.lastIndex++;
      }
      if (!matches.length) return;
      let offset = 0;
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null);
      let tn;
      while ((tn = walker.nextNode())) {
        const tlen = tn.nodeValue.length;
        const localStart = offset;
        const localEnd   = offset + tlen;
        const here = matches.filter(r => r.start < localEnd && r.end > localStart);
        if (!here.length) { offset += tlen; continue; }
        const frag = document.createDocumentFragment();
        let cursor = 0;
        here.forEach(({start, end}) => {
          const s = Math.max(0, start - localStart);
          const e = Math.min(tlen, end   - localStart);
          if (s > cursor) frag.appendChild(document.createTextNode(tn.nodeValue.slice(cursor, s)));
          const span = document.createElement('span');
          span.className = 'pxc-hitpart';
          span.textContent = tn.nodeValue.slice(s, e);
          frag.appendChild(span);
          cursor = e;
        });
        if (cursor < tlen) frag.appendChild(document.createTextNode(tn.nodeValue.slice(cursor)));
        tn.parentNode.replaceChild(frag, tn);
        offset = localEnd; 
      }
    });
  }

  _getInlineParts() {
    // Get all inline search highlight parts in the active view.
    const v = (this.mode === 'hl') ? this.viewHL : this.viewPlain;
    if (!v) return [];
    return Array.from(v.querySelectorAll('.pxc-hitpart'));
  }

  _searchInlineFocus(i) {
    // Focus on a specific inline search result by index.
    const parts = this._getInlineParts();
    if (!parts.length) return 0;
    const idx = ((i % parts.length) + parts.length) % parts.length;
    parts.forEach(el => el.classList.remove('curr'));
    const el = parts[idx];
    el.classList.add('curr');
    const bodyRect = this.body.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const top = (r.top - bodyRect.top) + this.body.scrollTop - 10; // offset 10px
    this.body.scrollTo({ top, behavior: 'smooth' });
    this._inlineIndex = idx;
    return idx + 1;
  }

  _applySearchHitPartsHL(rx) {
    // Apply inline search highlighting in highlighted (syntax) view.
    const v = this.viewHL;
    if (!v) return;
    const lines = v.querySelectorAll('.pxc-line');
    lines.forEach(lnEl => {
      const cell = lnEl.querySelector('.pxc-code');
      if (!cell) return;
      const raw = cell.textContent; 
      rx.lastIndex = 0;
      const matches = [];
      let m;
      while ((m = rx.exec(raw)) !== null) {
        const start = m.index, end = m.index + (m[0]?.length || 0);
        matches.push({ start, end });
        if (!m[0]?.length) rx.lastIndex++; // evita loop
      }
      if (!matches.length) return;
      let offset = 0;
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null);
      let tn;
      while ((tn = walker.nextNode())) {
        const tlen = tn.nodeValue.length;
        const localStart = offset;
        const localEnd   = offset + tlen;
        const here = matches.filter(r => r.start < localEnd && r.end > localStart);
        if (!here.length) { offset += tlen; continue; }
        const frag = document.createDocumentFragment();
        let cursor = 0;
        here.forEach(({start, end}) => {
          const s = Math.max(0, start - localStart);
          const e = Math.min(tlen, end   - localStart);
          if (s > cursor) frag.appendChild(document.createTextNode(tn.nodeValue.slice(cursor, s)));
          const span = document.createElement('span');
          span.className = 'pxc-hitpart';
          span.textContent = tn.nodeValue.slice(s, e);
          frag.appendChild(span);
          cursor = e;
        });
        if (cursor < tlen) frag.appendChild(document.createTextNode(tn.nodeValue.slice(cursor)));
        tn.parentNode.replaceChild(frag, tn);
        offset = localEnd;
      }
    });
  }

  _reapplyInlineHitsCurrentView() {
    // Reapply inline search highlights to the active view
    if (!this._searchHits || !this._searchHits.length || !this._searchOpts?.inline) return;
    if (!this._searchRxSource) return;
    const rx = new RegExp(this._searchRxSource, this._searchRxFlags || 'g');
    if (this.mode === 'plain') {
      if (this.viewPlain) {
        this.viewPlain.querySelectorAll('.pxc-hitpart').forEach(s => {
          const p = s.parentNode; while (s.firstChild) p.insertBefore(s.firstChild, s); p.removeChild(s);
        });
        this._applySearchHitPartsPlain(rx);
      }
    } else {
      if (this._searchOpts.inlineHL && this.viewHL) {
        this.viewHL.querySelectorAll('.pxc-hitpart').forEach(s => {
          const p = s.parentNode; while (s.firstChild) p.insertBefore(s.firstChild, s); p.removeChild(s);
        });
        this._applySearchHitPartsHL(rx);
      }
    }
    // se avevamo una posizione inline, rifocalizza
    if (typeof this._inlineIndex === 'number' && this._inlineIndex >= 0) {
      const parts = this._getInlineParts();
      if (parts.length) this._searchInlineFocus(this._inlineIndex);
    }
    this._applyFocusBothViews?.();
  }

  _rebuildViewsFrom(text, { format = true } = {}) {
    // Rebuild the highlighted and plain views from given text.
    this.rawOriginal = text;
    this.copyText = (this.opts.tabs === 'both') ? this._expandTabs(text, this.opts.tabSize) : text;
    let display = format && this.opts.dedent ? this._dedent(text) : text;
    if (this.opts.tabs === 'both' || this.opts.tabs === 'view') {
      display = this._expandTabs(display, this.opts.tabSize);
    }
    if (format && this.opts.autoIndent) {
      display = this._autoIndentByLang(display, this.lang, this.opts.tabSize);
    }
    this.viewText = display;
    const pre   = this.scrollEl.querySelector('pre');
    const store = this.scrollEl.querySelector('textarea.pxc-raw-store');
    if (store) store.value = this.copyText;
    this.viewHL    = this._buildViewHL_DOM(this.viewText, this.lang);
    this.viewPlain = this._buildViewPlain_DOM(this.viewText);
    pre.replaceChildren(this.viewHL, this.viewPlain, store);
    this.rebuildFoldMap();
    this._applyMode();
    this._applyMarks();
    if (this._searchHits && this._searchHits.length) this._applySearchHits(new Set(this._searchHits));
    if (this._cursorVisible) this._positionCaret();
    this._reapplyInlineHitsCurrentView();
    if (this.opts.fade) this._updateFades();
    this._applyFocusBothViews?.();
    this._scheduleRangeLayout?.();
  }

  _indexFromLineCol(text, line, col) {
    // Convert line/column coordinates into a string index within text.
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const li = Math.max(1, line) - 1;
    const ci = Math.max(0, col);
    let idx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (i < li) idx += lines[i].length + 1;
      else if (i === li) { idx += Math.min(ci, lines[i].length); break; }
    }
    return idx;
  }

  _ensureCaret() {
    // Ensure a visual caret element exists and is bound to scroll/resize events.
    if (this._caret) return;
    const c = document.createElement('div');
    c.className = 'pxc-caret';
    this._caret = c;
    this.body.appendChild(c);
    this._onCaretScroll = () => { if (this._cursorVisible) this._positionCaret(); };
    this._onBodyScroll('caret', this._onCaretScroll);
    this._onWin('resize', this._onCaretScroll);
  }

  _positionCaret() {
    // Position the caret element according to current cursor position.
    if (!this._caret) return;
    const view = this._getActiveView();
    if (!view || !this._cursorPos) return;
    const base = this.opts.lineNumbers ? (this.opts.lineNumbersStart || 1) : 1;
    const lineEl = this.opts.lineNumbers
      ? view.querySelector(`.pxc-line[data-ln="${this._cursorPos.line}"]`)
      : view.querySelectorAll('.pxc-line')[this._cursorPos.line - base];
    if (!lineEl) return;
    const bodyRect = this.body.getBoundingClientRect();
    const lineRect = lineEl.getBoundingClientRect();
    const top = (lineRect.top - bodyRect.top) + this.body.scrollTop;
    const ch = this._cursorPos.col;
    this._caret.style.top  = `${top}px`;
    this._caret.style.left = `calc(var(--pxc-gutter-w) + var(--pxc-gap) + ${ch}ch)`;
  }

  _slideWaitTransition(el, durMs) {
    // Wait for a CSS height transition to complete or timeout.
    return new Promise(res => {
      let done = false;
      const clean = () => { if (done) return; done = true; el.removeEventListener('transitionend', onEnd); clearTimeout(t); res(); };
      const onEnd = (e) => { if (e.target === el && e.propertyName === 'height') clean(); };
      const t = setTimeout(clean, (durMs || 0) + 80); 
      el.addEventListener('transitionend', onEnd);
    });
  }

  async _slideDown(el, { duration = 220, easing = 'cubic-bezier(.2,.8,.2,1)', display = 'block' } = {}) {
    // Animate an element expanding downward (height from 0 to auto).
    if (!el) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cs = getComputedStyle(el);
    if (cs.display !== 'none' && el.offsetHeight > 0) return;
    el.style.removeProperty('display');
    if (getComputedStyle(el).display === 'none') el.style.display = display;
    const target = el.scrollHeight;          
    el.style.overflow = 'hidden';
    el.style.height = '0px';
    el.style.willChange = 'height';
    el.offsetHeight;
    el.style.transition = `height ${duration}ms ${easing}`;
    el.style.height = target + 'px';
    if (!reduce) await this._slideWaitTransition(el, duration);
    el.style.removeProperty('height');
    el.style.removeProperty('overflow');
    el.style.removeProperty('transition');
    el.style.removeProperty('willChange');
    el.style.height = '';              
    el.style.overflow = 'auto';        
    el.style.display = '';
    el.style.webkitOverflowScrolling = 'touch';
  }

  async _slideUp(el, { duration = 220, easing = 'cubic-bezier(.2,.8,.2,1)' } = {}) {
    // Animate an element collapsing upward (height to 0, then hide).
    if (!el) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    const startH = el.offsetHeight;
    el.style.height = startH + 'px';
    el.style.overflow = 'hidden';
    el.style.willChange = 'height';
    el.offsetHeight;
    el.style.transition = `height ${duration}ms ${easing}`;
    el.style.height = '0px';
    if (!reduce) await this._slideWaitTransition(el, duration);
    el.style.display = 'none';
    el.style.removeProperty('height');
    el.style.removeProperty('overflow');
    el.style.removeProperty('transition');
    el.style.removeProperty('willChange');
  }

  _delay(ms) { 
    // Simple async delay utility.
    return new Promise(r => setTimeout(r, ms)); 
  }
  
  _typingDelay() { 
    // Compute typing delay based on CPS (characters per second) option.
    const cps = Math.max(1, this.opts.typingCPS || 30);
    return 1000 / cps; 
  }

  _applyFont() {
    // Apply font size, line height, and monospace face to editor.
    const face = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    const v = `${this.opts.fontSize}px/${this.opts.fontLineHeight} ${face}`;
    [this.body, this.scrollEl?.querySelector('pre') || this.body]
      .forEach(el => { if (el) el.style.font = v; });
    this._chPx = null;
    this._scheduleRangeLayout?.();
    this._updateRuler?.();
  }

  _lineHeightPx() {
    // Calculate the current line height in pixels.
    const cs = getComputedStyle(this.body);
    const fs = parseFloat(cs.fontSize) || this.opts.fontSize || 13.5;
    const lh = cs.lineHeight === 'normal' ? (this.opts.fontLineHeight || 1.6)*fs : parseFloat(cs.lineHeight);
    return lh || fs*1.6;
  }

  on(eventName, handler) {
    // Subscribe to a custom editor event.
    const ev = String(eventName || '').toLowerCase();
    if (!this._ev || !this._ev[ev] || typeof handler !== 'function') return () => {};
    this._ev[ev].add(handler);
    return () => this.off(ev, handler);
  }
  
  off(eventName, handler) {
    // Unsubscribe from a custom editor event.
    const ev = String(eventName || '').toLowerCase();
    if (!this._ev || !this._ev[ev] || typeof handler !== 'function') return;
    this._ev[ev].delete(handler);
  }
  
  _emit(eventName, detail = {}) {
    // Dispatch a custom event to listeners and option callbacks.
    const ev = String(eventName || '').toLowerCase();
    const payload = { type: ev, target: this, detail };
    const bucket = this._ev?.[ev];
    if (bucket) { bucket.forEach(fn => { try { fn(payload); } catch(e) { console.error(e); } }); }
    const optName = 'on' + ev.charAt(0).toUpperCase() + ev.slice(1);
    const single = this.opts && this.opts[optName];
    if (typeof single === 'function' && (!bucket || !bucket.has(single))) {
      try { single(payload); } catch(e) { console.error(e); }
    }
  }

  _setupFooterControls() {
    // Build and attach footer control buttons based on configuration.
    if (!this.footer) return;
    const list = Array.isArray(this.opts.footerControls)
      ? this.opts.footerControls
      : String(this.opts.footerControls || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
    const want = new Set(list);
    if (!want.size) return;
    this.footer.classList.add('has-controls');
    this.footer.classList.remove('start','center','between','end');
    this.footer.classList.add(this.opts.footerAlign || 'between');
    const bar = document.createElement('div');
    bar.className = 'pxc-footbar';
    this.footer.appendChild(bar);
    this._footbar = bar;
    const mkBtn = (name, title, fa) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `pxc-fbtn pxc-${name} anim-icon`;
      b.title = title;
      b.setAttribute('aria-label', title);
      const i = document.createElement('i');
      i.className = `fa fa-fw ${fa}`;
      b.appendChild(i);
      bar.appendChild(b);
      return b;
    };
    // FLOATBAR
    if (want.has('floatbar')) {
      const b = mkBtn('floatbar', this.t('ui.floatbar.help'), 'fa-grip-lines');
      const sync = () => {
        const on = !!(this._floatbar && this._floatbar.style.display !== 'none' && getComputedStyle(this._floatbar).display !== 'none');
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.title = on ? this.t('ui.floatbar.show') : this.t('ui.floatbar.hide');
        b.classList.toggle('active', on);
      };
      b.addEventListener('click', () => { this.toggleFloatBar(); sync(); });
      this.on?.('floatbar', ({detail}) => { if (detail && 'visible' in detail) sync(); });
      sync();
    }
    // WRAP
    if (want.has('wrap')) {
      const b = mkBtn('wrap',this.t('ui.wrap'),'fa-align-left');
      const syncWrap = () => {
        const i = b.querySelector('i');
        const on = !!this.opts.wrap;
        i.className = 'fa ' + (on ? 'fa-align-justify' : 'fa-align-left');
        b.title = on ? this.t('ui.wrapOn') : this.t('ui.wrapOff');
        b.setAttribute('aria-pressed', on ? 'true':'false');
      };
      b.addEventListener('click', () => { this.toggleWrap(); syncWrap(); });
      this.on?.('toggleHL', syncWrap); // opzionale
      syncWrap();
    }
    // UNDO/REDO
    if (want.has('undo')) {
      mkBtn('undo',this.t('ui.undo'),'fa-undo').addEventListener('click', () => this.undo());
    }
    if (want.has('redo')) {
      mkBtn('redo',this.t('ui.redo'),'fa-repeat').addEventListener('click', () => this.redo());
    }
    // TOOLBAR
    if (want.has('toolbar')) {
      const b = mkBtn('toolbar', this.t('ui.toolbar.help'), 'fa-ellipsis-h');
      const syncToolbar = () => {
        const on = !!this.opts.toolbarVisible;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.title = on ? this.t('ui.toolbar.hide') : this.t('ui.toolbar.show');
      };
      b.addEventListener('click', () => {
        this.toggleToolbar?.();
        syncToolbar();
      });
      syncToolbar();
    }
    const syncUndoRedo = () => {
      const canU = this.canUndo?.(); const canR = this.canRedo?.();
      bar.querySelectorAll('.pxc-undo').forEach(e => e.toggleAttribute('disabled', !canU));
      bar.querySelectorAll('.pxc-redo').forEach(e => e.toggleAttribute('disabled', !canR));
    };
    this.on?.('edit', syncUndoRedo);
    syncUndoRedo();
    // PROGRESS BAR
    if (want.has('progress') && this.opts.playerProgress) {
      const wrap = document.createElement('div');
      wrap.className = 'pxc-progress';
      wrap.innerHTML = '<div class="pxc-progress-bar"></div>';
      const txt = document.createElement('div');
      txt.className = 'pxc-progress-text';
      txt.textContent = '0/0';
      bar.appendChild(wrap);
      bar.appendChild(txt);
      const barEl = wrap.querySelector('.pxc-progress-bar');
      const syncProgress = () => {
        const total = (this._player?.steps?.length || 0);
        let idx = (this._player?.idx ?? -1);
        if (total > 0) idx = Math.min(Math.max(idx, -1), total - 1);
        else idx = -1;
        const cur = total ? Math.min(total, (idx < 0 ? 0 : idx + 1)) : 0;
        const pct = total ? Math.round((cur * 100) / total) : 0;
        barEl.style.width = pct + '%';
        txt.textContent = `${cur}/${total}`;
      };
      this._syncProgress = syncProgress;
      this.on?.('player', ({detail}) => {
        if (['load','play','pause','stepStart','stepEnd','end','stop','preview','goto'].includes(detail.phase)) {
          syncProgress();
        }
      });
      syncProgress();
    }
    // RICERCA
    if (want.has('prev')) {
      mkBtn('prev',this.t('ui.search.prev'),'fa-angle-left').addEventListener('click', () => {
        const n = (this.searchPreviousInline?.() || this.searchPrevious?.() || 0);
        if (!n) this._toast?.(this.t('msg.search.none'));
      });
    }
    if (want.has('next')) {
      mkBtn('next',this.t('ui.search.next'),'fa-angle-right').addEventListener('click', () => {
        const n = (this.searchNextInline?.() || this.searchNext?.() || 0);
        if (!n) this._toast?.(this.t('msg.search.none'));
      });
    }
    // ZOOM
    if (want.has('zoomOut'))   mkBtn('zoomOut',this.t('ui.zoom.out'),'fa-minus').addEventListener('click', () => this.zoomOut());
    if (want.has('resetZoom')) mkBtn('resetZoom',this.t('ui.zoom.reset'),'fa-text-height').addEventListener('click', () => this.resetZoom());
    if (want.has('zoomIn'))    mkBtn('zoomIn',this.t('ui.zoom.in'),'fa-plus').addEventListener('click', () => this.zoomIn());
    // TOGGLE HL
    if (want.has('hl')) {
      const b = mkBtn('hl',this.t('ui.toggleHL.help'),'fa-code');
      const syncHL = () => {
        const i = b.querySelector('i');
        i.className = 'fa ' + (this.mode === 'hl' ? 'fa-code' : 'fa-file-lines');
        b.setAttribute('aria-pressed', this.mode === 'hl' ? 'true' : 'false');
        b.title = this.mode === 'hl' ? this.t('ui.toggleHL.on') : this.t('ui.toggleHL.off');
      };
      b.addEventListener('click', () => {
        const tbtn = this.iconHost?.querySelector('.pxc-toggle');
        if (tbtn) tbtn.click();
        else {
          this.mode = (this.mode === 'hl') ? 'plain' : 'hl';
          this._applyMode(); 
          this._reapplyInlineHitsCurrentView?.(); 
          this._emit?.('toggleHL',{mode:this.mode});
        }
        syncHL();
      });
      this.on?.('toggleHL', syncHL);
      syncHL();
    }
    // FULLSCREEN
    if (want.has('fullscreen')) {
      const b = mkBtn('fs',this.t('ui.fullscreen.enter'),'fa-expand');
      const syncFS = () => {
        const i = b.querySelector('i');
        i.className = 'fa ' + (this.fullscreen ? 'fa-compress' : 'fa-expand');
        b.title = this.fullscreen ? this.t('ui.fullscreen.exit') : 'Fullscreen';
      };
      b.addEventListener('click', () => {
        if (this.fullscreen) this._exitFullscreen?.();
        else this._enterFullscreen?.();
        syncFS();
      });
      this.on?.('fullscreen', syncFS);
      syncFS();
    }
    // PLAYER
    if (want.has('stepPrev')) mkBtn('stepPrev',this.t('ui.player.prev'),'fa-step-backward')
      .addEventListener('click', () => this.playerPrev?.());
    if (want.has('play')) mkBtn('play',this.t('ui.player.play'),'fa-play')
      .addEventListener('click', () => {
        if (this._player?.playing && this._player?.paused) this.playerResume?.();
        else this.playerPlay?.();
      });
    if (want.has('pause')) mkBtn('pause',this.t('ui.player.pause'),'fa-pause')
      .addEventListener('click', () => this.playerPause?.());
    if (want.has('stepNext')) mkBtn('stepNext',this.t('ui.player.next'),'fa-step-forward')
      .addEventListener('click', () => this.playerNext?.());
    const syncPlayBtns = () => {
      const showPause = !!(this._player?.playing && !this._player?.paused);
      bar.querySelectorAll('.pxc-play').forEach(b => b.style.display = showPause ? 'none' : '');
      bar.querySelectorAll('.pxc-pause').forEach(b => b.style.display = showPause ? '' : 'none');
    };
    this.on?.('player', ({detail}) => {
      if (['load','play','pause','stop','stepStart','stepEnd','end'].includes(detail.phase)) syncPlayBtns();
    });
    syncPlayBtns();
    const updateSearchBtns = () => {
      const parts = this._getInlineParts?.() || [];
      const has = parts.length || (this._searchHits?.length || 0);
      bar.querySelectorAll('.pxc-prev,.pxc-next').forEach(btn => {
        btn.toggleAttribute('disabled', !has);
      });
    };
    this.on?.('search', updateSearchBtns);
    updateSearchBtns();
    const syncControlsAvailability = () => {
      const hasSeq = !!(this._player && Array.isArray(this._player.steps) && this._player.steps.length);
      bar.querySelectorAll('.pxc-play, .pxc-stepPrev, .pxc-stepNext')
         .forEach(btn => btn.toggleAttribute('disabled', !hasSeq));
      bar.querySelectorAll('.pxc-pause')
         .forEach(btn => btn.toggleAttribute('disabled', !hasSeq || !this._player?.playing));
    };
    this.on?.('player', ({detail}) => {
      if (['load','play','pause','stop','end','preview','goto'].includes(detail.phase)) syncControlsAvailability();
    });
    syncControlsAvailability();
    const setPlayerBusy = (on) => {
      bar.querySelectorAll('.pxc-play, .pxc-stepPrev, .pxc-stepNext')
         .forEach(btn => btn.toggleAttribute('disabled', on));
      bar.querySelectorAll('.pxc-pause')
         .forEach(btn => btn.toggleAttribute('disabled', false));
    };
    this.on?.('player', ({detail}) => {
      if (detail.phase === 'stepStart') setPlayerBusy(true);
      if (['stepEnd','pause','stop','end'].includes(detail.phase)) setPlayerBusy(false);
    });
  }

  setFooterText(text, selector = '.text-start') {
    // Set custom text inside the footer element.
    if (!this.footer) return false;
    const el = selector ? this.footer.querySelector(selector) : this.footer;
    if (!el) return false;
    el.textContent = String(text ?? '');
    return true;
  }

  _rebuildViewsFromRaw({ keepMode = true } = {}) {
    // Rebuild the highlighted and plain views directly from raw text stored in the hidden <textarea>.
    const store = this.body.querySelector('textarea.pxc-raw-store');
    const raw = store ? store.value : '';
    const pre = this.body.querySelector('pre');
    if (!pre) return;
    const lang = (this.lang || 'auto');
    this.viewHL    = this._buildViewHL_DOM(raw, lang);
    this.viewPlain = this._buildViewPlain_DOM(raw);
    pre.replaceChildren(this.viewHL, this.viewPlain, store);
    this._applyMode();
    this._reapplyInlineHitsCurrentView?.();
  }

  _applyTabSize() {
    // Apply tab size settings (tab-width) to both views.
    const v = String(this.opts.tabSize || 2);
    [this.viewHL, this.viewPlain].forEach(vw => {
      if (!vw) return;
      vw.style.tabSize = v;
      vw.style.MozTabSize = v;
    });
  }

  _applyHeights() {
    // Apply height or max-height constraints from options to the editor body.
    const h  = this.opts.height;
    const mh = this.opts.maxHeight;
    if (h != null) {
      const v = (typeof h === 'number') ? (h+'px') : String(h);
      this.body.style.height = v; this.body.style.maxHeight = v;
    } else if (mh != null) {
      const v = (typeof mh === 'number') ? (mh+'px') : String(mh);
      this.body.style.height = ''; this.body.style.maxHeight = v;
    } else {
      this.body.style.height = ''; this.body.style.maxHeight = '';
    }
    this._updateFadeShadows?.();
  }

  _applyLineNumbersVisibility() {
    // Toggle line number visibility based on configuration.
    this.root.classList.toggle('pxc-no-linenumbers', this.opts.lineNumbers === false);
  }

  _buildFoldMap() {
    // Build a map of foldable code ranges.
    const text = (typeof this.viewText === 'string')
      ? this.viewText
      : (this._getRawText ? this._getRawText() : '');
    const base = this.opts.lineNumbers ? (this.opts.lineNumbersStart || 1) : 1;
    const byLine = text.replace(/\r\n?/g,'\n').split('\n');
    const map = new Map();
    const pushRange = (start, end, depth) => {
      if (end > start) map.set(start + base - 1, { end: end + base - 1, depth });
    };
    if (this.lang === 'html') {
      const voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
      const stack = []; // { name, line }
      const tagRe = /<\/?([A-Za-z][\w:-]*)([^>]*?)>/g;
      let inRaw = null;
      for (let ln = 1; ln <= byLine.length; ln++) {
        const line = byLine[ln - 1];
        if (inRaw) {
          const closeRe = new RegExp(`<\\s*\\/\\s*${inRaw}\\b[^>]*>`, 'i');
          if (closeRe.test(line)) {
            for (let i = stack.length - 1; i >= 0; i--) {
              if (stack[i].name === inRaw) {
                const open = stack[i]; stack.splice(i, 1);
                const depth = i + 1;
                pushRange(open.line, ln, depth);
                break;
              }
            }
            inRaw = null;
          }
          continue; 
        }
        let m; tagRe.lastIndex = 0;
        while ((m = tagRe.exec(line))) {
          const full  = m[0];
          const name  = (m[1] || '').toLowerCase();
          const rest  = m[2] || '';
          const closing      = /^<\s*\//.test(full);
          const selfClosing  = /\/\s*>$/.test(full) || /\/\s*$/.test(rest);
          if (closing) {
            for (let i = stack.length - 1; i >= 0; i--) {
              if (stack[i].name === name) {
                const open = stack[i]; stack.splice(i, 1);
                const depth = i + 1;
                pushRange(open.line, ln, depth);
                break;
              }
            }
          } else {
            if (!selfClosing && !voids.has(name)) {
              stack.push({ name, line: ln });
              if (name === 'script' || name === 'style') {
                inRaw = name;           
              }
            }
          }
        }
      }
    } else {
      const stack = []; 
      let line = 1;
      for (let i=0; i<text.length; i++) {
        const ch = text[i];
        if (ch === '\n') { line++; continue; }
        if (ch === '{') { stack.push({ line }); }
        else if (ch === '}') {
          const open = stack.pop();
          if (open) { const depth = stack.length+1; pushRange(open.line, line, depth); }
        }
      }
    }
    this._foldMap = map;
    return map;
  }

  _applyFoldToView(view, start, end, open) {
    // Apply folding or unfolding to a given view between start and end lines.
    if (!view) return;
    const lines = view.querySelectorAll('.pxc-line');
    const getLine = (ln) => view.querySelector(`.pxc-line[data-ln="${ln}"]`);
    const startEl = getLine(start);
    if (!startEl) return;
    if (open) {
      for (let ln=start+1; ln<end; ln++) {
        const el = getLine(ln); if (el) el.classList.remove('pxc-folded');
      }
      const sum = startEl.nextElementSibling;
      if (sum && sum.classList.contains('pxc-fold-summary')) sum.remove();
      startEl.classList.remove('pxc-fold-open','pxc-fold-start');
    } else {
      let hidden = 0;
      for (let ln=start+1; ln<end; ln++) {
        const el = getLine(ln); if (el) { el.classList.add('pxc-folded'); hidden++; }
      }
      startEl.classList.add('pxc-fold-start','pxc-fold-open');

      const existing = startEl.nextElementSibling;
      if (existing && existing.classList.contains('pxc-fold-summary')) {
        existing.remove();
      }

      const sum = document.createElement('div');
      sum.className = 'pxc-line pxc-fold-summary';
      sum.setAttribute('data-ln','');
      sum.dataset.foldCount = String(hidden);
      const cell = document.createElement('span');
      cell.className = 'pxc-code';
      cell.textContent = this.t('fold.summary', { n: hidden });
      sum.appendChild(cell);
      sum.setAttribute('tabindex', '0');     
      sum.setAttribute('role', 'button');
      sum.dataset.foldStart = String(start);
      sum.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.unfoldAt(start);            
      });
      sum.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          ev.stopPropagation();
          this.unfoldAt(start);           
        }
      });
      startEl.parentNode.insertBefore(sum, startEl.nextSibling);
    }
  }

  isFoldable(line) {
    // Check if a line can be folded according to the fold map.
    const map = this._foldMap || this._buildFoldMap();
    return map.has(line);
  }

  foldAt(line) {
    // Fold code at a given line if foldable.
    const m = this._foldMap || this._buildFoldMap();
    const info = m.get(line); if (!info) return false;
    const { end } = info;
    this._applyFoldToView(this.viewHL, line, end, false);
    this._applyFoldToView(this.viewPlain, line, end, false);
    if (!this._foldedRanges.find(r=>r[0]===line && r[1]===end)) this._foldedRanges.push([line,end]);
    return true;
  }

  unfoldAt(line) {
    // Unfold a previously folded code block at a given line.
    const m = this._foldMap || this._buildFoldMap();
    const info = m.get(line); if (!info) return false;
    const { end } = info;
    this._applyFoldToView(this.viewHL, line, end, true);
    this._applyFoldToView(this.viewPlain, line, end, true);
    this._foldedRanges = this._foldedRanges.filter(r => !(r[0]===line && r[1]===end));
    return true;
  }

  toggleFoldAt(line) {
    // Toggle folding at the specified line.
    const lineEl = (this.mode==='hl'? this.viewHL : this.viewPlain)?.querySelector(`.pxc-line[data-ln="${line}"]`);
    if (lineEl && lineEl.classList.contains('pxc-fold-open')) return this.unfoldAt(line);
    return this.foldAt(line);
  }

  unfoldAll() {
    // Unfold a previously folded code block at a given line.
    const ranges = this._foldedRanges.slice();
    for (const [s] of ranges) this.unfoldAt(s);
    this._foldedRanges = [];
  }

  getFoldableLines() {
    // Return an array of all foldable line numbers.
    const m = this._foldMap || this._buildFoldMap();
    return Array.from(m.keys()).sort((a,b)=>a-b);
  }

  rebuildFoldMap() { 
    // Clear and rebuild the fold map from current text.
    this._foldMap = null; this._buildFoldMap(); 
  }

  showToolbar() { 
    // Show the editor toolbar.
    this.setOption('toolbarVisible', true); 
  }

  hideToolbar() { 
    // Hide the editor toolbar.
    this.setOption('toolbarVisible', false); 
  }
  
  toggleToolbar() { 
    // Toggle toolbar visibility on/off.
    this.setOption('toolbarVisible', !this.opts.toolbarVisible); 
  }

  showFloatBar() {
    // Show the floating toolbar (floatbar).
    const el = this._ensureFloatBar();
    if (!el) return false;
    el.style.display = '';
    if (getComputedStyle(el).display === 'none') {
      el.style.display = 'inline-flex';
    }
    if (typeof this.recenterFloatBar === 'function') this.recenterFloatBar();
    this.opts.floatBar = true;
    this._floatbarJustCreated = false;
    this._emit?.('floatbar', { phase:'show', visible:true });
    return true;
  }

  hideFloatBar() {
    // Hide the floating toolbar (floatbar).
    const el = this._floatbar;
    if (!el) return false;
    el.style.display = 'none';
    this.opts.floatBar = false;
    this._emit?.('floatbar', { phase:'hide', visible:false });
    return true;
  }

  toggleFloatBar() {
    // Toggle visibility of the floating toolbar.
    const el = this._ensureFloatBar();
    if (!el) return false;
    if (this._floatbarJustCreated) {
      this._floatbarJustCreated = false;
      return this.showFloatBar();
    }
    return this._isFloatBarVisible() ? this.hideFloatBar() : this.showFloatBar();
  }

  recenterFloatBar() { 
    // Recenter and clamp the floating toolbar within viewport.
    this._floatbarCenterAndClamp({ onlyClamp:false }); 
  }

  t(key, vars) { 
    // Translate a given key with optional variables.
    return (this._i18n || this._initI18n()).t(key, vars); 
  }

  setLocale(loc) { 
    // Set current UI locale and update mounted UI elements.
    this._initI18n().setLocale(loc); 
  }

  extendLocale(loc, obj) {
    // Extend or override translations for a given locale. 
    this._initI18n().extend(loc, obj); 
  }

  focusLines(start, end, { dim = 0.35, className = 'pxc-dimmed', scroll = true } = {}) {
    // Focus on a specific line range by dimming others.
    const s = Math.max(1, Math.min(start|0, end|0));
    const e = Math.max(1, Math.max(start|0, end|0));
    this._focus = { start: s, end: e, dim, className };
    this.body.style.setProperty('--pxc-dim-opacity', String(dim));
    this._applyFocusBothViews();
    if (scroll) this.goto(s, { behavior:'smooth', offset: this.opts.searchOffsetPx });
  }

  clearFocus() {
    // Clear any active focus range highlighting.
    this._focus = null;
    this.body.style.removeProperty('--pxc-dim-opacity');
    this._applyFocusBothViews();
  }

  addRangeHighlight({ from, to, className = 'pxc-hlbox' }) {
    // Add a visual box highlight across a line/column range.
    const sLine = Math.max(1, (from?.line|0) || 1);
    const sCol  = Math.max(0, (from?.col|0)  || 0);
    const eLine = Math.max(1, (to?.line|0)   || sLine);
    const eCol  = Math.max(0, (to?.col|0)    || sCol);
    const id = ++this._hlSeq;
    this._rangeHls.push({ id, sLine, sCol, eLine, eCol, className });
    this._scheduleRangeLayout();
    return id;
  }

  clearRangeHighlights(id = null) {
    // Clear one or all range highlights from the editor.
    if (id == null) this._rangeHls = [];
    else this._rangeHls = this._rangeHls.filter(h => h.id !== id);
    this._scheduleRangeLayout();
  }

  showTokens(on = true) { 
    // Toggle visibility of internal tokens for debugging.
    this.setOption('showTokens', !!on); 
  }

  getTheme() {
    // Get the current active theme name.
    return this.root.dataset.theme || 'dark';
  }

  listThemes() {
    // List all available built-in themes.
    return Array.from(this.constructor._themes);
  }

  setTheme(name, { silent = false } = {}) {
    // Change editor theme.
    const t = this._resolveTheme(name);
    if (!t) {
      console.warn('[PWAxcode] unknow theme:', name);
      return false;
    }
    this.opts.theme = String(name || 'dark');
    this._applyTheme(this.opts.theme);
    this._updateRuler?.();         
    if (!silent) this._emit?.('themechange', { theme: this.root.dataset.theme, requested: this.opts.theme });
    return true;
  }

  _resolveTheme(name) {
    // Resolve a theme name or alias into a valid theme identifier.
    if (!name) return this.opts?.theme || 'dark';
    const n = String(name).toLowerCase();
    const fromAlias = this.constructor._aliases.get(n);
    const t = fromAlias || n;
    if (t === 'auto' || t === 'system') return 'auto';
    return this.constructor._themes.has(t) ? t : null;
  }

  _nextZ() { 
    // Generate and return the next z-index value for overlays.
    this._zseq = (this._zseq || 10000) + 1; return this._zseq; 
  }
  
  _safeHTML(s) { 
    // Escape arbitrary text into safe HTML.
    const d = document.createElement('div'); 
    d.textContent = String(s ?? ''); 
    return d.innerHTML; 
  }

  _haptic(kind = 'tap') {
    // Trigger a haptic feedback vibration pattern if supported.
    if (this.opts.haptics === 'off' || typeof navigator === 'undefined' || !navigator.vibrate) return;
    const pat = {
      tap:[6], copy:[10], searchHit:[8,30,8], step:[12], undo:[10], redo:[10], error:[30,60,30]
    }[kind] || [8];
    try { navigator.vibrate(pat); } catch {}
  }

  _getRawText() {
    // Retrieve raw text content from the hidden textarea or fallback plain view.
    const ta = this.body.querySelector('textarea.pxc-raw-store');
    if (ta) return ta.value;
    // fallback: concatena il plain view
    const plain = this.viewPlain;
    if (!plain) return '';
    const lines = Array.from(plain.querySelectorAll('.pxc-line .pxc-code'))
      .map(n => n.textContent || '');
    return lines.join('\n');
  }

  _getFontSize() {
    // Get the current font size in pixels.
    if (this._fontSize) return this._fontSize;
    const cs = getComputedStyle(this.body);
    const px = parseFloat(cs.fontSize || '13.5') || 13.5;
    return px;
  }

  _getMarkedLines() {
    // Get all currently marked line numbers in the editor.
    if (this._marks && this._marks.size) return Array.from(this._marks).sort((a,b)=>a-b);
    const sel = '.pxc-line[data-marked="1"], .pxc-line.marked';
    const out = [];
    this.body.querySelectorAll(sel).forEach(div => {
      const ln = parseInt(div.getAttribute('data-ln') || '0', 10);
      if (!isNaN(ln)) out.push(ln);
    });
    return out.sort((a,b)=>a-b);
  }

  _on(el, type, fn, opt) {
    // Attach an event listener and remember it for cleanup.
    el.addEventListener(type, fn, opt);
    (this._unsubs ||= []).push(() => { try { el.removeEventListener(type, fn, opt); } catch {} });
    return fn;
  }
  
  _onWin(type, fn, opt) { 
    // Attach an event listener to the window object.
    return this._on(window, type, fn, opt); 
  }
  
  _ensureBodyScrollHub() {
    // Ensure a central scroll hub is attached to the editor body
    if (this._scrollHubBound) return;
    const hub = (e) => {
      const subs = this._scrollSubs ? Array.from(this._scrollSubs.values()) : [];
      for (const fn of subs) { try { fn(e); } catch {} }
    };
    this._on(this.body, 'scroll', hub, { passive:true });
    this._scrollHubBound = true;
  }

  _onBodyScroll(key, handler) {
    // Subscribe to scroll events on the editor body with a key.
    this._scrollSubs ||= new Map();
    this._ensureBodyScrollHub();
    this._scrollSubs.set(String(key), handler);
    const off = () => this._scrollSubs.delete(String(key));
    (this._unsubs ||= []).push(off);
    return off;
  }

  _offBodyScroll(key) { 
    // Remove a previously registered body scroll handler by key.
    this._scrollSubs?.delete(String(key)); 
  }

  _bindScrollHooks() {
    // Bind internal scroll hooks (inline hits, player, fold, range boxes).
    if (typeof this._placeInlineHits === 'function') {
      this._onBodyScroll('inlineHits', () => this._placeInlineHits());
    } else if (typeof this._reapplyInlineHitsCurrentView === 'function') {
      this._onBodyScroll('inlineHits', () => this._reapplyInlineHitsCurrentView());
    }
    if (this._player) {
      this._onBodyScroll('playerScroll', () => {
        this._emit?.('player', { phase:'scroll', index:this._player?.idx ?? -1 });
      });
    }
    if (Array.isArray(this._foldedRanges)) {
      this._onBodyScroll('foldKeep', () => {});
    }
    this._onBodyScroll('rangeBoxes', () => this._scheduleRangeLayout());
    this._onWin('resize', () => this._scheduleRangeLayout());
  }
  
  _setupFloatBar() {
    // Setup and mount the floating toolbar (floatbar).
    if (this._floatbar) return;
    const want = new Set(
      Array.isArray(this.opts.floatBarControls)
        ? this.opts.floatBarControls
        : String(this.opts.floatBarControls||'').split(',').map(s=>s.trim()).filter(Boolean)
    );
    if (!want.size) return;
    const bar = document.createElement('div');
    bar.className = 'pxc-floatbar';
    bar.style.zIndex = '10020';
    bar.style.left = '50%';
    bar.style.bottom = 'max(16px, env(safe-area-inset-bottom))';
    bar.style.transform = 'translateX(-50%)';
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'pxc-fb-handle';
    grip.setAttribute('aria-label','Sposta barra');
    grip.innerHTML = '<i class="fa fa-grip-lines-vertical"></i>';
    bar.appendChild(grip);
    const zone = document.createElement('div');
    zone.className = 'pxc-fb-zone';
    bar.appendChild(zone);
    const mkBtn = (name, title, fa) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `pxc-fbtn pxc-${name}`;
      b.setAttribute('aria-label', title);
      b.title = title;
      const i = document.createElement('i');
      i.className = `fa ${fa}`;
      b.appendChild(i);
      zone.appendChild(b);
      return b;
    };
    if (want.has('stepPrev')) mkBtn('stepPrev',this.t('ui.player.prev'),'fa-step-backward')
      .addEventListener('click', () => this.playerPrev?.());
    if (want.has('play')) mkBtn('play',this.t('ui.player.play'),'fa-play')
      .addEventListener('click', () => {
        if (this._player?.playing && this._player?.paused) this.playerResume?.();
        else this.playerPlay?.();
      });
    if (want.has('pause')) mkBtn('pause',this.t('ui.player.pause'),'fa-pause')
      .addEventListener('click', () => this.playerPause?.());
    if (want.has('stepNext')) mkBtn('stepNext',this.t('ui.player.next'),'fa-step-forward')
      .addEventListener('click', () => this.playerNext?.());
    if (want.has('prev')) mkBtn('prev',this.t('ui.search.prev'),'fa-angle-left')
      .addEventListener('click', () => {
        const n = (this.searchPreviousInline?.() || this.searchPrevious?.() || 0);
        if (!n) this._toast?.(this.t('msg.search.none'));
      });
    if (want.has('next')) mkBtn('next',this.t('ui.search.next'),'fa-angle-right')
      .addEventListener('click', () => {
        const n = (this.searchNextInline?.() || this.searchNext?.() || 0);
        if (!n) this._toast?.(this.t('msg.search.none'));
      });
    if (want.has('hl')) {
      const b = mkBtn('hl',this.t('ui.toggleHL.help'),'fa-code');
      const syncHL = () => {
        const i = b.querySelector('i');
        i.className = 'fa ' + (this.mode === 'hl' ? 'fa-code' : 'fa-file-lines');
        b.setAttribute('aria-pressed', this.mode === 'hl' ? 'true' : 'false');
        b.title = this.mode === 'hl' ? this.t('ui.toggleHL.on') : this.t('ui.toggleHL.off');
      };
      b.addEventListener('click', () => {
        const tbtn = this.iconHost?.querySelector('.pxc-toggle');
        if (tbtn) tbtn.click();
        else { this.mode = (this.mode==='hl') ? 'plain' : 'hl'; this._applyMode(); this._reapplyInlineHitsCurrentView?.(); this._emit?.('toggleHL',{mode:this.mode}); }
        syncHL();
      });
      this.on?.('toggleHL', syncHL);
      syncHL();
    }
    if (want.has('wrap')) {
      const b = mkBtn('wrap',this.t('ui.wrap'),'fa-align-left');
      const syncWrap = () => {
        const i = b.querySelector('i');
        const on = !!this.opts.wrap;
        i.className = 'fa ' + (on ? 'fa-align-justify' : 'fa-align-left');
        b.setAttribute('aria-pressed', on ? 'true':'false');
        b.title = on ? this.t('ui.wrapOn') : this.t('ui.wrapOff');
      };
      b.addEventListener('click', () => { this.toggleWrap(); syncWrap(); });
      syncWrap();
    }
    if (want.has('fullscreen')) {
      const b = mkBtn('fs',this.t('ui.fullscreen.enter'),'fa-expand');
      const syncFS = () => {
        const i = b.querySelector('i');
        i.className = 'fa ' + (this.fullscreen ? 'fa-compress' : 'fa-expand');
        b.title = this.fullscreen ? this.t('ui.fullscreen.exit') : 'Fullscreen';
      };
      b.addEventListener('click', () => {
        if (this.fullscreen) this._exitFullscreen?.(); else this._enterFullscreen?.();
        syncFS();
      });
      this.on?.('fullscreen', () => {
        if (!this.opts.floatBarInFullscreen) {
          bar.style.display = this.fullscreen ? 'none' : '';
        }
        syncFS();
      });
      syncFS();
    }
    if (want.has('undo')) mkBtn('undo', this.t('ui.undo'), 'fa-undo').addEventListener('click', () => this.undo());
    if (want.has('redo')) mkBtn('redo', this.t('ui.redo'), 'fa-repeat').addEventListener('click', () => this.redo());
    document.body.appendChild(bar);
    this._floatbar = bar;
    this._floatOffs = [];
    this._floatbarCenterAndClamp({ onlyClamp:false });
    const offResize = this._onWin('resize', () => this._floatbarCenterAndClamp({ onlyClamp:true }));
    this._floatOffs.push(() => offResize?.());
    const key = 'pwaxcode:floatbar:' + (this.root.id || 'default');
    if (this.opts.floatBarRemember) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const pos = JSON.parse(raw);
          if (Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
            bar.style.left = pos.left + 'px';
            bar.style.top = pos.top + 'px';
            bar.style.right = 'auto';
            bar.style.bottom = 'auto';
            bar.style.transform = '';
          }
        }
      } catch {}
    }
    const onDown = (ev) => {
      ev.preventDefault();
      const r = bar.getBoundingClientRect();
      bar.classList.add('dragging');
      bar.style.transform = '';   
      bar.style.right = 'auto';
      bar.style.bottom = 'auto';
      const sx = ev.clientX, sy = ev.clientY;
      const dx = sx - r.left, dy = sy - r.top;
      const onMove = (e) => {
        const x = Math.max(8, Math.min(e.clientX - dx, window.innerWidth  - bar.offsetWidth  - 8));
        const y = Math.max(8, Math.min(e.clientY - dy, window.innerHeight - bar.offsetHeight - 8));
        bar.style.left = x + 'px';
        bar.style.top  = y + 'px';
      };
      const onUp = () => {
        bar.classList.remove('dragging');
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        if (this.opts.floatBarRemember) {
          try {
            const left = parseFloat(bar.style.left)||0;
            const top  = parseFloat(bar.style.top)||0;
            localStorage.setItem(key, JSON.stringify({ left, top }));
          } catch {}
        }
      };
      document.addEventListener('pointermove', onMove, { passive:false });
      document.addEventListener('pointerup', onUp, { passive:true });
      document.addEventListener('pointercancel', onUp, { passive:true });
      this._floatOffs.push(() => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
      });
    };
    grip.addEventListener('pointerdown', onDown, { passive:false });
    this._floatOffs.push(() => grip.removeEventListener('pointerdown', onDown));
    const syncPlayBtns = () => {
      const showPause = !!(this._player?.playing && !this._player?.paused);
      bar.querySelectorAll('.pxc-play').forEach(b => b.style.display = showPause ? 'none' : '');
      bar.querySelectorAll('.pxc-pause').forEach(b => b.style.display = showPause ? '' : 'none');
    };
    const syncControlsAvailability = () => {
      const hasSeq = !!(this._player && Array.isArray(this._player.steps) && this._player.steps.length);
      bar.querySelectorAll('.pxc-play, .pxc-stepPrev, .pxc-stepNext')
        .forEach(btn => btn.toggleAttribute('disabled', !hasSeq));
      bar.querySelectorAll('.pxc-pause')
        .forEach(btn => btn.toggleAttribute('disabled', !hasSeq || !this._player?.playing));
    };
    const setPlayerBusy = (on) => {
      bar.querySelectorAll('.pxc-play, .pxc-stepPrev, .pxc-stepNext')
        .forEach(btn => btn.toggleAttribute('disabled', on));
      bar.querySelectorAll('.pxc-pause')
        .forEach(btn => btn.toggleAttribute('disabled', false));
    };
    const updateSearchBtns = () => {
      const parts = this._getInlineParts?.() || [];
      const has = parts.length || (this._searchHits?.length || 0);
      bar.querySelectorAll('.pxc-prev,.pxc-next').forEach(btn => {
        btn.toggleAttribute('disabled', !has);
      });
    };
    const syncUndoRedo = () => {
      const canU = this.canUndo?.(); const canR = this.canRedo?.();
      bar.querySelectorAll('.pxc-undo').forEach(e => e.toggleAttribute('disabled', !canU));
      bar.querySelectorAll('.pxc-redo').forEach(e => e.toggleAttribute('disabled', !canR));
    };
    const off1 = this.on?.('player', ({detail}) => {
      if (['load','play','pause','stop','stepStart','stepEnd','end','preview','goto'].includes(detail.phase)) {
        syncPlayBtns(); syncControlsAvailability();
        if (detail.phase === 'stepStart') setPlayerBusy(true);
        if (['stepEnd','pause','stop','end'].includes(detail.phase)) setPlayerBusy(false);
      }
    });
    const off2 = this.on?.('search', updateSearchBtns);
    const off3 = this.on?.('edit',   syncUndoRedo);
    this._floatOffs.push(() => off1?.(), () => off2?.(), () => off3?.());
    syncPlayBtns(); syncControlsAvailability(); updateSearchBtns(); syncUndoRedo();
    if (!this.opts.floatBarInFullscreen && this.fullscreen) bar.style.display = 'none';
  }

  _destroyFloatBar() {
    // Destroy and remove the floating toolbar from the DOM.
    const bar = this._floatbar;
    if (!bar) return;
    try { (this._floatOffs||[]).forEach(fn => { try{ fn(); }catch{} }); } finally { this._floatOffs = []; }
    if (bar.parentNode) bar.parentNode.removeChild(bar);
    this._floatbar = null;
  }

  _floatbarCenterAndClamp({ onlyClamp = false } = {}) {
    // Center and/or clamp the floating toolbar within viewport boundaries.
    const bar = this._floatbar;
    if (!bar) return;
    const margin = 8;
    const vw = window.innerWidth || document.documentElement.clientWidth || 360;
    const vh = window.innerHeight || document.documentElement.clientHeight || 640;
    bar.style.transform = 'none';
    const rect = bar.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (!onlyClamp) {
      const leftPx = Math.max(margin, Math.round((vw - w) / 2));
      bar.style.left = leftPx + 'px';
    }
    let left = parseFloat(bar.style.left);
    if (!Number.isFinite(left)) {
      left = rect.left;
    }
    left = Math.max(margin, Math.min(left, vw - w - margin));
    bar.style.left = Math.round(left) + 'px';
    if (bar.style.top && bar.style.top !== 'auto') {
      let top = parseFloat(bar.style.top);
      if (!Number.isFinite(top)) top = rect.top;
      const topClamped = Math.max(margin, Math.min(top, vh - h - margin));
      bar.style.top = Math.round(topClamped) + 'px';
      bar.style.bottom = 'auto';
    }
  }

  _applyToolbarVisibility() {
    // Apply toolbar visibility state to DOM and update ARIA attributes.
    const on = !!this.opts.toolbarVisible;
    this.root.classList.toggle('pxc-toolbar-hidden', !on);
    if (this.iconHost) {
      if (on) {
        this.iconHost.removeAttribute('aria-hidden');
        this.iconHost.querySelectorAll('button').forEach(b => b.removeAttribute('tabindex'));
      } else {
        this.iconHost.setAttribute('aria-hidden','true');
        this.iconHost.querySelectorAll('button').forEach(b => b.setAttribute('tabindex','-1'));
      }
    }
  }

  _ensureFloatBar() {
    //  Ensure the floatbar exists, creating it if necessary.
    if (this._floatbar && document.body.contains(this._floatbar)) return this._floatbar;
    this._setupFloatBar();
    this._floatbarJustCreated = true;
    return (this._floatbar && document.body.contains(this._floatbar)) ? this._floatbar : null;
  }

  _isFloatBarVisible() {
    // Check if the floatbar is currently visible.
    const el = this._floatbar;
    if (!el) return false;
    const cs = getComputedStyle(el);
    return el.style.display !== 'none' && cs.display !== 'none';
  }

  _initI18n() {
    // Initialize internationalization (i18n) dictionaries and locale handling.
    if (this._i18n) return this._i18n;
    const deepMerge = (t, s) => {
      for (const k of Object.keys(s || {})) {
        if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) {
          t[k] = deepMerge(t[k] || {}, s[k]);
        } else {
          t[k] = s[k];
        }
      }
      return t;
    };
    const resolveLocale = (loc) => {
      if (loc && loc !== 'auto') return loc;
      const fromHtml = (document.documentElement.getAttribute('lang') || '').trim();
      if (fromHtml) return fromHtml;
      const fromNav = (navigator.language || (navigator.languages && navigator.languages[0]) || '').trim();
      return fromNav || 'en';
    };
    const baseDict = {
      it: {
        ui: {
          copy: 'Copia codice',
          toggleHL: { help: 'Colorazione on/off', on: 'Highlight: ON', off: 'Highlight: OFF' },
          download: 'Scarica codice',
          fullscreen: { enter: 'Schermo intero', exit: 'Esci fullscreen' },
          collapse: 'Comprimi',
          expand: 'Espandi',
          wrap: 'A capo',
          wrapOn: 'A capo: ON',
          wrapOff: 'A capo: OFF',
          undo: 'Annulla',
          redo: 'Rifai',
          popover: { question: 'Domanda', sure: 'Sei Sicuro?', yes: 'Sì', no: 'No', tap: 'Tocca per continuare', continue: 'Continua'},
          toolbar: { help: 'Mostra/Nascondi toolbar', show: 'Mostra toolbar', hide: 'Nascondi toolbar' },
          floatbar: { help: 'Mostra/Nascondi barra mobile', show: 'Mostra barra mobile', hide: 'Nascondi barra mobile' },
          search: { prev: 'Precedente', next: 'Successivo' },
          zoom: { in: 'Aumenta font', out: 'Diminuisci font', reset: 'Reset font' },
          player: { play: 'Play', pause: 'Pausa', prev: 'Step precedente', next: 'Step successivo' },
        },
        msg: {
          copy: { ok: 'Copiato!', errPerm: 'Errore copia (permessi)' },
          search: { none: 'Nessun risultato' },
          wait: 'Attendi…'
        },
        fold: {
          summary: { one: '… {n} riga compressa', other: '… {n} righe compresse' }
        }
      },
      en: {
        ui: {
          copy: 'Copy code',
          toggleHL: { help: 'Highlight on/off', on: 'Highlight: ON', off: 'Highlight: OFF' },
          download: 'Download code',
          fullscreen: { enter: 'Fullscreen', exit: 'Exit fullscreen' },
          collapse: 'Collapse',
          expand: 'Expand',
          wrap: 'Wrap',
          wrapOn: 'Wrap: ON',
          wrapOff: 'Wrap: OFF',
          undo: 'Undo',
          redo: 'Redo',
          popover: { question: 'Question', sure: 'Are you Sure?', yes: 'Yes', no: 'No', tap: 'Tap to continue', continue: 'Continue' },
          toolbar: { help: 'Show/Hide toolbar', show: 'Show toolbar', hide: 'Hide toolbar' },
          floatbar: { help: 'Show/Hide mobile bar', show: 'Show mobile bar', hide: 'Hide mobile bar' },
          search: { prev: 'Previous', next: 'Next' },
          zoom: { in: 'Zoom in', out: 'Zoom out', reset: 'Reset font' },
          player: { play: 'Play', pause: 'Pause', prev: 'Previous step', next: 'Next step' },
        },
        msg: {
          copy: { ok: 'Copied!', errPerm: 'Copy error (permissions)' },
          search: { none: 'No results' },
          wait: 'Please wait…'
        },
        fold: {
          summary: { one: '… {n} folded line', other: '… {n} folded lines' }
        }
      }
    };
    // Eventuali traduzioni passate via opzione
    const dict = deepMerge(JSON.parse(JSON.stringify(baseDict)), this.opts?.translations || {});
    const locale = resolveLocale(this.opts?.locale);
    const prCache = new Map();
    const getPR = (loc) => {
      if (!prCache.has(loc)) prCache.set(loc, new Intl.PluralRules(loc || 'en'));
      return prCache.get(loc);
    };
    const localeChain = (loc) => {
      const parts = String(loc || '').split('-');
      const chain = [];
      if (loc) chain.push(loc);
      if (parts.length > 1) chain.push(parts[0]);
      if (!chain.includes('en')) chain.push('en');
      return chain;
    };
    const lookup = (key, loc) => {
      const chain = localeChain(loc);
      for (const l of chain) {
        let node = dict[l];
        if (!node) continue;
        const path = String(key).split('.');
        for (const p of path) {
          node = node?.[p];
          if (node == null) break;
        }
        if (node != null) return node;
      }
      return undefined;
    };
    const interpolate = (tmpl, vars, loc) => {
      if (tmpl && typeof tmpl === 'object' && vars && typeof vars.n === 'number') {
        // Gestione plurale con Intl.PluralRules
        const form = getPR(loc).select(vars.n);
        const chosen = tmpl[form] ?? tmpl.other ?? tmpl.one ?? '';
        tmpl = chosen;
      }
      let s = (tmpl == null) ? '' : String(tmpl);
      if (vars && typeof vars === 'object') {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replaceAll(`{${k}}`, String(v));
        }
      }
      return s;
    };
    const applyI18nToMountedUI = () => {
      // Header
      this.iconHost?.querySelector('.pxc-copy')?.setAttribute('aria-label', api.t('ui.copy'));
      const tbtn = this.iconHost?.querySelector('.pxc-toggle');
      if (tbtn) {
        const on = this.mode === 'hl';
        tbtn.title = on ? api.t('ui.toggleHL.on') : api.t('ui.toggleHL.off');
        tbtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      this.iconHost?.querySelector('.pxc-download')?.setAttribute('aria-label', api.t('ui.download'));
      const fbtn = this.iconHost?.querySelector('.pxc-fullscreen');
      if (fbtn) fbtn.title = this.fullscreen ? api.t('ui.fullscreen.exit') : api.t('ui.fullscreen.enter');
      const cbtn = this.iconHost?.querySelector('.pxc-collapse');
      if (cbtn) cbtn.title = this.compressed ? api.t('ui.expand') : api.t('ui.collapse');
      // Footer buttons (se presenti)
      this.footer?.querySelectorAll('.pxc-fbtn').forEach(b=>{
        if (b.classList.contains('pxc-prev')) b.title = api.t('ui.search.prev');
        if (b.classList.contains('pxc-next')) b.title = api.t('ui.search.next');
        if (b.classList.contains('pxc-zoomIn')) b.title = api.t('ui.zoom.in');
        if (b.classList.contains('pxc-zoomOut')) b.title = api.t('ui.zoom.out');
        if (b.classList.contains('pxc-resetZoom')) b.title = api.t('ui.zoom.reset');
        if (b.classList.contains('pxc-play')) b.title = api.t('ui.player.play');
        if (b.classList.contains('pxc-pause')) b.title = api.t('ui.player.pause');
        if (b.classList.contains('pxc-stepPrev')) b.title = api.t('ui.player.prev');
        if (b.classList.contains('pxc-stepNext')) b.title = api.t('ui.player.next');
      });
      // Floatbar
      const fb = this._floatbar;
      if (fb) {
        fb.querySelectorAll('.pxc-fbtn').forEach(b=>{
          if (b.classList.contains('pxc-prev')) b.title = api.t('ui.search.prev');
          if (b.classList.contains('pxc-next')) b.title = api.t('ui.search.next');
          if (b.classList.contains('pxc-play')) b.title = api.t('ui.player.play');
          if (b.classList.contains('pxc-pause')) b.title = api.t('ui.player.pause');
          if (b.classList.contains('pxc-stepPrev')) b.title = api.t('ui.player.prev');
          if (b.classList.contains('pxc-stepNext')) b.title = api.t('ui.player.next');
        });
      }
      // Fold summary esistenti
      this.body?.querySelectorAll('.pxc-fold-summary').forEach(sum=>{
        const n = parseInt(sum.dataset.foldCount || '0', 10);
        const cell = sum.querySelector('.pxc-code');
        if (cell && Number.isFinite(n)) cell.textContent = api.t('fold.summary', { n });
      });
    };
    const api = {
      locale,
      dict,
      t: (key, vars) => {
        const val = lookup(key, api.locale);
        return interpolate(val ?? key, vars, api.locale) || key;
      },
      has: (key) => lookup(key, api.locale) != null,
      setLocale: (loc) => {
        api.locale = resolveLocale(loc);
        applyI18nToMountedUI();
      },
      extend: (loc, obj) => {
        dict[loc] ||= {};
        deepMerge(dict[loc], obj || {});
        applyI18nToMountedUI();
      },
      _applyToUI: applyI18nToMountedUI
    };
    this._i18n = api;
    queueMicrotask(() => api._applyToUI?.());
    return this._i18n;
  }

  _applyFocusToView(view) {
    //Apply focus range dimming to a specific view.
    if (!view) return;
    const lines = view.querySelectorAll('.pxc-line');
    lines.forEach(el => el.classList.remove('pxc-dimmed'));
    if (!this._focus) return;
    const { start, end, className } = this._focus;
    const base = this.opts.lineNumbers ? (this.opts.lineNumbersStart || 1) : 1;
    lines.forEach((lnEl, idx) => {
      let ln = lnEl.hasAttribute('data-ln')
        ? parseInt(lnEl.getAttribute('data-ln'), 10)
        : (base + idx);
      if (!(ln >= start && ln <= end)) lnEl.classList.add(className || 'pxc-dimmed');
    });
  }

  _applyFocusBothViews() {
    // Apply focus range dimming to both plain and highlighted views.
    this._applyFocusToView(this.viewHL);
    this._applyFocusToView(this.viewPlain);
  }

  _scheduleRangeLayout() {
    // Schedule a layout pass for range highlights on the next animation frame.
    if (this._rangeLayoutScheduled) return;
    this._rangeLayoutScheduled = true;
    requestAnimationFrame(() => {
      this._rangeLayoutScheduled = false;
      this._layoutRangeHighlightsCurrentView();
    });
  }

  _ensureRangeLayer() {
    // Ensure an overlay layer exists for range highlights.
    const host = this.scrollEl || this.body;
    const cs = getComputedStyle(host);
    if (cs.position === 'static') host.style.position = 'relative';
    if (!this._rangeLayer || !host.contains(this._rangeLayer)) {
      this._rangeLayer = document.createElement('div');
      this._rangeLayer.className = 'pxc-range-layer';
      this._rangeLayer.setAttribute('aria-hidden','true');
      host.appendChild(this._rangeLayer);
    }
    return this._rangeLayer;
  }

  _layoutRangeHighlightsCurrentView() {
    // Layout visual highlight boxes for the current view based on ranges.
    const layer = this._ensureRangeLayer?.();
    if (!layer) return;
    layer.innerHTML = '';
    if (!this._rangeHls || !this._rangeHls.length) return;
    const view = (this.mode === 'hl') ? this.viewHL : this.viewPlain;
    if (!view || !view.isConnected) return;
    const scrollRect = this.scrollEl.getBoundingClientRect();
    const ch   = this._chWidthPx();
    const pad  = this.opts.rangeHighlightPadPx|0;
    const base = this.opts.lineNumbers ? (this.opts.lineNumbersStart || 1) : 1;
    const cellRectToLayer = (cellRect) => ({
      top:    cellRect.top  - scrollRect.top  + this.scrollEl.scrollTop  - pad,
      left:   cellRect.left - scrollRect.left + this.scrollEl.scrollLeft,
      right: (cellRect.right- scrollRect.left + this.scrollEl.scrollLeft),
      height: cellRect.height + pad*2
    });
    for (const raw of this._rangeHls) {
      const { sLine, sCol, eLine, eCol, className } = this._normalizeRange(raw);
      for (let ln = sLine; ln <= eLine; ln++) {
        // rispetta l’offset di numerazione visibile (base)
        const lineEl = this.opts.lineNumbers
          ? view.querySelector(`.pxc-line[data-ln="${ln}"]`)
          : view.querySelectorAll('.pxc-line')[ln - base] || null;
        if (!lineEl) continue;
        const cell = lineEl.querySelector('.pxc-code');
        if (!cell) continue;
        const cr  = cell.getBoundingClientRect();
        const rel = cellRectToLayer(cr);
        const cellLeft  = rel.left;
        const cellRight = rel.right;
        let left  = cellLeft;
        let right = cellRight;
        if (ln === sLine) left  = Math.max(cellLeft,  Math.min(cellLeft + (sCol|0) * ch, cellRight));
        if (ln === eLine) right = Math.max(cellLeft,  Math.min(cellLeft + (eCol|0) * ch, cellRight));
        const width  = Math.max(1, right - left);
        const height = rel.height;
        if (width <= 1 || height <= 0) continue;
        const box = document.createElement('div');
        box.className = ('pxc-hlbox ' + className).trim();
        box.style.top    = rel.top + 'px';
        box.style.left   = left    + 'px';
        box.style.width  = width   + 'px';
        box.style.height = height  + 'px';
        layer.appendChild(box);
      }
    }
  }

  _chWidthPx() {
    // Measure and cache the width of one character in pixels.
    if (this._chPx) return this._chPx;
    const probe = document.createElement('span');
    probe.textContent = '0';
    probe.style.visibility = 'hidden';
    probe.style.position = 'absolute';
    probe.style.font = getComputedStyle(this.body).font;
    this.body.appendChild(probe);
    const w = probe.getBoundingClientRect().width || 8;
    probe.remove();
    this._chPx = w;
    return w;
  }

  _normalizeRange(h) {
    // Normalize a range object into consistent { sLine, sCol, eLine, eCol, className } form.
    let sLine = h?.sLine ?? h?.startLine ?? h?.from?.line;
    let sCol  = h?.sCol  ?? h?.startCol  ?? h?.from?.col;
    let eLine = h?.eLine ?? h?.endLine   ?? h?.to?.line;
    let eCol  = h?.eCol  ?? h?.endCol    ?? h?.to?.col;
    sLine = Number.isFinite(sLine) ? sLine : 1;
    sCol  = Number.isFinite(sCol ) ? sCol  : 0;
    eLine = Number.isFinite(eLine) ? eLine : sLine;
    eCol  = Number.isFinite(eCol ) ? eCol  : sCol;
    if (eLine < sLine || (eLine === sLine && eCol < sCol)) {
      [sLine, eLine] = [eLine, sLine];
      [sCol,  eCol ] = [eCol,  sCol ];
    }
    return { sLine, sCol, eLine, eCol, className: (h?.className||'').trim() };
  }

  _setupRuler() {
    // Setup and mount the column ruler if enabled.
    if (!this.opts.ruler) {
      if (this._rulerOff) { try{ this._rulerOff(); }catch{} this._rulerOff = null; }
      if (this._rulerEl && this._rulerEl.parentNode) this._rulerEl.parentNode.removeChild(this._rulerEl);
      this._rulerEl = null;
      return;
    }
    if (!this._rulerEl) {
      const r = document.createElement('div');
      r.className = 'pxc-ruler';
      r.setAttribute('aria-hidden','true');
      r.style.whiteSpace = 'pre';
      r.style.userSelect = 'none';
      this._rulerEl = r;
      if (!this._rulerOff) {
        this._rulerOff = this._onBodyScroll('ruler', () => this._updateRuler());
      }
      this.on?.('toggleHL', () => this._updateRuler());
    }
    this._repositionRuler();
    this._updateRuler();
  }

  _repositionRuler() {
    // Place the ruler element above or below the code block depending on settings.
    if (!this._rulerEl || !this.scrollEl) return;
    const pre = this.scrollEl.querySelector('pre');
    if (!pre) return;
    this._rulerEl.classList.toggle('ruler-bottom', this.opts.rulerPosition === 'bottom');
    if (this.opts.rulerPosition === 'bottom') {
      if (this._rulerEl.parentNode !== this.scrollEl || this._rulerEl.previousSibling !== pre) {
        this.scrollEl.appendChild(this._rulerEl);
      }
    } else {
      if (this._rulerEl.parentNode !== this.scrollEl || this._rulerEl.nextSibling !== pre) {
        this.scrollEl.insertBefore(this._rulerEl, pre);
      }
    }
  }

  _updateRuler() {
    // Update ruler content and alignment based on current text and style.
    if (!this._rulerEl || !this.opts.ruler) return;
    if (this.root.classList.contains('pxc-bare')) {
      const gap = (parseFloat(getComputedStyle(this.root).getPropertyValue('--pxc-gap')) || 8) * 2;
    }
    const text = this.viewText || '';
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    let colMax = 0;
    for (const l of lines) if (l.length > colMax) colMax = l.length;
    colMax = Math.min(colMax || 0, 1000);
    if (this.opts.rulerStyle === 'full') {
      let tens = '';
      for (let i = 1; i <= colMax; i++) tens += (i % 10 === 0) ? String(Math.floor(i/10) % 10) : ' ';
      const units = '1234567890'.repeat(Math.ceil(colMax/10)).slice(0, colMax);
      this._rulerEl.textContent = (tens || '') + '\n' + (units || '');
      this._rulerEl.classList.remove("ruler-decades");
      this._rulerEl.classList.add("ruler-full");
    } else {
      let line = '';
      for (let i = 1; i <= colMax; i++) line += (i % 10 === 0) ? String(Math.floor(i/10) % 10) : '.';
      this._rulerEl.textContent = line || '';
    this._rulerEl.classList.remove("ruler-full");
      this._rulerEl.classList.add("ruler-decades");
    }
    const view = this._getActiveView?.();
    const cell = view?.querySelector('.pxc-line .pxc-code');
    if (cell && this.scrollEl) {
      const scrollRect = this.scrollEl.getBoundingClientRect();
      const cellRect   = cell.getBoundingClientRect();
      let extra = 0;
      if (this.root.classList.contains('pxc-bare')) {
        const cs  = getComputedStyle(this.root);
        const gap = parseFloat(cs.getPropertyValue('--pxc-gap')) || 8;
        extra = gap * 2;
      }
      const left = (cellRect.left - scrollRect.left) + (this.scrollEl.scrollLeft-16)+extra;
      this._rulerEl.style.paddingLeft = Math.max(0, Math.round(left)) + 'px';
      const codeFont = getComputedStyle(this.body).font;
      if (codeFont) this._rulerEl.style.font = codeFont;
    }
  }

  _initTheme() {
    // Initialize theme variables and apply the starting theme.
    this._themeVars = { dark:{}, light:{}, funky:{}, relax:{} };
    this.setTheme(this.opts?.theme ?? 'dark', { silent:true });
  }

  _applyTheme(value) {
    // Apply a theme by name, or auto/system if requested.
    const t = (value || 'auto').toLowerCase();
    if (t === 'auto' || t === 'system') {
      this._ensureMQ();
      this._setThemeAttr(this._mq.matches ? 'dark' : 'light');
    } else {
      this._teardownMQ();
      this._setThemeAttr(t);
    }
     this._emit?.('themechange', { theme: this.root.dataset.theme, requested: t });
  }

  _ensureMQ() {
    // Ensure a matchMedia listener is set up for auto/system theme detection.
    if (this._mq) return;
    this._mq = window.matchMedia('(prefers-color-scheme: dark)');
    this._onMQ = (e) => {
      if (this.opts.theme === 'auto') {
        this._setThemeAttr(e.matches ? 'dark' : 'light');
      }
    };
    if (this._mq.addEventListener) this._mq.addEventListener('change', this._onMQ);
    else this._mq.addListener(this._onMQ);
  }

  _teardownMQ() {
    // Remove matchMedia listener for theme changes.
    if (this._mq && this._onMQ) {
      if (this._mq.removeEventListener) this._mq.removeEventListener('change', this._onMQ);
      else this._mq.removeListener(this._onMQ);
    }
    this._mq = null;
    this._onMQ = null;
  }

  _setThemeAttr(val) {
    // Set the `data-theme` attribute on the root element.
    if (val) this.root.dataset.theme = val;
    else delete this.root.dataset.theme;
  }

  _applyInlineVars(varsOrNull) {
    // Apply inline CSS variables for theme customization.
    if (!this.root) return;
    const st = this.root.style;
    if (Array.isArray(this._inlineThemeKeys)){
      for (const k of this._inlineThemeKeys) st.removeProperty(k);
    }
    this._inlineThemeKeys = [];
    if (!varsOrNull) return;
    const ensureName = k => k.startsWith('--pcode-') ? k : `--pcode-${k}`;
    for (const [k,v] of Object.entries(varsOrNull)){
      const prop = ensureName(k);
      st.setProperty(prop, v);
      this._inlineThemeKeys.push(prop);
    }
  }

  _ensureToastHost() {
    // Ensure a toast notification host exists inside the editor.
    if (this._toastHost && this._toastHost.isConnected) return this._toastHost;
    const host = document.createElement('div');
    host.className = 'pxc-toast-host';
    host.setAttribute('aria-live','polite');
    host.setAttribute('aria-atomic','true');
    host.style.position = 'absolute';
    host.style.left = '0'; host.style.right = '0';
    host.style.pointerEvents = 'none';
    this.scrollEl.appendChild(host);
    this._toastHost = host;
    this._positionToastHost();
    this._onWin('resize', () => this._positionToastHost());
    return host;
  }
  
  _positionToastHost() {
    // Position the toast host at top or bottom of the editor area.
    if (!this._toastHost) return;
    const where = (this.opts.toastPosition || 'bottom');
    this._toastHost.style.top = where === 'top' ? '8px' : '';
    this._toastHost.style.bottom = where === 'bottom' ? '8px' : '';
  }
}

// Auto init
// PWAxcode.autoInit();