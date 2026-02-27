import { defineComponent as M, inject as A, computed as T, onMounted as N, watch as B, onBeforeUnmount as D, h as F } from "vue";
const z = /* @__PURE__ */ new Set([
  "isthattrue",
  "chatluna-fact-check",
  "koishi-plugin-isthattrue",
  "koishi-plugin-chatluna-fact-check"
]), C = [
  {
    title: "API 配置",
    sections: [
      { key: "api-key-table", title: "API Key / Base URL 对照表" }
    ]
  },
  {
    title: "FactCheck",
    sections: [
      { key: "factcheck-tool", title: "Fact Check 工具" },
      { key: "context-injection", title: "上下文注入" },
      { key: "multi-source", title: "多源搜索" },
      { key: "factcheck-search", title: "搜索集成" }
    ]
  },
  {
    title: "DeepSearch",
    sections: [
      { key: "deep-search", title: "DeepSearch 迭代搜索" },
      { key: "deep-llm", title: "LLM 搜索源" },
      { key: "deep-chatluna", title: "Chatluna 搜索集成" }
    ]
  },
  {
    title: "调试/兼容",
    sections: [
      { key: "debug-troubleshooting", title: "调试与排障" }
    ]
  }
], O = C.flatMap((t) => t.sections), E = {
  "api-key-table": ["API Key / Base URL 对照表", "API Key / Base URL 统一配置", "统一配置"],
  "factcheck-tool": ["Fact Check 工具", "FactCheck 基础", "Agent 工具配置"],
  "context-injection": ["搜索源上下文注入", "SearXNG 搜索集成"],
  "multi-source": ["多源搜索配置"],
  "factcheck-search": ["搜索集成"],
  "deep-search": ["DeepSearch 迭代搜索", "DeepSearch 配置", "DeepSearch"],
  "deep-llm": ["LLM 搜索源"],
  "deep-chatluna": ["Chatluna 搜索集成"],
  "debug-troubleshooting": ["调试与排障", "调试"]
}, L = "isthattrue-nav-style";
function P() {
  if (document.getElementById(L)) return;
  const t = document.createElement("style");
  t.id = L, t.textContent = `
.isthattrue-nav {
  position: fixed;
  top: 260px;
  right: 60px;
  z-index: 1000;
  width: 140px;
  max-width: 90vw;
  user-select: none;
}
.isthattrue-nav-header {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--k-color-border, #4b5563);
  background: color-mix(in srgb, var(--k-color-bg, #1f2937) 94%, white);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: move;
}
.isthattrue-nav-handle {
  color: var(--k-text-light, #9ca3af);
  font-size: 14px;
  line-height: 1;
}
.isthattrue-nav-toggle {
  border: none;
  background: transparent;
  color: var(--k-text-light, #9ca3af);
  cursor: pointer;
  padding: 0;
  font-size: 14px;
  line-height: 1;
}
.isthattrue-nav-body {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.isthattrue-nav.collapsed .isthattrue-nav-body {
  display: none;
}
.isthattrue-nav-item {
  border: none;
  background: transparent;
  color: var(--k-text, #d1d5db);
  text-align: left;
  padding: 6px 4px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1.4;
}
.isthattrue-nav-item:hover {
  color: var(--k-color-primary, #4f7cff);
}
.isthattrue-nav-item.active {
  color: var(--k-color-primary, #4f7cff);
}
.isthattrue-nav-group {
  margin-top: 4px;
  padding: 6px 4px 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--k-text-light, #9ca3af);
  opacity: 0.9;
}
`, document.head.appendChild(t);
}
function h(t) {
  return t.replace(/\s+/g, "").trim();
}
function w() {
  return Array.from(document.querySelectorAll(
    ".k-schema-section-title, .k-schema-header, h2.k-schema-header"
  ));
}
function U(t) {
  const e = [t.title, ...E[t.key] || []].map((r) => h(r)).filter(Boolean), n = w();
  for (const r of n) {
    const c = h(r.textContent || "");
    if (c && e.some((d) => c.includes(d)))
      return r;
  }
  return null;
}
function S(t) {
  const e = h(t);
  return O.find((n) => [n.title, ...E[n.key] || []].map((c) => h(c)).filter(Boolean).some((c) => e.includes(c)));
}
function R() {
  P();
  const t = document.querySelector(".isthattrue-nav");
  t == null || t.remove();
  const e = document.createElement("div");
  e.className = "isthattrue-nav", e.innerHTML = `
<div class="isthattrue-nav-header">
  <span class="isthattrue-nav-handle">⋮⋮</span>
  <button class="isthattrue-nav-toggle" type="button">⌄</button>
</div>
<div class="isthattrue-nav-body"></div>
`, document.body.appendChild(e);
  const n = e.querySelector(".isthattrue-nav-body"), r = e.querySelector(".isthattrue-nav-toggle"), c = e.querySelector(".isthattrue-nav-header"), d = /* @__PURE__ */ new Map();
  for (const o of C) {
    const a = document.createElement("div");
    a.className = "isthattrue-nav-group", a.textContent = o.title, n.appendChild(a);
    for (const s of o.sections) {
      const i = document.createElement("button");
      i.type = "button", i.className = "isthattrue-nav-item", i.textContent = s.title, i.addEventListener("click", () => {
        const u = U(s);
        u && u.scrollIntoView({ behavior: "smooth", block: "start" });
      }), n.appendChild(i), d.set(s.key, i);
    }
  }
  r.addEventListener("click", (o) => {
    o.stopPropagation();
    const a = e.classList.toggle("collapsed");
    r.textContent = a ? "⌃" : "⌄";
  });
  let v = 0, f = 0, g = 0, y = 0;
  const p = (o) => {
    const a = o.clientX - v, s = o.clientY - f, i = Math.max(0, y + s), u = Math.max(0, g - a);
    e.style.top = `${i}px`, e.style.right = `${u}px`;
  }, m = () => {
    document.removeEventListener("mousemove", p), document.removeEventListener("mouseup", m);
  };
  c.addEventListener("mousedown", (o) => {
    o.target.closest(".isthattrue-nav-toggle") || (o.preventDefault(), v = o.clientX, f = o.clientY, g = parseFloat(e.style.right || "60"), y = parseFloat(e.style.top || "260"), document.addEventListener("mousemove", p), document.addEventListener("mouseup", m));
  });
  let l = null;
  const x = () => {
    l == null || l.disconnect(), l = new IntersectionObserver((a) => {
      var s;
      for (const i of a) {
        if (!i.isIntersecting) continue;
        const u = (i.target.textContent || "").trim(), b = S(u);
        if (b) {
          for (const I of d.values()) I.classList.remove("active");
          (s = d.get(b.key)) == null || s.classList.add("active");
          break;
        }
      }
    }, {
      root: null,
      rootMargin: "-20% 0px -60% 0px",
      threshold: 0
    });
    const o = w();
    for (const a of o) {
      const s = a.textContent || "";
      S(s) && l.observe(a);
    }
  }, k = new MutationObserver(() => {
    window.setTimeout(x, 200);
  });
  return k.observe(document.body, { childList: !0, subtree: !0 }), window.setTimeout(x, 300), () => {
    l == null || l.disconnect(), k.disconnect(), document.removeEventListener("mousemove", p), document.removeEventListener("mouseup", m), e.remove();
  };
}
const _ = M({
  name: "FactCheckDetailsLoader",
  setup() {
    const t = A("plugin:name"), e = T(() => {
      const c = t == null ? void 0 : t.value;
      return !!c && z.has(c);
    });
    let n = null;
    const r = () => {
      n == null || n(), n = null, e.value && (n = R());
    };
    return N(r), B(e, r), D(() => n == null ? void 0 : n()), () => F("div", { style: { display: "none" } });
  }
}), j = (t) => {
  t.slot({
    type: "plugin-details",
    component: _,
    order: -999
  });
};
export {
  j as default
};
