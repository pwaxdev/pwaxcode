/**
 * PWAxcode – Mixed HTML + JS language plugin
 * id: 'htmljs'
 *
 * Features
 * - Detects HTML documents with <script> blocks (type empty|text/javascript|module)
 * - Tokenizes HTML (tags, attrs, strings, comments, doctype, entities, text)
 * - Tokenizes JavaScript inside <script>…</script> blocks
 * - Auto-indent: HTML depth + JS braces within <script>
 *
 * Usage:
 *   PWAxcode.registerLanguage(HTMLJSPlugin);
 *   new PWAxcode(el, { highlight:true, lang:'htmljs' });
 *   // or keep lang:'auto' and let detect() pick it
 */
(function () {
  const HTMLJSPlugin = {
    id: 'htmljs',

    // -------- DETECT --------
    detect(txt) {
      // Basic HTML hints
      let score = 0;
      if (/<!DOCTYPE|<html|<\/?[a-z-]/i.test(txt)) score += 0.5;
      if (/<script\b[^>]*>/i.test(txt)) score += 0.4;
      return Math.min(1, score);
    },

    // -------- TOKENIZE --------
    tokenize(src) {
      const out = [];
      const push = (type, text) => out.push({ type, text });
      const pushTxt = (text) => out.push({ text });

      const len = src.length;
      let i = 0;

      // --- HTML helpers ---
      const isWS = c => /[\s\f]/.test(c);
      const isNameStart = c => /[A-Za-z]/.test(c);
      const isNameChar  = c => /[A-Za-z0-9:_-]/.test(c);
      const isAttrChar  = c => /[A-Za-z0-9:_-]/.test(c);
      const readWhile = pred => { const j=i; while (i<len && pred(src[i])) i++; return src.slice(j,i); };
      const readUntil = needle => { const j=i; const k = src.toLowerCase().indexOf(needle.toLowerCase(), i); i = (k === -1) ? len : k + needle.length; return src.slice(j,i); };
      const readQuoted = q => { let out=''; out += src[i++]; while (i<len) { const c=src[i]; out+=c; i++; if (c==='\\' && i<len) { out+=src[i]; i++; continue; } if (c===q) break; } return out; };

      // --- Minimal JS tokenizer (safe subset) ---
      const JSTOK = (() => {
        const KW = new Set([
          'import','export','default','return','if','else','for','while','do','switch','case','break','continue',
          'try','catch','finally','throw','class','extends','super','new','const','let','var','function','async','await',
          'in','of','instanceof','typeof','void','delete','yield','with','this'
        ]);
        const LIT = new Set(['true','false','null','undefined','NaN','Infinity']);
        const isIdStart = c => /[A-Za-z_$]/.test(c);
        const isIdPart  = c => /[A-Za-z0-9_$]/.test(c);
        const readWhile = (s, pred, k) => { const j=k.i; while (k.i<s.length && pred(s[k.i])) k.i++; return s.slice(j,k.i); };
        const readNumber = (s, k) => {
          const j=k.i;
          if (s[k.i]==='0' && /[boxBOX]/.test(s[k.i+1])) { k.i+=2; readWhile(s, ch=>/[0-9a-fA-F]/.test(ch), k); }
          else {
            readWhile(s, ch=>/[0-9]/.test(ch), k);
            if (s[k.i]==='.') { k.i++; readWhile(s, ch=>/[0-9]/.test(ch), k); }
            if (/[eE]/.test(s[k.i])) { k.i++; if (/[+-]/.test(s[k.i])) k.i++; readWhile(s, ch=>/[0-9]/.test(ch), k); }
          }
          return s.slice(j,k.i);
        };
        const readString = (s, k, q) => {
          let out = s[k.i++]; // open
          if (q==='`') {
            let depth = 0;
            while (k.i < s.length) {
              const c = s[k.i]; out += c; k.i++;
              if (c==='\\' && k.i < s.length) { out += s[k.i]; k.i++; continue; }
              if (c==='$' && s[k.i]==='{') { out += s[k.i++]; depth++; continue; }
              if (c==='}' && depth>0) { depth--; continue; }
              if (c==='`' && depth===0) break;
            }
            return out;
          }
          while (k.i < s.length) {
            const c = s[k.i]; out += c; k.i++;
            if (c==='\\' && k.i < s.length) { out += s[k.i]; k.i++; continue; }
            if (c===q) break;
          }
          return out;
        };
        function tokenizeJS(s, emit) {
          const k = { i:0 };
          while (k.i < s.length) {
            const ch = s[k.i], nx = s[k.i+1];
            if (ch === '\n') { emit(null, '\n'); k.i++; continue; }
            if (/\s/.test(ch)) { emit(null, readWhile(s, c=>/\s/.test(c) && c!=='\n', k)); continue; }
            if (ch==='/' && nx==='/' ) { let j=k.i+2; while (j<s.length && s[j]!=='\n') j++; emit('com', s.slice(k.i,j)); k.i=j; continue; }
            if (ch==='/' && nx==='*' ) { let j=k.i+2; while (j<s.length && !(s[j]==='*'&&s[j+1]==='/')) j++; j=Math.min(s.length,j+2); emit('com', s.slice(k.i,j)); k.i=j; continue; }
            if (ch==='"' || ch==="'" || ch==='`') { emit('str', readString(s,k,ch)); continue; }
            if (/[0-9]/.test(ch) || (ch==='.' && /[0-9]/.test(nx))) { emit('num', readNumber(s,k)); continue; }
            if (isIdStart(ch)) {
              const j=k.i; k.i++;
              while (k.i<s.length && isIdPart(s[k.i])) k.i++;
              const id = s.slice(j,k.i);
              if (KW.has(id)) emit('kw', id);
              else if (LIT.has(id)) emit('lit', id);
              else {
                let t = k.i; while (t<s.length && /\s/.test(s[t])) t++;
                if (s[t]==='(') emit('fn', id); else emit(null, id);
              }
              continue;
            }
            if (',;(){}[]?:.'.includes(ch)) { emit('pun', ch); k.i++; continue; }
            if ('+-*%<>=!&|^~'.includes(ch)) {
              const j=k.i; k.i++;
              if (k.i<s.length && '=<>|&+-'.includes(s[k.i])) k.i++;
              if (k.i<s.length && s[k.i]==='=') k.i++;
              emit('pun', s.slice(j,k.i)); continue;
            }
            emit(null, ch); k.i++;
          }
        }
        return { tokenizeJS };
      })();

      // --- main loop ---
      while (i < len) {
        const ch = src[i], nx = src[i+1];

        // newline
        if (ch === '\n') { pushTxt('\n'); i++; continue; }

        // entities
        if (ch === '&') {
          const j = src.indexOf(';', i+1);
          if (j !== -1) { push('ent', src.slice(i, j+1)); i = j+1; continue; }
        }

        // comments
        if (src.startsWith('<!--', i)) { push('com', readUntil('-->')); continue; }
        if (src.startsWith('<!DOCTYPE', i) || src.startsWith('<!doctype', i) || src.startsWith('<![CDATA[', i)) {
          push('doctype', readUntil(src.startsWith('<![CDATA[', i) ? ']]>' : '>')); continue;
        }

        // opening tag
        if (ch === '<') {
          // store raw start
          push('pun','<'); i++;
          // closing?
          if (src[i] === '/') { push('pun','/'); i++; }
          // tag name
          if (isNameStart(src[i])) {
            const name = readWhile(isNameChar);
            push('tag', name);
            const lowerName = name.toLowerCase();

            // attributes loop
            while (i < len) {
              // end of tag?
              if (src[i] === '>') { push('pun','>'); i++; break; }
              if (src[i] === '/' && src[i+1] === '>') { push('pun','/'); push('pun','>'); i+=2; break; }
              // spacing
              if (isWS(src[i])) { pushTxt(readWhile(c=>isWS(c), i=>i)); }
              if (isWS(src[i])) { pushTxt(readWhile(isWS)); continue; }
              // attribute
              if (isAttrChar(src[i])) {
                const an = readWhile(isAttrChar);
                push('attr', an);
                if (isWS(src[i])) pushTxt(readWhile(isWS));
                if (src[i] === '=') {
                  push('pun','='); i++;
                  if (isWS(src[i])) pushTxt(readWhile(isWS));
                  if (src[i] === '"' || src[i] === "'") { push('str', readQuoted(src[i])); continue; }
                  // {…} not valid in pure HTML, but allow bare values
                  const j=i; while (i<len && !/[\s/>]/.test(src[i])) i++;
                  if (j<i) push('str', src.slice(j,i));
                }
                continue;
              }
              // fallback single char within tag
              if (i < len && src[i] !== '>' && !(src[i] === '/' && src[i+1] === '>')) { push('pun', src[i]); i++; }
            }

            // If it's a <script> open tag, stream JS until </script>
            if (lowerName === 'script') {
              // peek attributes we just read to check type
              // (simplified: we treat '', 'text/javascript', and 'module' as JS)
              const openEnd = i; // position right after '>'
              const closeIdx = src.toLowerCase().indexOf('</script', openEnd);
              const contentEnd = (closeIdx === -1) ? len : closeIdx;

              // Extract script content
              const code = src.slice(openEnd, contentEnd);
              if (code) {
                // tokenize JS content
                JSTOK.tokenizeJS(code, (type, text) => {
                  if (type) push(type, text); else pushTxt(text);
                });
              }

              // Emit closing tag if present
              if (closeIdx !== -1) {
                i = closeIdx;
                push('pun','<'); i++;
                push('pun','/'); i++;
                // read 'script'
                readWhile(isNameChar); push('tag','script');
                if (src[i] === '>') { push('pun','>'); i++; }
              } else {
                i = contentEnd;
              }
              continue;
            }
            // done handling a generic tag, go next char
            continue;
          }

          // fallback: treat any other '<' as text + keep moving
          pushTxt('<'); // we already consumed '<'
          continue;
        }

        // plain text
        pushTxt(ch);
        i++;
      }

      return out;
    },

    // -------- AUTO-INDENT --------
    autoIndent(text, size = 2) {
      const lines = text.replace(/\r\n?/g, '\n').split('\n');
      let depth = 0;                 // overall indent depth (HTML + JS braces)
      let inJS = false;              // inside <script> ... </script>
      let inBlockCom = false;        // JS block comment
      let inStr = false, q = '', inTemplate = false, tplDepth = 0;

      const startsWithClosing = s => {
        const t = s.trimStart();
        if (inJS) return /^(\}|\)|\]|<\/script\b)/i.test(t);
        return /^<\/[a-z0-9:-]+\b/i.test(t);
      };

      const out = [];
      for (let raw of lines) {
        const stripped = raw.replace(/^[ \t]+/, '');

        // pre-dedent for closing lines
        const level = startsWithClosing(stripped) ? Math.max(0, depth - 1) : depth;
        out.push(' '.repeat(level * size) + stripped);

        // update depth scanning
        let i = 0, n = raw.length, inLineCom = false;
        while (i < n) {
          const ch = raw[i], nx = raw[i+1];

          // comments
          if (inLineCom) break;
          if (inJS && inBlockCom) { if (ch==='*' && nx=== '/') { inBlockCom = false; i += 2; continue; } i++; continue; }
          if (inJS && ch==='/' && nx==='*') { inBlockCom = true; i += 2; continue; }
          if (inJS && ch==='/' && nx==='/' ) { inLineCom = true; break; }

          // strings (JS mode)
          if (inJS && inStr) {
            if (ch==='\\') { i+=2; continue; }
            if (inTemplate && ch==='$' && nx==='{') { tplDepth++; i+=2; continue; }
            if (inTemplate && ch==='}' && tplDepth>0) { tplDepth--; i++; continue; }
            if (ch===q && (!inTemplate || tplDepth===0)) { inStr=false; inTemplate=false; i++; continue; }
            i++; continue;
          }

          // detect <script ...> or </script>
          if (!inJS && ch === '<') {
            // open
            if (/^<\s*script\b/i.test(raw.slice(i))) { depth++; inJS = true; // entering script increases one level like a block
              // fast forward to '>'
              const k = raw.indexOf('>', i);
              i = (k === -1) ? n : k + 1;
              continue;
            }
            // close generic tag
            if (/^<\s*\/\s*[a-z0-9:-]+/i.test(raw.slice(i))) { depth = Math.max(0, depth - 1); }
            // fast forward to '>'
            const k = raw.indexOf('>', i);
            i = (k === -1) ? n : k + 1;
            continue;
          }
          if (inJS && /^<\/\s*script\b/i.test(raw.slice(i))) {
            // closing script reduces depth and leaves JS mode
            depth = Math.max(0, depth - 1);
            inJS = false;
            const k = raw.indexOf('>', i);
            i = (k === -1) ? n : k + 1;
            continue;
          }

          // JS braces when in script
          if (inJS) {
            if (ch==='"' || ch==="'" || ch==='`') { inStr = true; q = ch; inTemplate = (ch==='`'); tplDepth = 0; i++; continue; }
            if (ch === '{' || ch === '(' || ch === '[') { depth++; i++; continue; }
            if (ch === '}' || ch === ')' || ch === ']') { depth = Math.max(0, depth - 1); i++; continue; }
          }

          // HTML tag open (non-script) increases, close decreases – already handled on '<' above.

          i++;
        }
      }
      return out.join('\n');
    }
  };

  if (window.PWAxcode && typeof PWAxcode.registerLanguage === 'function') {
    PWAxcode.registerLanguage(HTMLJSPlugin);
  } else {
    window.__PXC_LANG_HTMLJS__ = HTMLJSPlugin;
  }
})();
