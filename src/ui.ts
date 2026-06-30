import type {
  BestTimes,
  Cell,
  ChordingMode,
  DifficultyName,
  GameController,
  GameSnapshot,
  GameStatus,
  JumpMode,
  LossReason,
} from './game'
import { difficulties } from './game'

const chordingOrder: ChordingMode[] = ['none', 'dig', 'flag', 'both']

const chordingLabels: Record<ChordingMode, string> = {
  none: 'None',
  dig: 'Dig Only',
  flag: 'Flag Only',
  both: 'Both',
}

const jumpOrder: JumpMode[] = ['unrevealed', 'number']

const jumpLabels: Record<JumpMode, string> = {
  unrevealed: 'Unrevealed',
  number: 'Number',
}

type BindableAction =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'reveal'
  | 'flag'
  | 'jumpModifier'
  | 'newGame'

// Every binding is stored the same way (a lowercased key string). 'key' binds match
// event.key; the 'modifier' bind holds a modifier name matched via the event's modifier flags.
type BindKind = 'key' | 'modifier'

type Keybinds = Record<BindableAction, string>

type ModifierKey = 'shift' | 'control' | 'alt' | 'meta'

const binds: { id: BindableAction; label: string; kind: BindKind }[] = [
  { id: 'moveUp', label: 'Move up', kind: 'key' },
  { id: 'moveDown', label: 'Move down', kind: 'key' },
  { id: 'moveLeft', label: 'Move left', kind: 'key' },
  { id: 'moveRight', label: 'Move right', kind: 'key' },
  { id: 'reveal', label: 'Reveal tile', kind: 'key' },
  { id: 'flag', label: 'Flag tile', kind: 'key' },
  { id: 'jumpModifier', label: 'Jump modifier', kind: 'modifier' },
  { id: 'newGame', label: 'New game', kind: 'key' },
]

const modifierLabels: Record<ModifierKey, string> = {
  shift: 'Shift',
  control: 'Ctrl',
  alt: 'Alt',
  meta: 'Meta',
}

const defaultKeybinds: Keybinds = {
  moveUp: 'w',
  moveDown: 's',
  moveLeft: 'a',
  moveRight: 'd',
  reveal: 'j',
  flag: 'k',
  newGame: ' ',
  jumpModifier: 'shift',
}

const keybindsStorageKey = 'minesweeper.keybinds'

function isModifierKey(key: string): key is ModifierKey {
  return key === 'shift' || key === 'control' || key === 'alt' || key === 'meta'
}

function formatBind(keybinds: Keybinds, bind: { id: BindableAction; kind: BindKind }): string {
  const value = keybinds[bind.id]

  if (bind.kind === 'modifier') {
    return isModifierKey(value) ? modifierLabels[value] : value
  }

  if (value === ' ') {
    return 'Space'
  }

  if (value.startsWith('arrow')) {
    return value.slice(5).replace(/^\w/, (char) => char.toUpperCase())
  }

  if (value.length === 1) {
    return value.toUpperCase()
  }

  return value.replace(/^\w/, (char) => char.toUpperCase())
}

function loadKeybinds(): Keybinds {
  try {
    const raw = localStorage.getItem(keybindsStorageKey)

    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Keybinds>
      return { ...defaultKeybinds, ...parsed }
    }
  } catch {
    // ignore unavailable or corrupt storage and fall back to defaults
  }

  return { ...defaultKeybinds }
}

function saveKeybinds(keybinds: Keybinds) {
  try {
    localStorage.setItem(keybindsStorageKey, JSON.stringify(keybinds))
  } catch {
    // ignore unavailable storage
  }
}

function renderKeybinds(keybinds: Keybinds, listeningAction: BindableAction | null) {
  const rows = binds
    .map((bind) => {
      const listening = listeningAction === bind.id
      const prompt = bind.kind === 'modifier' ? 'Press a modifier…' : 'Press a key…'

      return `
        <div class="keybind-row">
          <span class="keybind-label">${bind.label}</span>
          <button
            class="keybind-key ${listening ? 'keybind-key--listening' : ''}"
            data-action="${bind.id}"
            type="button"
          >${listening ? prompt : formatBind(keybinds, bind)}</button>
        </div>
      `
    })
    .join('')

  return `
    <div class="keybinds">
      ${rows}
      <p class="keybind-hint">Hold ${formatBind(keybinds, { id: 'jumpModifier', kind: 'modifier' })} with a move key to jump. Press Esc to cancel rebinding.</p>
    </div>
  `
}

