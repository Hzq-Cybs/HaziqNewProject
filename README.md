# Cadence — Daily project tasks

Calm, premium, local-first task manager. Powerful without visual clutter.

## Run

No build step. Open `index.html` directly, or serve it:

```bash
cd Todolist-Prj
python3 -m http.server 5173
# → http://localhost:5173
```

## Features

- **Views:** Today · Next 7 days · All · Done + per-project
- **Smart composer:** `Review deck tomorrow p1 #Website` parses due date, priority, project, estimate (`25m`, `1h`)
- **Tasks:** notes, due dates, P1–P4, estimates, subtasks with progress, manual drag-reorder, duplicate, undo-delete
- **Focus strip:** pin one task + 25-min timer with top progress hairline
- **Command palette:** `⌘K` / `/` — jump to tasks, run commands
- **Filters:** text search, priority filter, hide-done, sort by manual / due / priority
- **Day progress + streak** in the sidebar, computed from local history
- **Drawer details:** full edit without leaving context
- **Local-first:** `localStorage` persistence, JSON export / import, demo reset
- **Theme:** light / dark (auto-detects OS), `T` to toggle
- **Responsive:** off-canvas sidebar on mobile, stacked focus controls

## Shortcuts

| Key | Action |
|-----|--------|
| `N` | New task |
| `/` or `⌘K` | Command palette |
| `T` | Toggle theme |
| `1 / 2 / 3` | Today / Next 7 / All |
| `Esc` | Close palette → drawer → menu |
| `↵` in composer | Add task |

## Design notes

- One accent colour (persimmon), warm paper background, ink text
- Fraunces for display, Inter for UI, JetBrains Mono for kbd
- Lists use hairline dividers — only composer / focus / drawer are elevated surfaces
- 160–250ms micro-interactions, `prefers-reduced-motion` respected
