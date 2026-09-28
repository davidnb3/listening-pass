import { useLayoutEffect, type RefObject } from 'react'

const travelMs = 720

/**
 * An open Earlier passes list grows in its own column. The other column keeps
 * its place until that height animation ends, then the reports line up again.
 */
export function usePassAlign(root: RefObject<HTMLElement | null>, active: boolean) {
  useLayoutEffect(() => {
    const stage = root.current
    if (!stage) return
    if (!active) {
      clearHeads(stage)
      clearSync(stage)
      return
    }

    let openCols = openColumns(stage)
    let fallback = 0
    let hold = false
    let ignore = false

    const finish = () => {
      hold = false
      alignSync(stage)
      lockHeads(stage)
    }

    const onResize = () => {
      if (ignore || hold) return
      ignore = true
      alignSync(stage)
      lockHeads(stage)
      requestAnimationFrame(() => {
        ignore = false
      })
    }

    const onMutate = () => {
      const now = openColumns(stage)
      if (sameColumns(now, openCols)) return
      window.clearTimeout(fallback)
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduced) {
        openCols = now
        finish()
        return
      }
      if (now.size === 0) {
        for (const column of openCols) {
          const head = column.querySelector<HTMLElement>(':scope > .column-head')
          if (head) head.style.minHeight = ''
        }
      }
      openCols = now
      hold = true
      fallback = window.setTimeout(finish, travelMs)
    }

    const onEnd = (event: Event) => {
      const transition = event as TransitionEvent
      if (transition.propertyName !== 'grid-template-rows') return
      const target = transition.target
      if (!(target instanceof Element) || !target.classList.contains('passes-panel')) return
      if (!hold || traveling(stage)) return
      window.clearTimeout(fallback)
      finish()
    }

    finish()
    const mutations = new MutationObserver(onMutate)
    mutations.observe(stage, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
    })
    const resize = new ResizeObserver(onResize)
    resize.observe(stage)
    stage.addEventListener('transitionend', onEnd)
    return () => {
      window.clearTimeout(fallback)
      mutations.disconnect()
      resize.disconnect()
      stage.removeEventListener('transitionend', onEnd)
      clearHeads(stage)
      clearSync(stage)
    }
  }, [root, active])
}

function openColumns(stage: HTMLElement) {
  const columns = new Set<HTMLElement>()
  for (const node of stage.querySelectorAll('.passes.is-open')) {
    const column = node.closest('.pair-col')
    if (column instanceof HTMLElement) columns.add(column)
  }
  return columns
}

function sameColumns(next: Set<HTMLElement>, prev: Set<HTMLElement>) {
  if (next.size !== prev.size) return false
  for (const column of next) if (!prev.has(column)) return false
  return true
}

function traveling(stage: HTMLElement) {
  for (const panel of stage.querySelectorAll('.passes-panel')) {
    if (panel.getAnimations().some((animation) => animation.playState === 'running')) return true
  }
  return false
}

function sideBySide(stage: HTMLElement) {
  const columns = [...stage.querySelectorAll<HTMLElement>(':scope > .pair-col')]
  if (columns.length < 2) return false
  const first = columns[0].getBoundingClientRect()
  const second = columns[1].getBoundingClientRect()
  return second.left > first.left + 8 && second.top < first.bottom
}

function lockHeads(stage: HTMLElement) {
  const heads = [...stage.querySelectorAll<HTMLElement>(':scope > .pair-col > .column-head')]
  if (!sideBySide(stage)) {
    for (const head of heads) head.style.minHeight = ''
    return
  }
  const openHeads = heads.filter((head) => head.querySelector('.passes.is-open'))
  if (openHeads.length === 0) {
    for (const head of heads) head.style.minHeight = ''
    return
  }
  for (const head of heads) head.style.minHeight = ''
  const max = Math.ceil(Math.max(...openHeads.map((head) => head.getBoundingClientRect().height)))
  const next = `${max}px`
  for (const head of heads) {
    if (head.style.minHeight !== next) head.style.minHeight = next
  }
}

function clearHeads(stage: HTMLElement) {
  for (const head of stage.querySelectorAll<HTMLElement>('.column-head')) head.style.minHeight = ''
}

function alignSync(stage: HTMLElement) {
  const groups = new Map<string, HTMLElement[]>()
  for (const column of stage.querySelectorAll<HTMLElement>(':scope > .pair-col')) {
    for (const node of column.querySelectorAll<HTMLElement>('[data-sync]')) {
      const key = node.dataset.sync
      if (!key) continue
      const list = groups.get(key)
      if (list) list.push(node)
      else groups.set(key, [node])
    }
  }

  const paired: HTMLElement[][] = []
  const beside = sideBySide(stage)
  for (const nodes of groups.values()) {
    if (!beside || nodes.length < 2) {
      for (const node of nodes) node.style.minHeight = ''
      continue
    }
    paired.push(nodes)
    for (const node of nodes) node.style.minHeight = ''
  }

  const measured = paired.map((nodes) => ({
    nodes,
    height: Math.ceil(Math.max(...nodes.map((node) => node.offsetHeight))),
  }))
  for (const { nodes, height } of measured) {
    const next = `${height}px`
    for (const node of nodes) {
      if (node.style.minHeight !== next) node.style.minHeight = next
    }
  }
}

function clearSync(stage: HTMLElement) {
  for (const node of stage.querySelectorAll<HTMLElement>('[data-sync]')) node.style.minHeight = ''
}
