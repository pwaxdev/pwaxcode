# PWAxcode

A lightweight, customizable code viewer and player with syntax highlighting, folding, typing simulation, and UI controls.

- Author: [PWAx.dev](https://pwax.dev)  
- License: MIT  

For **live demo** and **documentation**, visit [pwax.dev](https://pwax.dev)

---

## Features

- Syntax highlighting for **JS, JSON, HTML, CSS, SQL, PHP** (extensible with plugins)
- Line numbers, folding, ruler, auto-indent
- Typing simulation and step-by-step **code player**
- Copy, download, fullscreen, floatbar, toolbar
- Multiple themes: `dark`, `light`, `funky`, `relax`
- i18n support (English, Italian, extendable)

---

## Quick Start

```html
<link rel="stylesheet" href="pwaxcode.css">
<script src="pwaxcode.js"></script>

<div class="container PWAxcode" data-lang="js">
  <pre><code>console.log("Hello PWAxcode");</code></pre>
</div>

<script>
  PWAxcode.autoInit();
</script>

