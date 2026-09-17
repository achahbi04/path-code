/**
 * Lightweight terminal syntax painting for engineering diffs / previews.
 * No external highlighter dependency — covers PATH polyglot families enough
 * for operator readability inside unified diffs.
 */

/**
 * @param {string} text
 * @param {string} code
 */
function paint(text, code) {
  if (process.env.NO_COLOR != null && process.env.NO_COLOR !== "") return text;
  if (!text) return text;
  return `\u001b[${code}m${text}\u001b[0m`;
}

const C = {
  reset: "\u001b[0m",
  dim: (t) => paint(t, "2"),
  comment: (t) => paint(t, "2;38;5;245"),
  string: (t) => paint(t, "38;5;180"),
  number: (t) => paint(t, "38;5;176"),
  keyword: (t) => paint(t, "38;5;111"),
  type: (t) => paint(t, "38;5;150"),
  prop: (t) => paint(t, "38;5;186"),
  punct: (t) => paint(t, "38;5;245"),
  plain: (t) => paint(t, "37"),
};

const LANG_EXT = {
  js: "js",
  mjs: "js",
  cjs: "js",
  jsx: "js",
  ts: "ts",
  tsx: "ts",
  cts: "ts",
  mts: "ts",
  py: "py",
  go: "go",
  rs: "rs",
  java: "java",
  c: "c",
  h: "c",
  cpp: "c",
  cc: "c",
  cxx: "c",
  hpp: "c",
  cs: "cs",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  css: "css",
  scss: "css",
  html: "html",
  htm: "html",
  sh: "sh",
  bash: "sh",
  zsh: "sh",
  md: "md",
  toml: "toml",
};

/**
 * @param {string} filePath
 */
export function languageFromPath(filePath) {
  const base = String(filePath || "").split(/[\\/]/).pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "text";
  const ext = base.slice(dot + 1).toLowerCase();
  return LANG_EXT[ext] || "text";
}

const KEYWORDS = {
  js: /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|typeof|instanceof|try|catch|throw|switch|case|break|continue|default|of|in|yield|null|undefined|true|false)\b/g,
  ts: /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|typeof|instanceof|try|catch|throw|switch|case|break|continue|default|of|in|yield|null|undefined|true|false|type|interface|enum|implements|extends|public|private|protected|readonly|as|satisfies)\b/g,
  py: /\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|raise|with|yield|async|await|True|False|None|and|or|not|in|is|lambda|pass|break|continue)\b/g,
  go: /\b(func|return|if|else|for|range|package|import|var|const|type|struct|interface|map|chan|go|defer|select|case|switch|break|continue|true|false|nil)\b/g,
  rs: /\b(fn|let|mut|return|if|else|for|while|loop|match|struct|enum|impl|trait|use|mod|pub|crate|self|super|async|await|true|false|Some|None|Ok|Err)\b/g,
  java: /\b(class|interface|enum|return|if|else|for|while|import|package|public|private|protected|static|final|void|new|try|catch|throw|throws|extends|implements|true|false|null)\b/g,
  c: /\b(return|if|else|for|while|switch|case|break|continue|struct|typedef|enum|const|static|void|int|char|float|double|sizeof|true|false|NULL)\b/g,
  cs: /\b(class|interface|enum|return|if|else|for|while|using|namespace|public|private|protected|static|void|new|try|catch|throw|async|await|true|false|null|var)\b/g,
  sh: /\b(if|then|else|fi|for|while|do|done|case|esac|function|return|export|local|true|false)\b/g,
};

/**
 * Strip CSI / OSC / DEC sequences from untrusted or pre-colored text so PATH
 * never paints over leftover ANSI and never leaves residue like `38;5;180m`.
 *
 * Important: incomplete CSI (ESC [ params without a final byte) must be dropped
 * entirely. A naive `\u001b.` fallback only consumes ESC+[ and leaves
 * `38;5;180m` as visible source text.
 *
 * @param {string} text
 */
export function stripAnsiSequences(text) {
  if (typeof text !== "string" || text.length === 0) return "";
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch !== "\u001b") {
      out += ch;
      continue;
    }
    const next = text[i + 1];
    if (next === "[") {
      // CSI: consume params/intermediates through final byte, or rest if truncated.
      i += 2;
      while (i < text.length) {
        const code = text.charCodeAt(i);
        if (code >= 0x40 && code <= 0x7e) {
          i += 1;
          break;
        }
        i += 1;
      }
      i -= 1;
      continue;
    }
    if (next === "]") {
      // OSC … BEL or ST
      i += 2;
      while (i < text.length) {
        if (text[i] === "\u0007") {
          i += 1;
          break;
        }
        if (text[i] === "\u001b" && text[i + 1] === "\\") {
          i += 2;
          break;
        }
        i += 1;
      }
      i -= 1;
      continue;
    }
    if (next === "(" || next === ")") {
      // Character set designation — ESC ( B etc.
      i += 2;
      continue;
    }
    if (next === "#") {
      i += 2;
      continue;
    }
    // Unknown ESC sequence — drop ESC + following byte when present.
    if (next != null) i += 1;
  }
  // Defense: already-orphaned SGR parameter tails (ESC/[ lost upstream).
  return scrubOrphanSgrResidue(out);
}

