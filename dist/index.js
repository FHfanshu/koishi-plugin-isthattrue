import { defineComponent as M, inject as T, computed as N, onMounted as A, watch as I, onBeforeUnmount as z, h as D } from "vue";
const F = /* @__PURE__ */ new Set([
  "isthattrue",
  "chatluna-fact-check",
  "koishi-plugin-isthattrue",
  "koishi-plugin-chatluna-fact-check"
]), C = [
  {
    title: "Tof 命令",
    sections: [
      { key: "basic", title: "基础设置" },
      { key: "search", title: "搜索集成" },
      { key: "output", title: "输出格式" }
    ]
  },
  {
    title: "Agent 工具",
    sections: [
      { key: "tool", title: "Fact Check 工具" },
      { key: "multi", title: "多源搜索配置" }
    ]
  },
  {
    title: "DeepSearch",
    sections: [
      { key: "deep-search", title: "DeepSearch 迭代搜索" },
      { key: "deep-llm", title: "LLM 搜索源" },
      { key: "deep-chatluna", title: "Chatluna 搜索集成" },
      { key: "deep-searxng", title: "SearXNG 搜索集成" }
    ]
  },
  {
    title: "调试",
    sections: [
      { key: "debug", title: "调试" }
    ]
  }
], w = C.flatMap((t) => t.sections), S = "isthattrue-nav-style";
function O() {
  if (document.getElementById(S)) return;
  const t = document.createElement("style");
  t.id = S, t.textContent = `
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
function d(t) {
  return t.replace(/\s+/g, "").trim();
}
function E() {
  return Array.from(document.querySelectorAll(
    ".k-schema-section-title, .k-schema-header, h2.k-schema-header"
  ));
}
function q(t) {
  const e = d(t), o = E();
  for (const s of o) {
    const l = d(s.textContent || "");
    if (l && l.includes(e))
      return s;
  }
  return null;
}
function U() {
  O();
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
  const o = e.querySelector(".isthattrue-nav-body"), s = e.querySelector(".isthattrue-nav-toggle"), l = e.querySelector(".isthattrue-nav-header"), p = /* @__PURE__ */ new Map();
  for (const n of C) {
    const r = document.createElement("div");
    r.className = "isthattrue-nav-group", r.textContent = n.title, o.appendChild(r);
    for (const i of n.sections) {
      const a = document.createElement("button");
      a.type = "button", a.className = "isthattrue-nav-item", a.textContent = i.title, a.addEventListener("click", () => {
        const u = q(i.title);
        u && u.scrollIntoView({ behavior: "smooth", block: "start" });
      }), o.appendChild(a), p.set(i.key, a);
    }
  }
  s.addEventListener("click", (n) => {
    n.stopPropagation();
    const r = e.classList.toggle("collapsed");
    s.textContent = r ? "⌃" : "⌄";
  });
  let g = 0, f = 0, x = 0, y = 0;
  const h = (n) => {
    const r = n.clientX - g, i = n.clientY - f, a = Math.max(0, y + i), u = Math.max(0, x - r);
    e.style.top = `${a}px`, e.style.right = `${u}px`;
  }, m = () => {
    document.removeEventListener("mousemove", h), document.removeEventListener("mouseup", m);
  };
  l.addEventListener("mousedown", (n) => {
    n.target.closest(".isthattrue-nav-toggle") || (n.preventDefault(), g = n.clientX, f = n.clientY, x = parseFloat(e.style.right || "60"), y = parseFloat(e.style.top || "260"), document.addEventListener("mousemove", h), document.addEventListener("mouseup", m));
  });
  let c = null;
  const k = () => {
    c == null || c.disconnect(), c = new IntersectionObserver((r) => {
      var i;
      for (const a of r) {
        if (!a.isIntersecting) continue;
        const u = (a.target.textContent || "").trim(), L = w.find((v) => u.includes(v.title));
        if (L) {
          for (const v of p.values()) v.classList.remove("active");
          (i = p.get(L.key)) == null || i.classList.add("active");
          break;
        }
      }
    }, {
      root: null,
      rootMargin: "-20% 0px -60% 0px",
      threshold: 0
    });
    const n = E();
    for (const r of n) {
      const i = d(r.textContent || "");
      w.some((a) => i.includes(d(a.title))) && c.observe(r);
    }
  }, b = new MutationObserver(() => {
    window.setTimeout(k, 200);
  });
  return b.observe(document.body, { childList: !0, subtree: !0 }), window.setTimeout(k, 300), () => {
    c == null || c.disconnect(), b.disconnect(), document.removeEventListener("mousemove", h), document.removeEventListener("mouseup", m), e.remove();
  };
}
const X = M({
  name: "FactCheckDetailsLoader",
  setup() {
    const t = T("plugin:name"), e = N(() => {
      const l = t == null ? void 0 : t.value;
      return !!l && F.has(l);
    });
    let o = null;
    const s = () => {
      o == null || o(), o = null, e.value && (o = U());
    };
    return A(s), I(e, s), z(() => o == null ? void 0 : o()), () => D("div", { style: { display: "none" } });
  }
}), _ = (t) => {
  t.slot({
    type: "plugin-details",
    component: X,
    order: -999
  });
};
export {
  _ as default
};
