/**
 * PWAxcode – React (JSX) language plugin
 * - Detects JSX / React imports
 * - Tokenizes JS + JSX (tags, attrs, strings, numbers, comments, JSX expr {...})
 * - Auto-indents braces and simple JSX tag structure
 *
 * Usage:
 *   PWAxcode.registerLanguage(ReactJSXPlugin);
 *   api.setOption('lang','react'); // or leave 'auto' to let detect() decide
 */
(function () {
  const ReactJSXPlugin = {
    id: 'react',

    // ---------- DETECT ----------
    // Return a score 0..1. We boost when we see JSX syntax or React imports/hooks.
    detect(txt) {
      let score = 0;
      // Common JSX patterns
      if (/<\s*[A-Za-z][A-Za-z0-9:_-]*\s*[\s/>]/.test(txt)) score += 0.6;
      if (/\{[\s\S]*\}/.test(txt) && /<\s*[A-Za-z]/.test(txt)) score += 0.2;
      // React hints
      if (/\bfrom\s+['"]react['"]/.test(txt) || /\bimport\s+React\b/.test(txt)) score += 0.3;
      if (/\buseState\s*\(|\buseEffect\s*\(/.test(txt)) score += 0.1;
      return Math.min(1, score);
    },

    // ---------- TOKENIZE ----------
    // Single-pass tokenizer. Emits [{ text, type? }, ...]
    // Notes:
    //  - Preserve every char (newline as '\n')
    //  - 'type' names map to theme classes (e.g., .kw, .fn, .str, .num, .com, .tag, .attr, .pun)
    tokenize(src) {
      const tokens = [];
      const push = (type, text) => tokens.push({ type, text });
      const pushTxt = (text) => tokens.push({ text });

      // JS keyword set (compact)
      const KW = new Set([
        'import','export','default','return','if','else','for','while','do','switch','case','break','continue',
        'try','catch','finally','throw','class','extends','super','new','const','let','var','function','async','await',
        'in','of','instanceof','typeof','void','delete','yield','with','this'
      ]);
      const LIT = new Set(['true','false','null','undefined','NaN','Infinity']);
      const isWS = c => /\s/.test(c);

      let i = 0, n = src.length;

      // --- helpers ---
      const readWhile = pred => { const j=i; while (i<n && pred(src[i])) i++; return src.slice(j,i); };
      const readNumber = () => {
        const j=i;
        if (src[i]==='0' && /[boxBOX]/.test(src[i+1])) { i+=2; readWhile(ch=>/[0-9a-fA-F]/.test(ch)); }
        else {
          readWhile(ch=>/[0-9]/.test(ch));
          if (src[i]==='.') { i++; readWhile(ch=>/[0-9]/.test(ch)); }
          if (/[eE]/.test(src[i])) { i++; if (/[+-]/.test(src[i])) i++; readWhile(ch=>/[0-9]/.test(ch)); }
        }
        return src.slice(j,i);
      };
      const readJSString = (q) => {
        let out = src[i++]; // opening quote
        if (q==='`') {
          let depth = 0; // ${...} depth inside template
          while (i<n) {
            const c = src[i]; out += c; i++;
            if (c==='\\' && i<n) { out += src[i]; i++; continue; }
            if (c==='$' && src[i]==='{' ) { out += src[i++]; depth++; continue; }
            if (c==='}' && depth>0) { depth--; continue; }
            if (c==='`' && depth===0) break;
          }
          return out;
        }
        while (i<n) {
          const c = src[i]; out += c; i++;
          if (c==='\\' && i<n) { out += src[i]; i++; continue; }
          if (c===q) break;
        }
        return out;
      };

      // JSX scanning state
      let inJSX = false;        // we're between a <Tag> ... </Tag>
      let jsxDepth = 0;         // nested JSX element depth
      let inTag = false;        // currently inside "<Tag ... >" attribute area
      let inBlockCom = false;   // JS block comment /* ... */
      let inLineCom  = false;   // JS line comment //
      let inStr = false, q='"'; // JS string
      // when inside JSX attribute or child, we may hit { expr }; track nested braces
      let jsxExprDepth = 0;

      // quick checks for tag/attr names
      const isNameStart = c => /[A-Za-z:_]/.test(c);
      const isNameChar  = c => /[A-Za-z0-9:_.-]/.test(c);
      const readName = () => readWhile(isNameChar);
      const readQuoted = (qq) => { // for JSX attr values
        let out = src[i++]; // quote
        while (i<n) {
          const c = src[i]; out += c; i++;
          if (c==='\\' && i<n) { out += src[i]; i++; continue; }
          if (c===qq) break;
        }
        return out;
      };

      // emit JSX text nodes until special char
      const readJSXText = () => {
        const j=i;
        while (i<n && src[i] !== '<' && src[i] !== '{' && src[i] !== '\n') i++;
        if (j<i) push('txt', src.slice(j,i));
      };

      // main loop
      while (i < n) {
        const ch = src[i], nx = src[i+1];

        // Newline always as its own token
        if (ch === '\n') { pushTxt('\n'); i++; inLineCom = false; continue; }

        // JS/JSX whitespace
        if (!inStr && !inTag && jsxExprDepth===0 && isWS(ch)) { pushTxt(readWhile(isWS)); continue; }

        // Comments (JS or outside JSX text)
        if (!inStr && !inTag && jsxExprDepth===0 && ch==='/' && nx==='/' ) {
          let j=i+2; while (j<n && src[j] !== '\n') j++;
          push('com', src.slice(i,j)); i=j; inLineCom=true; continue;
        }
        if (!inStr && ch==='/' && nx==='*') {
          let j=i+2; while (j<n && !(src[j]==='*' && src[j+1]==='/')) j++;
          j = Math.min(n, j+2); push('com', src.slice(i,j)); i=j; inBlockCom=false; continue;
        }

        // JS strings
        if (!inTag && jsxExprDepth===0 && (ch==='"' || ch==="'" || ch==='`')) {
          push('str', readJSString(ch)); continue;
        }

        // JSX expression braces {...}
        if (inJSX && ch === '{') { jsxExprDepth++; push('pun', '{'); i++; continue; }
        if (inJSX && jsxExprDepth>0) {
          // inside { ... } treat like JS mini-mode (strings, nested {}, comments)
          if (ch === '}') { jsxExprDepth--; push('pun','}'); i++; continue; }
          if (ch==='"'||ch==="'"||ch==='`'){ push('str', readJSString(ch)); continue; }
          if (ch==='/' && nx==='/'){ let j=i+2; while(j<n && src[j] !== '\n') j++; push('com', src.slice(i,j)); i=j; continue; }
          if (ch==='/' && nx==='*'){ let j=i+2; while(j<n && !(src[j]==='*'&&src[j+1]==='/')) j++; j=Math.min(n,j+2); push('com', src.slice(i,j)); i=j; continue; }
          if (/[0-9]/.test(ch) || (ch==='.' && /[0-9]/.test(nx))) { push('num', readNumber()); continue; }
          if (/[A-Za-z_$]/.test(ch)) {
            const j=i; i++; while (i<n && /[A-Za-z0-9_$]/.test(src[i])) i++;
            const id = src.slice(j,i);
            if (KW.has(id)) push('kw', id);
            else if (LIT.has(id)) push('lit', id);
            else {
              // function heuristic
              let k=i; while (k<n && /\s/.test(src[k])) k++;
              if (src[k]==='(') push('fn', id); else pushTxt(id);
            }
            continue;
          }
          // operators/punct
          if (',;()[]?.:+-/*%<>=!&|^~'.includes(ch)) { push('pun', ch); i++; continue; }
          // fallback
          pushTxt(ch); i++; continue;
        }

        // JSX tag open/close
        if (ch === '<' && !inStr) {
          // Heuristic: if next is letter or '/', we consider it JSX, not the '<' operator
          if (/[A-Za-z/]/.test(nx)) {
            inJSX = true; inTag = true;
            push('pun','<'); i++;
            if (src[i] === '/') { push('pun','/'); i++; }
            // tag name
            if (isNameStart(src[i])) {
              const name = readName();
              push('tag', name);
            }
            // attributes
            while (i<n) {
              // end of tag?
              if (src[i] === '>' ) { push('pun','>'); i++; inTag = false; jsxDepth++; break; }
              if (src[i] === '/' && src[i+1] === '>') { push('pun','/'); push('pun','>'); i+=2; inTag = false; /* self-closing */ break; }
              // space
              if (isWS(src[i])) { pushTxt(readWhile(isWS)); continue; }
              // attr name
              if (isNameStart(src[i])) {
                const an = readName(); push('attr', an);
                // optional value
                if (isWS(src[i])) pushTxt(readWhile(isWS));
                if (src[i] === '=') {
                  push('pun','='); i++;
                  if (isWS(src[i])) pushTxt(readWhile(isWS));
                  if (src[i] === '"' || src[i] === "'") { push('str', readQuoted(src[i])); continue; }
                  if (src[i] === '{') { jsxExprDepth++; push('pun','{'); i++; continue; }
                  // bare attr value (rare)
                  const j=i; while (i<n && !/\s|\/|>/.test(src[i])) i++;
                  if (j<i) push('str', src.slice(j,i));
                }
                continue;
              }
              // unexpected char inside tag
              push('pun', src[i]); i++;
            }
            // if we ended with self-closing "/>", do not increase depth
            if (tokens.length>=2) {
              const t1 = tokens[tokens.length-2], t2 = tokens[tokens.length-1];
              if (t1 && t2 && t1.text==='/' && t2.text==='>') { /* self-close: do not count as open */ }
            }
            continue;
          }
        }

        // JSX close tag (outside attribute area)
        if (inJSX && !inTag && ch === '<' && nx === '/') {
          // read closing tag
          push('pun','<'); push('pun','/'); i+=2;
          if (isNameStart(src[i])) { const name = readName(); push('tag', name); }
          if (src[i] === '>') { push('pun','>'); i++; }
          if (jsxDepth>0) jsxDepth--;
          // exits JSX when last tag closed
          if (jsxDepth===0) inJSX = false;
          continue;
        }

        // JSX child text / nested elements
        if (inJSX && !inTag) {
          if (ch === '{') { jsxExprDepth++; push('pun','{'); i++; continue; }
          if (ch === '<') { /* next loop handles open/close tags */ continue; }
          // accumulate text until '<' or '{' or newline
          readJSXText();
          continue;
        }

        // --- Regular JS (outside JSX) ---
        // numbers
        if (/[0-9]/.test(ch) || (ch==='.' && /[0-9]/.test(nx))) { push('num', readNumber()); continue; }
        // identifiers/keywords/functions
        if (/[A-Za-z_$]/.test(ch)) {
          const j=i; i++; while (i<n && /[A-Za-z0-9_$]/.test(src[i])) i++;
          const id = src.slice(j,i);
          if (KW.has(id)) push('kw', id);
          else if (LIT.has(id)) push('lit', id);
          else {
            let k=i; while (k<n && /\s/.test(src[k])) k++;
            if (src[k]==='(') push('fn', id); else pushTxt(id);
          }
          continue;
        }
        // punctuation/operators
        if (',;(){}[]?.:+-/*%<>=!&|^~'.includes(ch)) { push('pun', ch); i++; continue; }

        // fallback (always advance!)
        pushTxt(ch); i++;
      }
      return tokens;
    },

    // ---------- AUTO-INDENT ----------
    // Brace-based indent with simple JSX tag support.
    autoIndent(text, size = 2) {
      const lines = text.replace(/\r\n?/g, '\n').split('\n');
      let depth = 0;
      let inBlockCom = false, inStr = false, q = '', inTemplate = false, tplExprDepth = 0;
      const out = [];

      const startsWithClosing = (s) => {
        const t = s.trimStart();
        return t.startsWith('}') || t.startsWith(');') || t.startsWith('</');
      };

      for (let raw of lines) {
        const stripped = raw.replace(/^[ \t]+/, '');
        // pre-dedent for lines starting with closing brace or closing JSX tag
        let level = startsWithClosing(stripped) ? Math.max(0, depth - 1) : depth;
        out.push(' '.repeat(level * size) + stripped);

        // update structural depth scanning the *raw* line
        let i = 0, n = raw.length, inLineCom = false;
        while (i < n) {
          const ch = raw[i], nx = raw[i+1];
          if (inLineCom) break;

          // comments
          if (inBlockCom) { if (ch==='*' && nx=== '/') { inBlockCom=false; i+=2; continue; } i++; continue; }
          if (ch==='/' && nx==='*') { inBlockCom = true; i+=2; continue; }
          if (ch==='/' && nx==='/' ) { inLineCom = true; break; }

          // strings
          if (inStr) {
            if (ch==='\\') { i+=2; continue; }
            if (inTemplate && ch==='$' && nx==='{') { tplExprDepth++; i+=2; continue; }
            if (inTemplate && ch==='}' && tplExprDepth>0) { tplExprDepth--; i++; continue; }
            if (ch===q && (!inTemplate || tplExprDepth===0)) { inStr=false; inTemplate=false; i++; continue; }
            i++; continue;
          }
          if (ch==='"' || ch==="'" || ch==='`') {
            inStr = true; q = ch; inTemplate = (ch==='`'); tplExprDepth = 0; i++; continue;
          }

          // JSX tags influence depth just like braces: <Tag> ++, </Tag> --
          if (ch === '<') {
            // close tag
            if (nx === '/') { depth = Math.max(0, depth - 1); i += 2; continue; }
            // self-closing: <Tag ... />
            let k=i+1; while (k<n && raw[k] !== '>') k++;
            const selfClosing = k>i && raw[k-1] === '/';
            if (!selfClosing) depth++;
            i = Math.min(n, k+1);
            continue;
          }

          // JS braces
          if (ch === '{') { depth++; i++; continue; }
          if (ch === '}') { depth = Math.max(0, depth - 1); i++; continue; }

          i++;
        }
      }
      return out.join('\n');
    }
  };

  // Register once
  if (window.PWAxcode && typeof PWAxcode.registerLanguage === 'function') {
    PWAxcode.registerLanguage(ReactJSXPlugin);
  } else {
    // If the script runs before PWAxcode is loaded, expose it globally to register later.
    window.__PXC_LANG_REACT__ = ReactJSXPlugin;
  }
})();