/**
 * Remove orphan SGR tails such as `38;5;180m` / `[38;5;180m` that remain after
 * the CSI introducer was lost. Conservative: only classic SGR parameter shapes.
 * @param {string} text
 */
export function scrubOrphanSgrResidue(text) {
  if (typeof text !== "string" || text.length === 0) return text;
  // Require at least one `;` so we never eat legitimate source like `200ms`.
  return text.replace(/\[?\d{1,3}(?:;\d{1,3}){1,8}m/g, "");
}

/**
 * Paint one code line (without leading +/-/context marker).
 * @param {string} code
 * @param {string} lang
 */
export function paintCodeLine(code, lang) {
  const cleaned = stripAnsiSequences(code);
  if (!cleaned) return cleaned;
  if (process.env.NO_COLOR != null && process.env.NO_COLOR !== "") return cleaned;

  // Comments
  if (
    /^\s*(\/\/|#|--)/.test(cleaned) ||
    /^\s*\/\*/.test(cleaned) ||
    /^\s*\*/.test(cleaned)
  ) {
    return C.comment(cleaned);
  }

  if (lang === "css") {
    return paintCssLine(cleaned);
  }
  if (lang === "json" || lang === "yaml" || lang === "toml") {
    return paintDataLine(cleaned);
  }
  if (lang === "html") {
    return paintHtmlLine(cleaned);
  }

  const kw = KEYWORDS[lang] || KEYWORDS.js;
  /** @type {string[]} */
  const out = [];
  let i = 0;
  while (i < cleaned.length) {
    const ch = cleaned[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      let j = i + 1;
      while (j < cleaned.length) {
        if (cleaned[j] === "\\") {
          j += 2;
          continue;
        }
        if (cleaned[j] === q) {
          j += 1;
          break;
        }
        j += 1;
      }
      out.push(C.string(cleaned.slice(i, j)));
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch) && (i === 0 || /[^\w$]/.test(cleaned[i - 1] || ""))) {
      let j = i;
      while (j < cleaned.length && /[0-9._xXa-fA-F]/.test(cleaned[j])) j += 1;
      out.push(C.number(cleaned.slice(i, j)));
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < cleaned.length && /[A-Za-z0-9_$]/.test(cleaned[j])) j += 1;
      const word = cleaned.slice(i, j);
      kw.lastIndex = 0;
      if (kw.test(word)) out.push(C.keyword(word));
      else if (/^[A-Z][A-Za-z0-9_]*$/.test(word)) out.push(C.type(word));
      else out.push(C.plain(word));
      i = j;
      continue;
    }
    out.push(C.punct(ch));
    i += 1;
  }
  return out.join("");
}

/**
 * @param {string} code
 */
function paintCssLine(code) {
  const m = code.match(/^(\s*)([A-Za-z_-][\w-]*)(\s*:\s*)(.*)$/);
  if (m) {
    return `${m[1]}${C.prop(m[2])}${C.punct(m[3])}${C.string(m[4])}`;
  }
  if (/[{};]/.test(code) && !code.includes(":")) {
    return code.replace(/([.#]?[A-Za-z_-][\w-]*)/g, (w) =>
      w.startsWith(".") || w.startsWith("#") ? C.type(w) : C.prop(w),
    );
  }
  return C.plain(code);
}

/**
 * @param {string} code
 */
function paintDataLine(code) {
  return code
    .replace(/"([^"\\]|\\.)*"/g, (s) => C.string(s))
    .replace(/\b(-?\d+(?:\.\d+)?)\b/g, (n) => C.number(n))
    .replace(/\b(true|false|null)\b/g, (k) => C.keyword(k));
}

/**
 * @param {string} code
 */
function paintHtmlLine(code) {
  return code
    .replace(/(<\/?[A-Za-z][\w:-]*)/g, (t) => C.keyword(t))
    .replace(/([A-Za-z_:][\w:-]*)(=)/g, (_, a, eq) => `${C.prop(a)}${C.punct(eq)}`)
    .replace(/"([^"]*)"/g, (s) => C.string(s));
}

/**
 * Count +/− lines in a unified diff body.
 * @param {string} diff
 */
export function countDiffStats(diff) {
  let added = 0;
  let removed = 0;
  for (const line of String(diff || "").split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) removed += 1;
  }
  return { added, removed };
}
