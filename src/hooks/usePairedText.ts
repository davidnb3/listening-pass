import { useLayoutEffect, type RefObject } from 'react'

/** Give matching text blocks in the two columns the same height. */
export function usePairedText(root: RefObject<HTMLElement | null>, active: boolean, revision: string) {
  useLayoutEffect(() => {
    const stage = root.current
    if (!stage) return
    let ignore = false
    const apply = () => {
      if (ignore) return
      ignore = true
      alignPairedText(stage, active)
      requestAnimationFrame(() => {
        ignore = false
      })
    }
    apply()
    if (!active) return
    const observer = new ResizeObserver(apply)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [root, active, revision])
}

function alignPairedText(stage: HTMLElement, active: boolean) {
  const columns = [...stage.querySelectorAll<HTMLElement>(':scope > .pair-col')]
  const groups = new Map<string, HTMLElement[]>()
  for (const column of columns) {
    for (const node of column.querySelectorAll<HTMLElement>('[data-align]')) {
      const key = node.dataset.align
      if (!key) continue
      const list = groups.get(key)
      if (list) list.push(node)
      else groups.set(key, [node])
    }
  }

  const paired: HTMLElement[][] = []
  for (const nodes of groups.values()) {
    if (!active || nodes.length < 2) {
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
