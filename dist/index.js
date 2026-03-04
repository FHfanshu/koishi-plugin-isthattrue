import { defineComponent as I, inject as M, computed as T, onMounted as A, watch as N, onBeforeUnmount as z, h as P } from "vue";
const F = /* @__PURE__ */ new Set([
  "isthattrue",
  // legacy package name
  "chatluna-fact-check",
  "koishi-plugin-isthattrue",
  // legacy package name
  "koishi-plugin-chatluna-fact-check"
]), C = [
  {
    title: "工具与模型",
    sections: [
      { key: "tools", title: "工具注册" },
      { key: "models", title: "LLM AI 接入" }
    ]
  },
  {
    title: "搜索与服务",
    sections: [
      { key: "search", title: "搜索策略" },
      { key: "services", title: "外部服务" }
    ]
  },
  {
    title: "调试/兼容",
    sections: [
      { key: "debug", title: "调试与排障" }
    ]
  }
], O = C.flatMap((t) => t.sections), L = {
  tools: ["工具注册", "Fact Check 工具", "Deep Search 工具", "Web Fetch 工具"],
  models: ["LLM AI 接入", "模型接入", "AI 模型接入"],
  search: ["搜索策略", "搜索配置", "超时配置", "排序与策略", "最大字数"],
  services: ["外部服务", "Grok 网络搜索", "Jina Reader 配置"],
  debug: ["调试与排障", "调试"]
}, b = "isthattrue-nav-style";
function B() {
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
function p(t) {
  return t.replace(/\s+/g, "").trim();
}
function w() {
  return Array.from(document.querySelectorAll(
    ".k-schema-section-title, .k-schema-header, h2.k-schema-header"
  ));
}
function D(t) {
  const e = [t.title, ...L[t.key] || []].map((i) => p(i)).filter(Boolean), r = w();
  for (const i of r) {
    const o = p(i.textContent || "");
    if (o && e.some((d) => o.includes(d)))
      return i;
  }
  return null;
}
function S(t) {
  const e = p(t);
  return O.find((r) => [r.title, ...L[r.key] || []].map((o) => p(o)).filter(Boolean).some((o) => e.includes(o)));
}
function _() {
  B();
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
  const r = e.querySelector(".isthattrue-nav-body"), i = e.querySelector(".isthattrue-nav-toggle"), o = e.querySelector(".isthattrue-nav-header"), d = /* @__PURE__ */ new Map();
  for (const n of C) {
    const a = document.createElement("div");
    a.className = "isthattrue-nav-group", a.textContent = n.title, r.appendChild(a);
    for (const s of n.sections) {
      const c = document.createElement("button");
      c.type = "button", c.className = "isthattrue-nav-item", c.textContent = s.title, c.addEventListener("click", () => {
        const u = D(s);
        u && u.scrollIntoView({ behavior: "smooth", block: "start" });
      }), r.appendChild(c), d.set(s.key, c);
    }
  }
  i.addEventListener("click", (n) => {
    n.stopPropagation();
    const a = e.classList.toggle("collapsed");
    i.textContent = a ? "⌃" : "⌄";
  });
  let h = 0, m = 0, g = 0, f = 0;
  o.addEventListener("pointerdown", (n) => {
    n.target.closest(".isthattrue-nav-toggle") || (n.preventDefault(), o.setPointerCapture(n.pointerId), h = n.clientX, m = n.clientY, g = parseFloat(e.style.right || "60"), f = parseFloat(e.style.top || "260"));
  }), o.addEventListener("pointermove", (n) => {
    if (!o.hasPointerCapture(n.pointerId)) return;
    const a = n.clientX - h, s = n.clientY - m;
    e.style.top = `${Math.max(0, f + s)}px`, e.style.right = `${Math.max(0, g - a)}px`;
  });
  const v = (n) => {
    o.hasPointerCapture(n.pointerId) && o.releasePointerCapture(n.pointerId);
  };
  o.addEventListener("pointerup", v), o.addEventListener("pointercancel", v);
  let l = null;
  const x = () => {
    l == null || l.disconnect(), l = new IntersectionObserver((a) => {
      var s;
      for (const c of a) {
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
    for (const a of n) {
      const s = a.textContent || "";
      S(s) && l.observe(a);
    }
  }, y = new MutationObserver(() => {
    window.setTimeout(x, 200);
  });
  return y.observe(document.body, { childList: !0, subtree: !0 }), window.setTimeout(x, 300), () => {
    l == null || l.disconnect(), y.disconnect(), e.remove();
  };
}
const q = I({
  name: "FactCheckDetailsLoader",
  setup() {
    const t = M("plugin:name"), e = T(() => {
      const o = t == null ? void 0 : t.value;
      return !!o && F.has(o);
    });
    let r = null;
    const i = () => {
      r == null || r(), r = null, e.value && (r = _());
    };
    return A(i), N(e, i), z(() => r == null ? void 0 : r()), () => P("div", { style: { display: "none" } });
  }
}), G = (t) => {
  t.slot({
    type: "plugin-details",
    component: q,
    order: -999
  });
};
export {
  G as default
};
