import { defineComponent as I, inject as A, computed as P, onMounted as T, watch as M, onBeforeUnmount as N, h as B } from "vue";
const D = /* @__PURE__ */ new Set([
  "isthattrue",
  // legacy package name
  "chatluna-fact-check",
  "koishi-plugin-isthattrue",
  // legacy package name
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
      { key: "agent-search", title: "搜索配置" }
    ]
  },
  {
    title: "DeepSearch",
    sections: [
      { key: "deep-search", title: "迭代搜索" },
      { key: "deep-chatluna", title: "Chatluna 搜索集成" }
    ]
  },
  {
    title: "调试/兼容",
    sections: [
      { key: "debug-troubleshooting", title: "调试与排障" }
    ]
  }
], F = C.flatMap((t) => t.sections), L = {
  "api-key-table": ["API Key / Base URL 对照表", "API Key / Base URL 统一配置", "统一配置", "Ollama 配置"],
  "factcheck-tool": ["Fact Check 工具", "FactCheck 基础", "Agent 工具配置"],
  "agent-search": ["搜索配置", "搜索源上下文注入", "多源搜索配置", "SearXNG 搜索集成"],
  "deep-search": ["迭代搜索", "DeepSearch 迭代搜索", "DeepSearch 配置", "DeepSearch"],
  "deep-chatluna": ["Chatluna 搜索集成"],
  "debug-troubleshooting": ["调试与排障", "调试"]
}, b = "isthattrue-nav-style";
function z() {
  if (document.getElementById(b)) return;
  const t = document.createElement("style");
  t.id = b, t.textContent = `
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
  touch-action: none;
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
/* Shrink nested sub-section headers inside intersect groups (e.g. DeepSearch sub-sections) */
.k-schema-group .k-schema-group .k-schema-header {
  font-size: 0.85em;
  margin-top: 0.4em;
  margin-bottom: 0.2em;
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
function O(t) {
  const e = [t.title, ...L[t.key] || []].map((i) => h(i)).filter(Boolean), a = w();
  for (const i of a) {
    const o = h(i.textContent || "");
    if (o && e.some((d) => o.includes(d)))
      return i;
  }
  return null;
}
function S(t) {
  const e = h(t);
  return F.find((a) => [a.title, ...L[a.key] || []].map((o) => h(o)).filter(Boolean).some((o) => e.includes(o)));
}
function U() {
  z();
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
  const a = e.querySelector(".isthattrue-nav-body"), i = e.querySelector(".isthattrue-nav-toggle"), o = e.querySelector(".isthattrue-nav-header"), d = /* @__PURE__ */ new Map();
  for (const n of C) {
    const r = document.createElement("div");
    r.className = "isthattrue-nav-group", r.textContent = n.title, a.appendChild(r);
    for (const s of n.sections) {
      const c = document.createElement("button");
      c.type = "button", c.className = "isthattrue-nav-item", c.textContent = s.title, c.addEventListener("click", () => {
        const u = O(s);
        u && u.scrollIntoView({ behavior: "smooth", block: "start" });
      }), a.appendChild(c), d.set(s.key, c);
    }
  }
  i.addEventListener("click", (n) => {
    n.stopPropagation();
    const r = e.classList.toggle("collapsed");
    i.textContent = r ? "⌃" : "⌄";
  });
  let p = 0, m = 0, g = 0, f = 0;
  o.addEventListener("pointerdown", (n) => {
    n.target.closest(".isthattrue-nav-toggle") || (n.preventDefault(), o.setPointerCapture(n.pointerId), p = n.clientX, m = n.clientY, g = parseFloat(e.style.right || "60"), f = parseFloat(e.style.top || "260"));
  }), o.addEventListener("pointermove", (n) => {
    if (!o.hasPointerCapture(n.pointerId)) return;
    const r = n.clientX - p, s = n.clientY - m;
    e.style.top = `${Math.max(0, f + s)}px`, e.style.right = `${Math.max(0, g - r)}px`;
  });
  const v = (n) => {
    o.hasPointerCapture(n.pointerId) && o.releasePointerCapture(n.pointerId);
  };
  o.addEventListener("pointerup", v), o.addEventListener("pointercancel", v);
  let l = null;
  const y = () => {
    l == null || l.disconnect(), l = new IntersectionObserver((r) => {
      var s;
      for (const c of r) {
        if (!c.isIntersecting) continue;
        const u = (c.target.textContent || "").trim(), k = S(u);
        if (k) {
          for (const E of d.values()) E.classList.remove("active");
          (s = d.get(k.key)) == null || s.classList.add("active");
          break;
        }
      }
    }, {
      root: null,
      rootMargin: "-20% 0px -60% 0px",
      threshold: 0
    });
    const n = w();
    for (const r of n) {
      const s = r.textContent || "";
      S(s) && l.observe(r);
    }
  }, x = new MutationObserver(() => {
    window.setTimeout(y, 200);
  });
  return x.observe(document.body, { childList: !0, subtree: !0 }), window.setTimeout(y, 300), () => {
    l == null || l.disconnect(), x.disconnect(), e.remove();
  };
}
const _ = I({
  name: "FactCheckDetailsLoader",
  setup() {
    const t = A("plugin:name"), e = P(() => {
      const o = t == null ? void 0 : t.value;
      return !!o && D.has(o);
    });
    let a = null;
    const i = () => {
      a == null || a(), a = null, e.value && (a = U());
    };
    return T(i), M(e, i), N(() => a == null ? void 0 : a()), () => B("div", { style: { display: "none" } });
  }
}), R = (t) => {
  t.slot({
    type: "plugin-details",
    component: _,
    order: -999
  });
};
export {
  R as default
};
