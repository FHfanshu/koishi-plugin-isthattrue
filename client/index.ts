import { Context } from '@koishijs/client'
import { computed, defineComponent, inject, onBeforeUnmount, onMounted, type ComputedRef, watch, h } from 'vue'

type NavSection = {
  key: 'api-key-table' | 'factcheck-basic' | 'context-injection' | 'deep-search' | 'deep-llm' | 'tof-optional' | 'debug-troubleshooting'
  title: string
}

type NavGroup = {
  title: string
  sections: NavSection[]
}

const PLUGIN_NAMES = new Set([
  'isthattrue',
  'chatluna-fact-check',
  'koishi-plugin-isthattrue',
  'koishi-plugin-chatluna-fact-check',
])

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'API 配置',
    sections: [
      { key: 'api-key-table', title: 'API Key / Base URL 对照表' },
    ],
  },
  {
    title: 'FactCheck',
    sections: [
      { key: 'factcheck-basic', title: 'FactCheck 基础' },
      { key: 'context-injection', title: '搜索源上下文注入' },
    ],
  },
  {
    title: 'DeepSearch',
    sections: [
      { key: 'deep-search', title: 'DeepSearch 迭代搜索' },
      { key: 'deep-llm', title: 'LLM 搜索源' },
    ],
  },
  {
    title: 'Tof',
    sections: [
      { key: 'tof-optional', title: 'Tof（可选）' },
    ],
  },
  {
    title: '调试/兼容',
    sections: [
      { key: 'debug-troubleshooting', title: '调试与排障' },
    ],
  },
] 

const NAV_SECTIONS: NavSection[] = NAV_GROUPS.flatMap((group) => group.sections)
const SECTION_TITLE_ALIASES: Record<NavSection['key'], string[]> = {
  'factcheck-basic': ['FactCheck 基础', 'Fact Check 工具', 'Agent 工具配置'],
  'context-injection': ['搜索源上下文注入', '多源搜索配置', 'Chatluna 搜索集成', 'SearXNG 搜索集成'],
  'api-key-table': ['API Key / Base URL 对照表', 'API Key / Base URL 统一配置', '统一配置'],
  'deep-search': ['DeepSearch 迭代搜索', 'DeepSearch 配置', 'DeepSearch'],
  'deep-llm': ['LLM 搜索源'],
  'tof-optional': ['Tof（可选）', 'Tof 命令配置', '基础设置', '输出格式'],
  'debug-troubleshooting': ['调试与排障', '调试'],
}

const STYLE_ID = 'isthattrue-nav-style'

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
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
`
  document.head.appendChild(style)
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, '').trim()
}

function getSectionNodes() {
  return Array.from(document.querySelectorAll<HTMLElement>(
    '.k-schema-section-title, .k-schema-header, h2.k-schema-header'
  ))
}

function findHeaderBySection(section: NavSection) {
  const targets = [section.title, ...(SECTION_TITLE_ALIASES[section.key] || [])]
    .map(item => normalizeText(item))
    .filter(Boolean)
  const headers = getSectionNodes()
  for (const header of headers) {
    const text = normalizeText(header.textContent || '')
    if (!text) continue
    if (targets.some(target => text.includes(target))) return header
  }
  return null
}

function matchSectionByHeaderText(text: string): NavSection | undefined {
  const normalized = normalizeText(text)
  return NAV_SECTIONS.find((section) => {
    const candidates = [section.title, ...(SECTION_TITLE_ALIASES[section.key] || [])]
      .map(item => normalizeText(item))
      .filter(Boolean)
    return candidates.some(candidate => normalized.includes(candidate))
  })
}

function mountFloatingNav() {
  ensureStyle()

  const existing = document.querySelector<HTMLElement>('.isthattrue-nav')
  existing?.remove()

  const root = document.createElement('div')
  root.className = 'isthattrue-nav'
  root.innerHTML = `