function renderChordingOptions(currentMode: ChordingMode) {
  const buttons = chordingOrder
    .map(
      (mode) => `
        <button
          class="chording-option ${mode === currentMode ? 'chording-option--active' : ''}"
          data-mode="${mode}"
          type="button"
        >${chordingLabels[mode]}</button>
      `,
    )
    .join('')

  return `<div class="chording-bar">${buttons}</div>`
}

function renderJumpOptions(currentMode: JumpMode) {
  const buttons = jumpOrder
    .map(
      (mode) => `
        <button
          class="chording-option ${mode === currentMode ? 'chording-option--active' : ''}"
          data-jump-mode="${mode}"
          type="button"
        >${jumpLabels[mode]}</button>
      `,
    )
    .join('')

  return `<div class="chording-bar">${buttons}</div>`
}

// A simple On/Off toggle used for boolean settings. `name` selects the dataset key so the
// click handler knows which setting changed.
function renderToggle(name: string, enabled: boolean) {
  const option = (value: 'on' | 'off', label: string, active: boolean) => `
    <button
      class="chording-option ${active ? 'chording-option--active' : ''}"
      data-toggle="${name}"
      data-value="${value}"
      type="button"
    >${label}</button>
  `

  return `<div class="chording-bar">${option('on', 'On', enabled)}${option('off', 'Off', !enabled)}</div>`
}

// The end-of-game banner: a bold outcome word plus a one-line detail. While playing it's just
// a hint. Returns the inner HTML for the #message element.
// The bottom-of-board line is now just a hint while playing — the win/loss outcome lives in
// the result popup (see renderResultPopup).
function statusHint(status: GameStatus): string {
  if (status === 'won' || status === 'lost') {
    return ''
  }

  return 'Click a tile to start.'
}

type ResultCopy = { emoji: string; outcome: string; detail: string }

function resultCopy(status: GameStatus, lossReason: LossReason): ResultCopy | null {
  if (status === 'won') {
    return { emoji: '🎉', outcome: 'You win!', detail: 'You cleared every safe tile.' }
  }

  if (status === 'lost') {
    const detail =
      lossReason === 'guess'
        ? 'You revealed a tile that wasn\'t provably safe — no lucky guesses allowed.'
        : 'You hit a mine.'

    return { emoji: '💥', outcome: 'You lose', detail }
  }

  return null
}

// The win/loss modal. Returns '' when the game is in progress, or when the player has
// dismissed the popup to inspect the final board.
function renderResultPopup(snapshot: GameSnapshot, dismissed: boolean, animate: boolean): string {
  const copy = resultCopy(snapshot.status, snapshot.lossReason)

  if (!copy || dismissed) {
    return ''
  }

  const variant = snapshot.status === 'won' ? 'result-overlay--won' : 'result-overlay--lost'
  // Only the first render after the game ends animates in; later re-renders (e.g. pressing a
  // key while the popup is open) recreate the element but must not replay the entrance.
  const motion = animate ? '' : ' result-overlay--no-anim'

  const best = snapshot.bestTimes[snapshot.difficulty]
  const isNewBest = snapshot.status === 'won' && best !== undefined && snapshot.elapsed <= best
  const time =
    snapshot.status === 'won'
      ? `
        <div class="result-time">
          <span class="result-time-label">Cleared in</span>
          <span class="result-time-value">${formatTime(snapshot.elapsed)}</span>
          ${isNewBest ? '<span class="result-best">New Time!</span>' : ''}
        </div>
      `
      : ''

  return `
    <div class="result-overlay ${variant}${motion}" role="dialog" aria-modal="true" aria-label="Game result">
      <div class="result-modal">
        <button class="result-close" type="button" aria-label="Dismiss">×</button>
        <div class="result-emoji">${copy.emoji}</div>
        <h2 class="result-outcome">${copy.outcome}</h2>
        <p class="result-detail">${copy.detail}</p>
        ${time}
        <button class="result-newgame" type="button">New game</button>
      </div>
    </div>
  `
}

