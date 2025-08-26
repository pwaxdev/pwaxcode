
/**
 * PWAxcode – PHP language plugin (HTML + PHP)
 * id: 'php'
 *
 * Features
 *  - Detects mixed HTML/PHP (<?php, <?=, <?)
 *  - HTML tokenizer (tags, attrs, comments, doctype, entities, text)
 *  - PHP tokenizer:
 *      • keywords (PHP 8+), literals (true/false/null), numbers (underscores)
 *      • strings (single/double with escapes & interpolation), backticks
 *      • heredoc / nowdoc (<<<IDENT ... IDENT;)
 *      • variables $foo, $this, ${expr}, object/namespace ops (->, ?->, ::, \)
 *      • comments 
 *      • attributes #[Attr(...)]
 *      • operators (??, ??=, =>, ===, !==, <=, >=, <=>, ...)
 *  - Auto-indent:
 *      • HTML tag depth
 *      • PHP braces { } and alternative syntax (: … endif/endfor/…)
 *      • switch/case/default heuristics (case lines pre-dedent)
 *
 * Usage:
 *   PWAxcode.registerLanguage(PHPPlugin);
 *   new PWAxcode(el, { highlight:true, lang:'php' });  // or keep 'auto'
 */
(function () {
  const PHPPlugin = {
    id: 'php',

    // ---------------- DETECT ----------------
    detect(txt) {
      let s = 0;
      if (/<\?php\b/.test(txt)) s += 0.8;
      if (/<\?(=)?/.test(txt)) s += 0.4;
      if (/\$[A-Za-z_][A-Za-z0-9_]*/.test(txt)) s += 0.2;
      if (/\bfunction\b|\bclass\b|\bnamespace\b/.test(txt)) s += 0.2;
      // Cap at 1
      return Math.min(1, s);
    },

    // ---------------- TOKENIZE ----------------
    tokenize(src) {
      const out = [];
      const push = (type, text) => out.push({ type, text });
      const pushTxt = (text) => out.push({ text });

      let i = 0, n = src.length, inPHP = false;

      // ---------- HTML helpers ----------
      const isWS = c => /[\t \f\r]/.test(c);
      const isNameStart = c => /[A-Za-z]/.test(c);
      const isNameChar  = c => /[A-Za-z0-9:_-]/.test(c);
      const readWhile = pred => { const j=i; while (i<n && pred(src[i])) i++; return src.slice(j,i); };
      const readQuoted = q => { let out = src[i++]; while (i<n) { const c=src[i]; out+=c; i++; if (c==='\\' && i<n) { out+=src[i]; i++; continue; } if (c===q) break; } return out; };
      const readUntil = needle => { const j=i; const k = src.toLowerCase().indexOf(needle.toLowerCase(), i); i = (k===-1) ? n : k+needle.length; return src.slice(j,i); };
      const isSelfClosing = name => /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i.test(name);

      // ---------- PHP helpers ----------
      const KW = new Set([
        'abstract','and','array','as','break','callable','case','catch','class','clone','const','continue','declare',
        'default','do','echo','else','elseif','enddeclare','endfor','endforeach','endif','endswitch','endwhile',
        'enum','extends','final','finally','fn','for','foreach','function','global','goto','if','implements',
        'include','include_once','instanceof','insteadof','interface','isset','list','match','namespace','new',
        'or','print','private','protected','public','readonly','require','require_once','return','static','switch',
        'throw','trait','try','unset','use','var','while','xor','yield'
      ]);
      const LIT = new Set(['true','false','null']);
      const isIdStart = c => /[A-Za-z_\x80-\uFFFF]/.test(c);
      const isIdPart  = c => /[A-Za-z0-9_\x80-\uFFFF]/.test(c);

      const readJSNum = () => { // PHP allows underscores in numbers
        const j=i;
        if (src[i]==='0' && /[boxBOX]/.test(src[i+1])) { i+=2; while (i<n && /[0-9a-fA-F_]/.test(src[i])) i++; }
        else {
          while (i<n && /[0-9_]/.test(src[i])) i++;
          if (src[i]==='.') { i++; while (i<n && /[0-9_]/.test(src[i])) i++; }
          if (/[eE]/.test(src[i])) { i++; if (/[+-]/.test(src[i])) i++; while (i<n && /[0-9_]/.test(src[i])) i++; }
        }
        return src.slice(j,i);
      };

      const readPHPString = q => {
        // single/double/backtick with escapes and interpolation in double/backtick
        let out = src[i++]; // opening
        let inInterp = 0;   // ${ ... } depth in double/backtick
        const allowsInterp = q === '"' || q === '`';
        while (i<n) {
          const c = src[i]; out += c; i++;
          if (c==='\\' && i<n) { out += src[i]; i++; continue; }
          if (allowsInterp && c==='$' && src[i]==='{') { out += src[i++]; inInterp++; continue; }
          if (allowsInterp && c==='}' && inInterp>0) { inInterp--; continue; }
          if (c===q && inInterp===0) break;
        }
        return out;
      };

      let inHere = false, hereLabel = '';

      const tryHeredoc = () => {
        // <<<LABEL  or  <<<'LABEL'  or  <<<"LABEL"
        const j = i;
        if (src[i]==='<' && src[i+1]==='<' && src[i+2]==='<') {
          let k = i+3;
          while (k<n && /\s/.test(src[k])) k++;
          let quote = '';
          if (src[k]==="'" || src[k]==='"') { quote = src[k]; k++; }
          const m = k; while (k<n && /[A-Za-z_][A-Za-z0-9_]*/.test(src.slice(m,k+1))) k++;
          const label = src.slice(m,k);
          if (!label) return false;
          if (quote) { if (src[k]!==quote) return false; k++; }
          // consume until end of line
          while (k<n && src[k] !== '\n') k++;
          push('str', src.slice(i,k)); // emit the heredoc opener line
          i = k;
          inHere = true; hereLabel = label;
          return true;
        }
        return false;
      };

      const closeHeredocIfAny = () => {
        if (!inHere) return false;
        const j = i;
        // must match at start of line: LABEL;? then newline or EOF
        // scan to end of line
        let k = i; while (k<n && src[k] !== '\n') k++;
        const line = src.slice(i, k);
        const m = line.match(new RegExp('^' + hereLabel + ';?\\s*$'));
        if (m) {
          // emit end line and close
          push('str', src.slice(i, k));
          i = k;
          inHere = false; hereLabel = '';
          return true;
        }
        // not the end label: treat the whole line as heredoc content
        push('str', src.slice(i, k));
        i = k;
        return true;
      };

      // main loop
      while (i < n) {
        const ch = src[i], nx = src[i+1];

        // newline is always preserved
        if (ch === '\n') { pushTxt('\n'); i++; continue; }

        if (!inPHP) {
          // Look for PHP open tags
          if (src.startsWith('<?php', i) || src.startsWith('<?=', i) || (src.startsWith('<?', i) && !src.startsWith('<?xml', i))) {
            // Emit the opener as punctuation
            const openLen = src.startsWith('<?php', i) ? 5 : (src.startsWith('<?=', i) ? 3 : 2);
            push('pun', src.slice(i, i+openLen));
            i += openLen;
            inPHP = true;
            continue;
          }

          // HTML mode
          if (src.startsWith('<!--', i)) { push('com', readUntil('-->')); continue; }
          if (/^<!DOCTYPE/i.test(src.slice(i))) { push('doctype', readUntil('>')); continue; }
          if (src.startsWith('<![CDATA[', i)) { push('doctype', readUntil(']]>')); continue; }

          if (ch === '<') {
            // tag
            push('pun','<'); i++;
            // closing?
            if (src[i] === '/') { push('pun','/'); i++; }
            // tag name
            if (isNameStart(src[i])) {
              const name = readWhile(isNameChar);
              const lower = name.toLowerCase();
              push('tag', name);

              // attributes
              while (i<n) {
                if (src[i] === '>') { push('pun','>'); i++; break; }
                if (src[i] === '/' && src[i+1] === '>') { push('pun','/'); push('pun','>'); i+=2; break; }
                if (isWS(src[i])) { pushTxt(readWhile(isWS)); continue; }
                if (isNameStart(src[i])) {
                  const an = readWhile(isNameChar);
                  push('attr', an);
                  if (isWS(src[i])) pushTxt(readWhile(isWS));
                  if (src[i] === '=') {
                    push('pun','='); i++;
                    if (isWS(src[i])) pushTxt(readWhile(isWS));
                    if (src[i] === '"' || src[i] === "'") { push('str', readQuoted(src[i])); }
                    else {
                      const j=i; while (i<n && !/[\s/>]/.test(src[i])) i++;
                      if (j<i) push('str', src.slice(j,i));
                    }
                  }
                  continue;
                }
                // stray char in tag
                push('pun', src[i]); i++;
              }
              continue;
            }
            // lone '<' fallback
            pushTxt('<'); continue;
          }

          // entities & text
          if (ch === '&') {
            const semi = src.indexOf(';', i+1);
            if (semi !== -1) { push('ent', src.slice(i, semi+1)); i = semi+1; continue; }
          }
          pushTxt(ch); i++;
          continue;
        }

        // -------- PHP MODE --------

        // Close tag
        if (src.startsWith('?>', i)) { push('pun','?>'); i += 2; inPHP = false; continue; }

        // Heredoc / nowdoc handling (line-oriented)
        if (inHere) { closeHeredocIfAny(); continue; }
        if (tryHeredoc()) continue;

        // whitespace
        if (/\s/.test(ch)) { pushTxt(readWhile(c=>/\s/.test(c))); continue; }

        // comments
        if (ch==='/' && nx==='/' ) { let j=i+2; while (j<n && src[j] !== '\n') j++; push('com', src.slice(i,j)); i=j; continue; }
        if (ch==='#') { let j=i+1; while (j<n && src[j] !== '\n') j++; push('com', src.slice(i,j)); i=j; continue; }
        if (ch==='/' && nx==='*') {
          let j=i+2, isDoc = (src[i+2]==='*');
          while (j<n && !(src[j]==='*' && src[j+1]==='/')) j++;
          j = Math.min(n, j+2);
          push(isDoc ? 'com' : 'com', src.slice(i,j));
          i=j; continue;
        }

        // attributes #[...] (PHP 8+)
        if (ch === '#' && src[i+1] === '[') {
          let j = i+2, depth = 1;
          while (j<n && depth>0) {
            if (src[j]==='[') depth++;
            else if (src[j]===']') depth--;
            j++;
          }
          push('meta', src.slice(i,j));
          i = j; continue;
        }

        // strings (single / double / backtick)
        if (ch==='"' || ch==="'" || ch==='`') { push('str', readPHPString(ch)); continue; }

        // numbers
        if (/[0-9]/.test(ch) || (ch==='.' && /[0-9]/.test(nx))) { push('num', readJSNum()); continue; }

        // variables ($foo, ${expr})
        if (ch === '$') {
          let j = i+1;
          if (src[j] === '{') { // ${ ... }
            j++; let depth = 1;
            while (j<n && depth>0) {
              const c = src[j], d = src[j+1];
              if (c==='"' || c==="'" || c==='`') { // skip string inside
                let k = j; j++; while (j<n) { const cc=src[j]; j++; if (cc==='\\'&&j<n){j++; continue;} if (cc===src[k]) break; }
                continue;
              }
              if (c === '{') depth++;
              else if (c === '}') depth--;
              j++;
            }
            push('var', src.slice(i,j));
            i = j; continue;
          }
          // $ident
          if (isIdStart(src[j])) {
            j++; while (j<n && isIdPart(src[j])) j++;
            push('var', src.slice(i,j)); i=j; continue;
          }
          // lone $
          push('pun', '$'); i++; continue;
        }

        // identifiers & keywords & function/class/namespace names
        if (isIdStart(ch)) {
          const j=i; i++; while (i<n && isIdPart(src[i])) i++;
          const id = src.slice(j,i);
          // contextual classification
          // lookahead for '(' => likely function call if not a keyword
          let k = i; while (k<n && /\s/.test(src[k])) k++;
          if (KW.has(id)) { push('kw', id); continue; }
          if (LIT.has(id)) { push('lit', id); continue; }

          // After 'function' the next identifier is a declaration
          // After 'class'/'interface'/'trait'/'enum' => class-ish
          // After 'namespace' => namespace name (can contain backslashes)
          const last = out.length ? out[out.length-1] : null;
          const prevKw = last && last.type === 'kw' ? last.text : '';
          if (prevKw === 'function') { push('fn', id); continue; }
          if (prevKw === 'class' || prevKw === 'interface' || prevKw === 'trait' || prevKw === 'enum') { push('cls', id); continue; }
          if (prevKw === 'namespace' || prevKw === 'use') { push('ns', id); continue; }

          // function call heuristic
          if (src[k] === '(') push('fn', id);
          else pushTxt(id);
          continue;
        }

        // punctuation / operators (handle multi-char first)
        // nullsafe, spaceship, coalesce, fat arrow, etc.
        const two = src.slice(i, i+2), three = src.slice(i, i+3);
        if (three === '?->' || three === ':::' || three === '<=>') { push('pun', three); i+=3; continue; }
        if (two === '->' || two === '::' || two === '??' || two === '=>' || two === '::' || two === '??' || two === '??' || two === '??' ) { push('pun', two); i+=2; continue; }
        if (/^(===|!==|<<=|>>=|\.\.\.|::)/.test(src.slice(i,i+3))) { push('pun', src.slice(i,i+3)); i+=3; continue; }
        if (/^(==|!=|<=|>=|<<|>>|\+=|-=|\*=|\/=|%=|\.\=|\?\?=|&&|\|\|)/.test(src.slice(i,i+2))) { push('pun', src.slice(i,i+2)); i+=2; continue; }

        if (',;(){}[]:.@?~^|&+-*/%<>=!\\'.includes(ch)) { push('pun', ch); i++; continue; }

        // fallback
        pushTxt(ch); i++;
      }

      return out;
    },

    // ---------------- AUTO-INDENT ----------------
    autoIndent(text, size = 2) {
      // Indent HTML tags + PHP blocks with braces and alternative syntax.
      const lines = text.replace(/\r\n?/g, '\n').split('\n');
      let depth = 0;
      let inPHP = false;
      let inHere = false, hereLabel = '';

      const startsWith = (s, re) => re.test(s);
      const trimStart = s => s.replace(/^[ \t]+/, '');

      const isHtmlClose = s => /^<\s*\/[A-Za-z][A-Za-z0-9:_-]*\b/.test(s);
      const isHtmlOpen  = s => /^<\s*[A-Za-z][A-Za-z0-9:_-]*\b/.test(s) && !/\/\s*>$/.test(s) && !/^<\s*(?:area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)\b/i.test(s);
      const isSelfClose = s => /\/\s*>$/.test(s);

      const phpCloseWords = /^(endif|endforeach|endfor|endswitch|enddeclare)\b/i;
      const phpOpenColon  = /^(if|else|elseif|for|foreach|while|switch|declare)\b[\s\S]*:\s*$/i;
      const phpCaseLine   = /^(case\b|default\b)/i;

      const heredocOpenRe = /^<<<\s*(?:'|")?([A-Za-z_][A-Za-z0-9_]*)/;
      const heredocEnd = (line) => hereLabel && new RegExp('^' + hereLabel + ';?\\s*$').test(line);

      const out = [];

      for (let raw of lines) {
        const t = trimStart(raw);

        // toggle PHP mode by tags (only if not in heredoc)
        if (!inHere) {
          if (!inPHP && /^<\?(php|\=)?\b/i.test(t)) inPHP = true;
          if (inPHP && /^\?>/.test(t)) inPHP = false;
        }

        // heredoc tracking (in PHP only)
        if (inPHP) {
          if (!inHere) {
            const m = t.match(heredocOpenRe);
            if (m) { inHere = true; hereLabel = m[1]; }
          } else {
            if (heredocEnd(t)) { inHere = false; hereLabel = ''; }
          }
        }

        // PRE-DEDENT rules
        let pre = 0;
        if (inPHP && !inHere) {
          if (/^\}/.test(t)) pre++;
          else if (phpCloseWords.test(t)) pre++;
          else if (phpCaseLine.test(t)) pre++; // case/default align under switch
        } else {
          if (isHtmlClose(t)) pre++;
        }

        const level = Math.max(0, depth - pre);
        out.push(' '.repeat(level * size) + t);

        // UPDATE DEPTH (post line)
        if (inPHP && !inHere) {
          // open/close braces
          let j = 0;
          while (j < t.length) {
            const c = t[j], nx = t[j+1];
            if (c === '{') depth++;
            else if (c === '}') depth = Math.max(0, depth - 1);
            j++;
          }
          // alternative syntax open with colon  (if (...):, foreach (...):, etc.)
          if (phpOpenColon.test(t)) depth++;
          // closing words reduce (already applied in pre, keep balanced)
          if (phpCloseWords.test(t)) { /* already handled */ }
          // case/default add a soft indent for following body
          if (phpCaseLine.test(t) && /:\s*$/.test(t)) depth++;
        } else {
          // HTML
          if (isHtmlOpen(t)) depth++;
          if (isHtmlClose(t)) depth = Math.max(0, depth - 1);
          if (isSelfClose(t)) { /* no change */ }
        }
      }

      return out.join('\n');
    }
  };

  // Register immediately, or stash for later
  if (window.PWAxcode && typeof PWAxcode.registerLanguage === 'function') {
    PWAxcode.registerLanguage(PHPPlugin);
  } else {
    window.__PXC_LANG_PHP__ = PHPPlugin;
  }
})();

