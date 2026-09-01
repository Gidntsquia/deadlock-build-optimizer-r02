import type { Item } from './types'

// Groups items into upgrade chains: a picked item's `components` (the items
// it consumes to buy, which follow transitively — components can themselves
// have components) and any item that lists it as a component (also
// transitive) all belong to the same chain. In-game, buying an upgrade
// consumes its component, which then becomes unpurchasable — so a build may
// contain at most one item per chain (see T18).
//
// Implemented as union-find over the components graph: each item starts in
// its own singleton group, then every component edge unions the two items.
// Component ids absent from the catalog (not in `items`) are ignored — an
// item that isn't in the catalog can never be picked anyway.
export function buildItemChainGroups(items: Item[]): Map<number, Set<number>> {
  const itemIds = new Set(items.map((item) => item.id))
  const parent = new Map<number, number>(items.map((item) => [item.id, item.id]))

  function find(id: number): number {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root)!
    let cur = id
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!
      parent.set(cur, root)
      cur = next
    }
    return root
  }

  function union(a: number, b: number): void {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootA, rootB)
  }

  for (const item of items) {
    for (const componentId of item.components) {
      if (itemIds.has(componentId)) union(item.id, componentId)
    }
  }

  const groupsByRoot = new Map<number, Set<number>>()
  for (const item of items) {
    const root = find(item.id)
    let group = groupsByRoot.get(root)
    if (!group) {
      group = new Set()
      groupsByRoot.set(root, group)
    }
    group.add(item.id)
  }

  const groupById = new Map<number, Set<number>>()
  for (const item of items) {
    groupById.set(item.id, groupsByRoot.get(find(item.id))!)
  }
  return groupById
}
