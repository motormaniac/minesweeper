// Player-knowledge solver for the "Punish Guessing" mode.
//
// Given only what the player can currently see (revealed numbers and the total mine
// count), this computes the set of unrevealed cells that are provably mine-free — i.e.
// safe in every mine layout consistent with the visible numbers. A reveal of any cell
// outside this set is a guess.
//
// It deliberately uses the SAME deduction techniques as boardGenerator's solvability
// check (single-constraint, whole-board counting, and bounded frontier enumeration). That
// parity guarantees a player making only logically-forced moves is never punished: anything
// the generator could prove safe, this proves safe too.

import type { Cell } from './game'

// Must match boardGenerator's enumerationCellCap so the two solvers stay in lockstep.
const enumerationCellCap = 18

type Constraint = {
  cells: number[] // unknown neighbour cell indices (row * cols + col)
  mines: number
}

/**
 * Returns the indices (row * cols + col) of every unrevealed cell that is provably safe to
 * reveal given the current board state and total mine count. Flags are ignored — safety is
 * derived purely from revealed numbers, since a flag is itself only the player's assertion.
 */
export function computeSafeCells(board: Cell[][], totalMines: number): Set<number> {
  const rows = board.length
  const cols = rows > 0 ? board[0].length : 0
  const safe = new Set<number>()
  const mine = new Set<number>()

  const idx = (row: number, col: number) => row * cols + col

  const neighborsOf = (row: number, col: number): Array<[number, number]> => {
    const positions: Array<[number, number]> = []

    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
        if (rowOffset === 0 && colOffset === 0) {
          continue
        }

        const nextRow = row + rowOffset
        const nextCol = col + colOffset

        if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) {
          positions.push([nextRow, nextCol])
        }
      }
    }

    return positions
  }

  // An "unknown" cell is unrevealed and not yet deduced as either a mine or safe.
  const isUnknown = (row: number, col: number) =>
    !board[row][col].revealed && !mine.has(idx(row, col)) && !safe.has(idx(row, col))

  // Single-constraint deductions from one revealed number's neighbourhood.
  const applyTrivial = (): boolean => {
    let changed = false

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const cell = board[row][col]

        if (!cell.revealed || cell.mine || cell.adjacent === 0) {
          continue
        }

        let flagged = 0
        const unknown: number[] = []

        for (const [nextRow, nextCol] of neighborsOf(row, col)) {
          if (mine.has(idx(nextRow, nextCol))) {
            flagged += 1
          } else if (isUnknown(nextRow, nextCol)) {
            unknown.push(idx(nextRow, nextCol))
          }
        }

        if (unknown.length === 0) {
          continue
        }

        const remaining = cell.adjacent - flagged

        if (remaining === 0) {
          for (const cellIndex of unknown) {
            safe.add(cellIndex)
          }
          changed = true
        } else if (remaining === unknown.length) {
          for (const cellIndex of unknown) {
            mine.add(cellIndex)
          }
          changed = true
        }
      }
    }

    return changed
  }

  // Whole-board counting against the total mine budget.
  const applyGlobalCount = (): boolean => {
    const unknown: number[] = []

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (isUnknown(row, col)) {
          unknown.push(idx(row, col))
        }
      }
    }

    if (unknown.length === 0) {
      return false
    }

    if (mine.size === totalMines) {
      for (const cellIndex of unknown) {
        safe.add(cellIndex)
      }
      return true
    }

    if (mine.size + unknown.length === totalMines) {
      for (const cellIndex of unknown) {
        mine.add(cellIndex)
      }
      return true
    }

    return false
  }

  // Bounded frontier enumeration: split the constrained unknowns into independent components
  // and brute-force each. A cell that is a mine in every valid assignment is a known mine; one
  // never a mine is safe. Resolves patterns (1-2-1, etc.) single-constraint logic misses.
  const applyEnumeration = (): boolean => {
    const constraints: Constraint[] = []

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const cell = board[row][col]

        if (!cell.revealed || cell.mine || cell.adjacent === 0) {
          continue
        }

        let flagged = 0
        const unknown: number[] = []

        for (const [nextRow, nextCol] of neighborsOf(row, col)) {
          if (mine.has(idx(nextRow, nextCol))) {
            flagged += 1
          } else if (isUnknown(nextRow, nextCol)) {
            unknown.push(idx(nextRow, nextCol))
          }
        }

        if (unknown.length > 0) {
          constraints.push({ cells: unknown, mines: cell.adjacent - flagged })
        }
      }
    }

    if (constraints.length === 0) {
      return false
    }

    let changed = false

    for (const component of groupConstraints(constraints)) {
      if (component.cells.length > enumerationCellCap) {
        continue
      }

      const verdict = enumerateComponent(component.cells, component.constraints)
      if (!verdict) {
        continue
      }

      for (const cellIndex of verdict.safe) {
        if (!safe.has(cellIndex)) {
          safe.add(cellIndex)
          changed = true
        }
      }

      for (const cellIndex of verdict.mines) {
        if (!mine.has(cellIndex)) {
          mine.add(cellIndex)
          changed = true
        }
      }
    }

    return changed
  }

  let progress = true
  while (progress) {
    progress = applyTrivial() || applyGlobalCount() || applyEnumeration()
  }

  return safe
}

