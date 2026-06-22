// Change-notes ("What's New") popup.
//
// Bump `currentVersion` whenever you add a new changelog entry. Anyone whose stored
// "seen" version is lower than the newest version gets the popup automatically on load;
// closing it records the current version so it won't auto-show again. The floating
// bottom-right button reopens it on demand.

type ChangeNote = {
  version: number
  title: string
  notes: string[]
}

const changelog: ChangeNote[] = [
  {
    version: 3,
    title: 'Smarter boards & stats',
    notes: [
      'Boards are now generated to always be solvable without guessing.',
      'New Best Times tab tracks your fastest clear per difficulty.',
      'The targeted cell is now tinted differently when revealed vs hidden.',
    ],
  },
  {
    version: 2,
    title: 'Controls & persistence',
    notes: [
      'Rebind every key, including the jump modifier, from the Settings tab.',
      'Your board, settings, and stats now persist between sessions.',
      'Timer is now a millisecond stopwatch.',
    ],
  },
  {
    version: 1,
    title: 'Initial release',
    notes: [
      'Chording modes, jump movement modes, and a How To Play guide.',
    ],
  },
]

// The newest version pushed = the highest version present in the changelog.
const currentVersion = changelog.reduce((max, entry) => Math.max(max, entry.version), 0)

const seenVersionKey = 'minesweeper.seenVersion'

function loadSeenVersion(): number {
  try {
    const raw = localStorage.getItem(seenVersionKey)
    const parsed = raw ? Number.parseInt(raw, 10) : 0
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    return 0
  }
}

function saveSeenVersion(version: number) {
  try {
    localStorage.setItem(seenVersionKey, String(version))
  } catch {
    // ignore unavailable storage
  }
}

function renderEntries(): string {
  return changelog
    .map(
      (entry) => `
        <section class="change-notes-entry">
          <h3>v${entry.version} · ${entry.title}</h3>
          <ul>
            ${entry.notes.map((note) => `<li>${note}</li>`).join('')}
          </ul>
        </section>
      `,
    )
    .join('')
}

export function mountChangeNotes() {
  const container = document.createElement('div')
  container.innerHTML = `
    <button class="change-notes-button" type="button" aria-label="Show change notes">📝</button>
    <div class="change-notes-overlay" role="dialog" aria-modal="true" aria-label="Change notes">
      <div class="change-notes-modal">
        <button class="change-notes-close" type="button" aria-label="Close change notes">×</button>
        <div class="change-notes-eyebrow">What's New</div>
        <h2 class="change-notes-title">Change Notes</h2>
        <div class="change-notes-body">
          ${renderEntries()}
        </div>
      </div>
    </div>
  `

  document.body.appendChild(container)

  const overlay = container.querySelector<HTMLDivElement>('.change-notes-overlay')!
  const openButton = container.querySelector<HTMLButtonElement>('.change-notes-button')!
  const closeButton = container.querySelector<HTMLButtonElement>('.change-notes-close')!

  const open = () => {
    overlay.classList.add('change-notes-overlay--open')
  }

  const close = () => {
    overlay.classList.remove('change-notes-overlay--open')
    saveSeenVersion(currentVersion)
  }

  openButton.addEventListener('click', open)
  closeButton.addEventListener('click', close)

  // Clicking the dimmed backdrop (outside the modal) also closes it.
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close()
    }
  })

  if (loadSeenVersion() < currentVersion) {
    open()
  }
}
