import { Context } from '@koishijs/client'
import { computed, defineComponent, inject, onBeforeUnmount, onMounted, type ComputedRef, watch, h } from 'vue'

type NavSection = {
  key: 'basic' | 'search' | 'output' | 'tool' | 'multi' | 'deep-search' | 'deep-llm' | 'deep-chatluna' | 'deep-searxng' | 'debug'
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
    title: 'Tof 命令',
    sections: [
      { key: 'basic', title: '基础设置' },
      { key: 'search', title: '搜索集成' },
      { key: 'output', title: '输出格式' },
    ],
  },
  {
    title: 'Agent 工具',
    sections: [
      { key: 'tool', title: 'Fact Check 工具' },
      { key: 'multi', title: '多源搜索配置' },
    ],
  },
  {
    title: 'DeepSearch',
    sections: [
      { key: 'deep-search', title: 'DeepSearch 迭代搜索' },
      { key: 'deep-llm', title: 'LLM 搜索源' },
      { key: 'deep-chatluna', title: 'Chatluna 搜索集成' },
      { key: 'deep-searxng', title: 'SearXNG 搜索集成' },
    ],
  },
  {
    title: '调试',
    sections: [
      { key: 'debug', title: '调试' },
    ],
  },
] 

const NAV_SECTIONS: NavSection[] = NAV_GROUPS.flatMap((group) => group.sections)

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

function findHeaderByTitle(title: string) {
  const targetTitle = normalizeText(title)
  const headers = getSectionNodes()
  for (const header of headers) {
    const text = normalizeText(header.textContent || '')
    if (!text) continue
    if (text.includes(targetTitle)) return header
  }
  return null
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
        const target = findHeaderByTitle(section.title)
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
        const section = NAV_SECTIONS.find(item => text.includes(item.title))
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
      const text = normalizeText(node.textContent || '')
      if (NAV_SECTIONS.some(section => text.includes(normalizeText(section.title)))) {
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