function formatTime(ms: number): string {
  const clamped = Math.max(0, ms)
  const minutes = Math.floor(clamped / 60000)
  const seconds = Math.floor((clamped % 60000) / 1000)
  const millis = Math.floor(clamped % 1000)

  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

function cellLabel(cell: Cell): string {
  if (cell.flagged) {
    return '🚩'
  }

  if (!cell.revealed) {
    return ''
  }

  if (cell.mine) {
    return '✹'
  }

  return cell.adjacent > 0 ? String(cell.adjacent) : ''
}

function cellClass(cell: Cell, targeted: boolean): string {
  return [
    'cell',
    cell.revealed ? 'cell--revealed' : '',
    cell.mine && cell.revealed ? 'cell--mine' : '',
    cell.flagged ? 'cell--flagged' : '',
    cell.revealed && !cell.mine && cell.adjacent > 0 ? `cell--${cell.adjacent}` : '',
    cell.incorrectFlagCount ? 'cell--incorrect' : '',
    targeted ? 'cell--targeted' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function renderDifficultyButtons(currentDifficulty: DifficultyName) {
  const buttons = Object.entries(difficulties)
    .map(
      ([key, value]) => `
        <button class="difficulty ${key === currentDifficulty ? 'difficulty--active' : ''}" data-difficulty="${key}" type="button">${value.label}</button>
      `,
    )
    .join('')

  return `<div class="difficulty-bar">${buttons}</div>`
}

function renderBoard(board: Cell[][], targetedCell: GameSnapshot['targetedCell']) {
  return board
    .map(
      (row, rowIndex) => `
        <div class="row">
          ${row
            .map(
              (cell, colIndex) => `
                <button
                  class="${cellClass(cell, targetedCell?.row === rowIndex && targetedCell?.col === colIndex)}"
                  type="button"
                  data-row="${rowIndex}"
                  data-col="${colIndex}"
                  aria-label="${cell.revealed ? (cell.mine ? 'Mine' : `${cell.adjacent} adjacent mines`) : 'Hidden tile'}"
                >
                  ${cellLabel(cell)}
                </button>
              `,
            )
            .join('')}
        </div>
      `,
    )
    .join('')
}

const sections = ['settings', 'besttimes', 'howto'] as const

type SidebarSection = (typeof sections)[number]

const sectionLabels: Record<SidebarSection, string> = {
  settings: 'Settings',
  besttimes: 'Best Times',
  howto: 'How To Play',
}

function renderBestTimesSection(bestTimes: BestTimes) {
  const rows = (Object.keys(difficulties) as DifficultyName[])
    .map((name) => {
      const best = bestTimes[name]
      const time = best === undefined ? '—' : formatTime(best)

      return `
        <li class="best-time-row">
          <span class="best-time-difficulty">${difficulties[name].label}</span>
          <span class="best-time-value">${time}</span>
        </li>
      `
    })
    .join('')

  return `<ul class="best-times">${rows}</ul>`
}

function renderSectionTabs(activeSection: SidebarSection) {
  const tabs = sections
    .map(
      (section) => `
        <button
          class="section-tab ${section === activeSection ? 'section-tab--active' : ''}"
          data-section="${section}"
          type="button"
        >${sectionLabels[section]}</button>
      `,
    )
    .join('')

  return `<div class="section-tabs" role="tablist">${tabs}</div>`
}

function renderSettingsSection(snapshot: GameSnapshot, keybinds: Keybinds, listeningAction: BindableAction | null) {
  return `
    <div class="settings-block">
      <div class="settings-meta">
        <h2>${snapshot.difficultyLabel}</h2>
        <p>${snapshot.rows} x ${snapshot.cols} grid with ${snapshot.mines} mines</p>
      </div>

      ${renderDifficultyButtons(snapshot.difficulty)}

      <div class="settings-option settings-option--stacked">
        <span class="option-label">Chording Mode</span>
        ${renderChordingOptions(snapshot.chordingMode)}
      </div>

      <div class="settings-option settings-option--stacked">
        <span class="option-label">Smart Chording</span>
        ${renderToggle('smartChording', snapshot.smartChording)}
      </div>

      <div class="settings-option settings-option--stacked">
        <span class="option-label">Punish Guessing</span>
        ${renderToggle('punishGuessing', snapshot.punishGuessing)}
      </div>

      <div class="settings-option settings-option--stacked">
        <span class="option-label">Jump Mode</span>
        ${renderJumpOptions(snapshot.jumpMode)}
      </div>

      <div class="settings-option settings-option--stacked">
        <span class="option-label">Keybinds</span>
        ${renderKeybinds(keybinds, listeningAction)}
      </div>
    </div>
  `
}

function renderHowToSection(keybinds: Keybinds) {
  const key = (id: BindableAction) => formatBind(keybinds, { id, kind: 'key' })
  const moveKeys = `${key('moveUp')} / ${key('moveLeft')} / ${key('moveDown')} / ${key('moveRight')}`

  return `
    <div class="howto">
      <p class="settings-copy">Reveal every safe tile without detonating a mine. Numbers show how many mines touch that tile.</p>

      <h3>Mouse</h3>
      <ul>
        <li><strong>Left click</strong> — reveal a tile.</li>
        <li><strong>Right click</strong> — place or remove a flag.</li>
        <li><strong>Click a number</strong> — chord (see below).</li>
      </ul>

      <h3>Keyboard</h3>
      <ul>
        <li><strong>${moveKeys}</strong> — move the target tile.</li>
        <li><strong>${formatBind(keybinds, { id: 'jumpModifier', kind: 'modifier' })} + move key</strong> — jump in that direction (see Jump Mode).</li>
        <li><strong>${key('reveal')}</strong> — reveal the target tile.</li>
        <li><strong>${key('flag')}</strong> — flag the target tile.</li>
        <li><strong>${key('newGame')}</strong> — start a new game.</li>
      </ul>
      <p class="settings-copy">Rebind any of these in the Settings tab.</p>

      <h3>Chording</h3>
      <p>On a revealed number whose adjacent flags match its value, activating it clears the remaining neighbors. <strong>Chording Mode</strong> picks which actions chord: dig (reveal), flag, both, or none.</p>

      <h3>Smart Chording</h3>
      <p><strong>On</strong> only chords when the surrounding flags match the number. <strong>Off</strong> skips that check and reveals (or flags) every non-flagged neighbor — faster, but it will happily detonate a mine.</p>

      <h3>Punish Guessing</h3>
      <p>When <strong>on</strong>, revealing a tile that couldn't be proven safe from the visible board loses the game — even if that tile wasn't a mine. Boards are always solvable without guessing, so there's always a logical move to find.</p>

      <h3>Jump Mode</h3>
      <p><strong>Unrevealed</strong> jumps to the next hidden tile; <strong>Number</strong> jumps to the next numbered tile in the direction you press.</p>
    </div>
  `
}

function renderApp(
  snapshot: GameSnapshot,
  activeSection: SidebarSection,
  keybinds: Keybinds,
  listeningAction: BindableAction | null,
  resultDismissed: boolean,
  animateResult: boolean,
) {
  return `
    <main class="game-shell">
      <section class="board-column panel">
        <div class="board-bar">
          <button id="reset" class="reset-button reset-button--compact" type="button">New game</button>
          <div class="board-stat">
            <span class="board-stat-label">Mines</span>
            <strong id="mines-left">${snapshot.remainingMines}</strong>
          </div>
          <div class="board-stat">
            <span class="board-stat-label">Time</span>
            <strong id="timer">${formatTime(snapshot.elapsed)}</strong>
          </div>
        </div>

        <div class="board" style="--cols: ${snapshot.cols}">
          ${renderBoard(snapshot.board, snapshot.targetedCell)}
        </div>

        <p id="message" class="message">${statusHint(snapshot.status)}</p>

        ${renderResultPopup(snapshot, resultDismissed, animateResult)}
      </section>

      <aside class="settings-column panel">
        <div class="eyebrow">Minesweeper</div>
        <h1>Clear the grid.</h1>

        ${renderSectionTabs(activeSection)}

        ${
          activeSection === 'settings'
            ? renderSettingsSection(snapshot, keybinds, listeningAction)
            : activeSection === 'besttimes'
              ? renderBestTimesSection(snapshot.bestTimes)
              : renderHowToSection(keybinds)
        }
      </aside>
    </main>
  `
}

export function mountGame(root: HTMLElement, game: GameController) {
  let activeSection: SidebarSection = 'settings'
  const keybinds = loadKeybinds()
  let listeningAction: BindableAction | null = null
  // Lets the player close the win/loss popup to inspect the final board; reset on a new game.
  let resultDismissed = false
  // True once the result popup's entrance has played, so re-renders while it's open don't replay it.
  let resultPopupShown = false

  const handleMouseDown = (event: MouseEvent) => {
    if (event.button === 1) {
      event.preventDefault()
    }
  }

  const isJumpModifierActive = (event: KeyboardEvent): boolean => {
    switch (keybinds.jumpModifier) {
      case 'shift':
        return event.shiftKey
      case 'control':
        return event.ctrlKey
      case 'alt':
        return event.altKey
      case 'meta':
        return event.metaKey
      default:
        return false
    }
  }

  const actionForKey = (key: string): BindableAction | null => {
    for (const bind of binds) {
      if (bind.kind === 'key' && keybinds[bind.id] === key) {
        return bind.id
      }
    }

    return null
  }

  const assignKey = (action: BindableAction, key: string) => {
    const previousKey = keybinds[action]

    // If the key already drives another action, swap so every action keeps a binding.
    for (const bind of binds) {
      if (bind.kind === 'key' && bind.id !== action && keybinds[bind.id] === key) {
        keybinds[bind.id] = previousKey
      }
    }

    keybinds[action] = key
    saveKeybinds(keybinds)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase()

    if (listeningAction) {
      event.preventDefault()

      if (key === 'escape') {
        listeningAction = null
        render()
        return
      }

      const bind = binds.find((entry) => entry.id === listeningAction)

      if (bind?.kind === 'modifier') {
        // A modifier bind only accepts a modifier key; ignore anything else and keep listening.
        if (isModifierKey(key)) {
          keybinds[bind.id] = key
          saveKeybinds(keybinds)
          listeningAction = null
          render()
        }

        return
      }

      // A key bind ignores bare modifier presses so they stay free for the jump modifier.
      if (isModifierKey(key)) {
        return
      }

      assignKey(listeningAction, key === 'spacebar' ? ' ' : key)
      listeningAction = null
      render()
      return
    }

    if (event.defaultPrevented) {
      return
    }

    const action = actionForKey(key === 'spacebar' ? ' ' : key)

    if (!action) {
      return
    }

    const snapshot = game.getSnapshot()
    const targetedCell = snapshot.targetedCell
    const jump =
      snapshot.jumpMode === 'number' ? game.moveTargetToNextNumberCell : game.moveTargetToFirstUnrevealedCell
    const move = isJumpModifierActive(event) ? jump : game.moveTarget

    switch (action) {
      case 'moveUp':
        event.preventDefault()
        move(-1, 0)
        break
      case 'moveLeft':
        event.preventDefault()
        move(0, -1)
        break
      case 'moveDown':
        event.preventDefault()
        move(1, 0)
        break
      case 'moveRight':
        event.preventDefault()
        move(0, 1)
        break
      case 'reveal':
        if (!targetedCell) {
          return
        }

        event.preventDefault()
        game.clickCell(targetedCell.row, targetedCell.col)
        break
      case 'flag':
        if (!targetedCell) {
          return
        }

        event.preventDefault()
        game.toggleFlag(targetedCell.row, targetedCell.col)
        break
      case 'newGame':
        event.preventDefault()
        game.reset()
        break
    }
  }

  const render = () => {
    const snapshot = game.getSnapshot()

    // A fresh or in-progress game clears any prior dismissal so the next result pops up.
    if (snapshot.status === 'ready' || snapshot.status === 'playing') {
      resultDismissed = false
      resultPopupShown = false
    }

    const showPopup = (snapshot.status === 'won' || snapshot.status === 'lost') && !resultDismissed
    // Animate the entrance only the first time the popup appears. A single game-ending action can
    // trigger several synchronous re-renders (e.g. endGame's notify plus clickCell's own notify);
    // those all share one paint, so they must all animate. We only mark the popup "shown" on the
    // next frame — after it's actually painted — so a later render (pressing a key while it's open)
    // is what gets suppressed, not the synchronous burst that first shows it.
    const animateResult = showPopup && !resultPopupShown

    if (showPopup && !resultPopupShown) {
      requestAnimationFrame(() => {
        resultPopupShown = true
      })
    }

    root.innerHTML = renderApp(snapshot, activeSection, keybinds, listeningAction, resultDismissed, animateResult)

    const boardElement = root.querySelector<HTMLDivElement>('.board')
    const resetButton = root.querySelector<HTMLButtonElement>('#reset')
    const resultOverlay = root.querySelector<HTMLDivElement>('.result-overlay')
    const resultNewGame = root.querySelector<HTMLButtonElement>('.result-newgame')
    const resultClose = root.querySelector<HTMLButtonElement>('.result-close')
    const sectionTabs = Array.from(root.querySelectorAll<HTMLButtonElement>('.section-tab'))
    const chordingButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.chording-option[data-mode]'))
    const jumpButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.chording-option[data-jump-mode]'))
    const toggleButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.chording-option[data-toggle]'))
    const keybindButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.keybind-key'))
    const difficultyButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.difficulty'))

    for (const tab of sectionTabs) {
      tab.addEventListener('click', () => {
        const selected = tab.dataset.section as SidebarSection | undefined

        if (!selected || selected === activeSection) {
          return
        }

        activeSection = selected
        render()
      })
    }

    if (resetButton) {
      resetButton.addEventListener('click', () => {
        game.reset()
      })
    }

    if (resultNewGame) {
      resultNewGame.addEventListener('click', () => {
        game.reset()
      })
    }

    const dismissResult = () => {
      resultDismissed = true
      render()
    }

    if (resultClose) {
      resultClose.addEventListener('click', dismissResult)
    }

    if (resultOverlay) {
      // Clicking the dimmed backdrop (outside the modal) dismisses to reveal the final board.
      resultOverlay.addEventListener('click', (event) => {
        if (event.target === resultOverlay) {
          dismissResult()
        }
      })
    }

    for (const button of chordingButtons) {
      button.addEventListener('click', () => {
        const selected = button.dataset.mode as ChordingMode | undefined

        if (!selected || selected === snapshot.chordingMode) {
          return
        }

        game.setChordingMode(selected)
      })
    }

    for (const button of jumpButtons) {
      button.addEventListener('click', () => {
        const selected = button.dataset.jumpMode as JumpMode | undefined

        if (!selected || selected === snapshot.jumpMode) {
          return
        }

        game.setJumpMode(selected)
      })
    }

    for (const button of toggleButtons) {
      button.addEventListener('click', () => {
        const toggle = button.dataset.toggle
        const enabled = button.dataset.value === 'on'

        if (toggle === 'smartChording') {
          if (enabled !== snapshot.smartChording) {
            game.setSmartChording(enabled)
          }
        } else if (toggle === 'punishGuessing') {
          if (enabled !== snapshot.punishGuessing) {
            game.setPunishGuessing(enabled)
          }
        }
      })
    }

    for (const button of keybindButtons) {
      button.addEventListener('click', () => {
        const action = button.dataset.action as BindableAction | undefined

        if (!action) {
          return
        }

        // Toggle off if this one is already listening, otherwise start listening for it.
        listeningAction = listeningAction === action ? null : action
        render()
      })
    }

    for (const button of difficultyButtons) {
      button.addEventListener('click', () => {
        const selected = button.dataset.difficulty as DifficultyName | undefined

        if (!selected || selected === snapshot.difficulty) {
          return
        }

        game.setDifficulty(selected)
      })
    }

    boardElement?.querySelectorAll<HTMLButtonElement>('.cell').forEach((button) => {
      button.addEventListener('click', () => {
        const row = Number(button.dataset.row)
        const col = Number(button.dataset.col)

        game.clickCell(row, col)
      })

      button.addEventListener('contextmenu', (event) => {
        event.preventDefault()
        const row = Number(button.dataset.row)
        const col = Number(button.dataset.col)
        game.toggleFlag(row, col)
      })
    })
  }

  let timerFrame = 0
  const tickTimer = () => {
    const timerElement = root.querySelector<HTMLElement>('#timer')

    if (timerElement) {
      timerElement.textContent = formatTime(game.getElapsedMs())
    }

    timerFrame = requestAnimationFrame(tickTimer)
  }

  root.addEventListener('mousedown', handleMouseDown)
  window.addEventListener('keydown', handleKeyDown)
  render()
  tickTimer()

  const unsubscribe = game.subscribe(render)

  return () => {
    cancelAnimationFrame(timerFrame)
    root.removeEventListener('mousedown', handleMouseDown)
    window.removeEventListener('keydown', handleKeyDown)
    unsubscribe()
  }
}