// Group constraints that share unknown cells into independent components via union-find.
function groupConstraints(constraints: Constraint[]): { cells: number[]; constraints: Constraint[] }[] {
  const parent = new Map<number, number>()

  const find = (x: number): number => {
    let root = x
    while (parent.get(root) !== root) {
      root = parent.get(root)!
    }
    let current = x
    while (parent.get(current) !== root) {
      const next = parent.get(current)!
      parent.set(current, root)
      current = next
    }
    return root
  }

  const union = (a: number, b: number) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) {
      parent.set(rootA, rootB)
    }
  }

  for (const constraint of constraints) {
    for (const cell of constraint.cells) {
      if (!parent.has(cell)) {
        parent.set(cell, cell)
      }
    }
    for (let i = 1; i < constraint.cells.length; i += 1) {
      union(constraint.cells[0], constraint.cells[i])
    }
  }

  const cellGroups = new Map<number, number[]>()
  for (const cell of parent.keys()) {
    const root = find(cell)
    const group = cellGroups.get(root) ?? []
    group.push(cell)
    cellGroups.set(root, group)
  }

  const constraintGroups = new Map<number, Constraint[]>()
  for (const constraint of constraints) {
    const root = find(constraint.cells[0])
    const group = constraintGroups.get(root) ?? []
    group.push(constraint)
    constraintGroups.set(root, group)
  }

  return [...cellGroups.entries()].map(([root, cells]) => ({
    cells,
    constraints: constraintGroups.get(root) ?? [],
  }))
}

// Brute-force every mine/no-mine assignment of the component's cells against its constraints.
function enumerateComponent(
  cells: number[],
  constraints: Constraint[],
): { safe: number[]; mines: number[] } | null {
  const size = cells.length
  const bitOf = new Map<number, number>()
  cells.forEach((cell, index) => bitOf.set(cell, index))

  const masks = constraints.map((constraint) => ({
    bits: constraint.cells.map((cell) => bitOf.get(cell)!),
    mines: constraint.mines,
  }))

  let solutions = 0
  const mineHits = new Array<number>(size).fill(0)
  const total = 1 << size

  for (let assignment = 0; assignment < total; assignment += 1) {
    let valid = true

    for (const mask of masks) {
      let sum = 0
      for (const bit of mask.bits) {
        if (assignment & (1 << bit)) {
          sum += 1
        }
      }
      if (sum !== mask.mines) {
        valid = false
        break
      }
    }

    if (!valid) {
      continue
    }

    solutions += 1
    for (let i = 0; i < size; i += 1) {
      if (assignment & (1 << i)) {
        mineHits[i] += 1
      }
    }
  }

  if (solutions === 0) {
    return null
  }

  const safe: number[] = []
  const mines: number[] = []

  for (let i = 0; i < size; i += 1) {
    if (mineHits[i] === 0) {
      safe.push(cells[i])
    } else if (mineHits[i] === solutions) {
      mines.push(cells[i])
    }
  }

  return { safe, mines }
}
