/* Zovo PlantUML Viewer & Preview 0.1.0 core, for the browser tool page (built by sprint/tools/bundle_tc4.py
   from plantuml-viewer-vscode commit 22cf0a8892d2). MIT license, github.com/theluckystrike/plantuml-viewer-vscode. No network code. */
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // ../../../../toolchk4-work/tc4-n4dcdthu/p/src/blocks.js
  var require_blocks = __commonJS({
    "../../../../toolchk4-work/tc4-n4dcdthu/p/src/blocks.js"(exports, module) {
      "use strict";
      var MAX_BLOCKS = 500;
      var MAX_LINES = 2e5;
      var START = /^\s*@start([a-z0-9_]+)\b\s*(.*)$/i;
      var FENCE = /^(\s{0,3})(`{3,}|~{3,})\s*([^\s`]*)(.*)$/;
      var LANGS = /* @__PURE__ */ new Set(["plantuml", "puml", "uml", "pu", "{plantuml}", "{.plantuml}"]);
      function nameOf(lines, kind, rest) {
        const n = String(rest || "").trim().replace(/^\(id=([^)]*)\)$/, "$1").replace(/^"(.*)"$/, "$1");
        if (n) return n.slice(0, 120);
        for (const l of lines.slice(0, 60)) {
          const m = /^\s*title\s+(.+)$/i.exec(l);
          if (m) return m[1].trim().replace(/^"(.*)"$/, "$1").slice(0, 120);
        }
        return "";
      }
      function startEndBlocks(lines, from, to, out) {
        for (let i = from; i < to && out.length < MAX_BLOCKS; i++) {
          const m = START.exec(lines[i]);
          if (!m) continue;
          const kind = m[1].toLowerCase();
          const end = new RegExp(`^\\s*@end${kind}\\b`, "i");
          let j = i + 1;
          while (j < to && !end.test(lines[j])) j++;
          const body = lines.slice(i, Math.min(j + 1, to));
          if (j >= to) body.push(`@end${kind}`);
          out.push({ kind, name: nameOf(body.slice(1), kind, m[2]), startLine: i, endLine: Math.min(j, to - 1), source: body.join("\n"), lineOffset: i });
          i = j;
        }
        return out;
      }
      function plantumlBlocks(text) {
        const lines = String(text).split(/\r?\n/).slice(0, MAX_LINES);
        const out = startEndBlocks(lines, 0, lines.length, []);
        if (!out.length && lines.some((l) => l.trim() && !/^\s*'/.test(l))) {
          out.push({ kind: "uml", name: nameOf(lines, "uml", ""), startLine: 0, endLine: lines.length - 1, source: ["@startuml", ...lines, "@enduml"].join("\n"), lineOffset: -1, wrapped: true });
        }
        return out.map((b2, i) => ({ ...b2, index: i }));
      }
      function markdownBlocks(text) {
        const lines = String(text).split(/\r?\n/).slice(0, MAX_LINES);
        const out = [];
        let i = 0, plainFrom = 0;
        while (i < lines.length && out.length < MAX_BLOCKS) {
          const f = FENCE.exec(lines[i]);
          if (!f) {
            i++;
            continue;
          }
          const fence = f[2];
          const lang = f[3].toLowerCase();
          let j = i + 1;
          const close = new RegExp(`^\\s{0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}\\s*$`);
          while (j < lines.length && !close.test(lines[j])) j++;
          if (LANGS.has(lang)) {
            startEndBlocks(lines, plainFrom, i, out);
            const body = lines.slice(i + 1, j);
            const hasStart = body.some((l) => START.test(l));
            if (hasStart) startEndBlocks(lines, i + 1, j, out);
            else if (body.some((l) => l.trim())) out.push({ kind: "uml", name: nameOf(body, "uml", ""), startLine: i, endLine: Math.min(j, lines.length - 1), source: ["@startuml", ...body, "@enduml"].join("\n"), lineOffset: i, fence: true });
            for (const b2 of out) if (b2.startLine >= i + 1 && b2.startLine < j) {
              b2.fence = true;
              b2.fenceStart = i;
              b2.fenceEnd = Math.min(j, lines.length - 1);
            }
            if (!hasStart && out.length && out[out.length - 1].startLine === i) {
              out[out.length - 1].fenceStart = i;
              out[out.length - 1].fenceEnd = Math.min(j, lines.length - 1);
            }
          } else {
            startEndBlocks(lines, plainFrom, i, out);
          }
          i = j + 1;
          plainFrom = i;
        }
        startEndBlocks(lines, plainFrom, lines.length, out);
        out.sort((a, b2) => a.startLine - b2.startLine);
        return out.slice(0, MAX_BLOCKS).map((b2, k) => ({ ...b2, index: k }));
      }
      var PLANTUML_EXT = /\.(puml|plantuml|iuml|pu|wsd|uml)$/i;
      var MARKDOWN_EXT = /\.(md|markdown|mdx)$/i;
      function blocksFor(text, { languageId = "", fileName = "" } = {}) {
        if (languageId === "markdown" || !languageId && MARKDOWN_EXT.test(fileName) || languageId !== "plantuml" && MARKDOWN_EXT.test(fileName)) return markdownBlocks(text);
        return plantumlBlocks(text);
      }
      function blockAt(blocks, line) {
        if (!blocks.length) return null;
        let best = null;
        for (const b2 of blocks) {
          const s = b2.fenceStart !== void 0 ? b2.fenceStart : b2.startLine, e = b2.fenceEnd !== void 0 ? b2.fenceEnd : b2.endLine;
          if (line >= s && line <= e) return b2;
          if (s <= line) best = b2;
        }
        return best || blocks[0];
      }
      function markdownHasDiagram(text) {
        return /^\s{0,3}(`{3,}|~{3,})\s*(plantuml|puml|uml)\b/im.test(text) || /^\s*@startuml\b/im.test(text);
      }
      function exportStem(fileStem, block, count) {
        const safe = (s) => String(s).replace(/\.{2,}/g, "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/\s+/g, "-").replace(/^[.-]+/, "").slice(0, 80);
        const n = block.name ? safe(block.name) : "";
        if (count <= 1) return safe(fileStem) || "diagram";
        return `${safe(fileStem) || "diagram"}-${n || block.index + 1}`;
      }
      module.exports = { plantumlBlocks, markdownBlocks, blocksFor, blockAt, markdownHasDiagram, exportStem, PLANTUML_EXT, MARKDOWN_EXT, MAX_BLOCKS };
    }
  });

  // ../../../../toolchk4-work/tc4-n4dcdthu/entry.js
  var b = require_blocks();
  self.ZovoEngine = { blocksFor: b.blocksFor, plantumlBlocks: b.plantumlBlocks, markdownBlocks: b.markdownBlocks, MAX_BLOCKS: b.MAX_BLOCKS };
})();