<div class="isthattrue-nav-header">
  <span class="isthattrue-nav-handle">⋮⋮</span>
  <button class="isthattrue-nav-toggle" type="button">⌄</button>
</div>
<div class="isthattrue-nav-body"></div>
`
  document.body.appendChild(root)

  const body = root.querySelector<HTMLElement>('.isthattrue-nav-body')!
  const toggle = root.querySelector<HTMLButtonElement>('.isthattrue-nav-toggle')!
  const header = root.querySelector<HTMLElement>('.isthattrue-nav-header')!

  const itemMap = new Map<string, HTMLButtonElement>()
  for (const group of NAV_GROUPS) {
    const groupTitle = document.createElement('div')
    groupTitle.className = 'isthattrue-nav-group'
    groupTitle.textContent = group.title
    body.appendChild(groupTitle)

    for (const section of group.sections) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'isthattrue-nav-item'
      button.textContent = section.title
      button.addEventListener('click', () => {
        const target = findHeaderBySection(section)
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      })
      body.appendChild(button)
      itemMap.set(section.key, button)
    }
  }

  toggle.addEventListener('click', (event) => {
    event.stopPropagation()
    const collapsed = root.classList.toggle('collapsed')
    toggle.textContent = collapsed ? '⌃' : '⌄'
  })

  let dragStartX = 0
  let dragStartY = 0
  let startRight = 0
  let startTop = 0

  const onMove = (event: MouseEvent) => {
    const dx = event.clientX - dragStartX
    const dy = event.clientY - dragStartY
    const nextTop = Math.max(0, startTop + dy)
    const nextRight = Math.max(0, startRight - dx)
    root.style.top = `${nextTop}px`
    root.style.right = `${nextRight}px`
  }

  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  header.addEventListener('mousedown', (event) => {
    const target = event.target as HTMLElement
    if (target.closest('.isthattrue-nav-toggle')) return
    event.preventDefault()
    dragStartX = event.clientX
    dragStartY = event.clientY
    startRight = parseFloat(root.style.right || '60')
    startTop = parseFloat(root.style.top || '260')
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })

  let observer: IntersectionObserver | null = null
  const refreshActive = () => {
    observer?.disconnect()
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const text = (entry.target.textContent || '').trim()
        const section = matchSectionByHeaderText(text)
        if (!section) continue
        for (const item of itemMap.values()) item.classList.remove('active')
        itemMap.get(section.key)?.classList.add('active')
        break
      }
    }, {
      root: null,
      rootMargin: '-20% 0px -60% 0px',
      threshold: 0,
    })

    const headers = getSectionNodes()
    for (const node of headers) {
      const text = node.textContent || ''
      if (matchSectionByHeaderText(text)) {
        observer.observe(node)
      }
    }
  }

  const mutationObserver = new MutationObserver(() => {
    window.setTimeout(refreshActive, 200)
  })
  mutationObserver.observe(document.body, { childList: true, subtree: true })

  window.setTimeout(refreshActive, 300)

  return () => {
    observer?.disconnect()
    mutationObserver.disconnect()
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    root.remove()
  }
}

const FactCheckDetailsLoader = defineComponent({
  name: 'FactCheckDetailsLoader',
  setup() {
    const pluginName = inject<ComputedRef<string>>('plugin:name')
    const isOwn = computed(() => {
      const current = pluginName?.value
      return !!current && PLUGIN_NAMES.has(current)
    })

    let dispose: (() => void) | null = null

    const tryMount = () => {
      dispose?.()
      dispose = null
      if (!isOwn.value) return
      dispose = mountFloatingNav()
    }

    onMounted(tryMount)
    watch(isOwn, tryMount)
    onBeforeUnmount(() => dispose?.())
    return () => h('div', { style: { display: 'none' } })
  },
})

export default (ctx: Context) => {
  ctx.slot({
    type: 'plugin-details',
    component: FactCheckDetailsLoader,
    order: -999,
  })
}
