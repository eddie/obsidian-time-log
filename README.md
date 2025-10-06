# Timelog

Timelog is an Obsidian plugin designed for lab-style note taking. I keep a single markdown document per project (for example `My Project Log`), add a dated heading for each work session, and capture new thoughts as bullet points under that heading. Timelog removes the busywork of stamping times and jumping between sections so you can stay focused on the work itself.

The plugin uses your Daily Note settings (if enabled) to match your preferred date format; otherwise it falls back to ISO `YYYY-MM-DD`.

## Core workflow

- Create or open your running project log note.
- Add a heading for the current day (use the **Start Log Entry** command to insert `## [[YYYY-MM-DD]]`).
- Capture entries as list items; Timelog can automatically prefix them with the current time.
- Jump back to the latest dated section at any time with **Jump to Latest Log Header**.

Example snippet:

```markdown
## [[2024-05-11]] – Undocumented REST API

- **08:45**: Collected notes from the old Confluence page; spotted a missing auth header.
- **09:30**: Sent a `GET /customers/123` request with `X-Legacy-Token`; saved the 401 response.
    - **09:42**: Retried with `Authorization: Legacy token=...`; success, captured JSON body.
- **13:05**: Listed follow-up tests to map the remaining verbs.
```

## Features

- **Time logging helper** – Automatically inserts a bold time prefix (default `HH:mm`) at the cursor while you type bullet points.
- **Start-of-day shortcut** – One command drops a new dated heading that matches your daily note format (falls back to ISO `YYYY-MM-DD`).
- **Latest section navigator** – Instantly scrolls to the newest dated heading and positions the cursor on the line below it.
- **Context-aware status bar** – Shows “Logging active …s” only when the current note contains a dated heading, and reflects your configured interval.

## Commands

| Command | Description |
| --- | --- |
| **Start Log Entry** | Inserts a new dated level-2 heading (`## [[YYYY-MM-DD]]`) and places the cursor beneath it. |
| **Jump to Latest Log Header** | Scrolls to the newest dated heading, ensures there is writing space, and focuses the cursor just below the heading. |

Assign hotkeys to these commands in Obsidian’s settings for quick access.

## Settings

Open **Settings → Community Plugins → Timelog** to configure:

- **Minimum Log Duration** – Seconds between automatic timestamp insertions (prevents duplicate prefixes when you stay on one bullet).
- **Log Format** – Moment.js format string for the timestamp prefix (defaults to `HH:mm`).
- **Use Lists Only** – Require log entries to be list items before adding timestamps (ideal for bullet-driven logs).

Changes update the status bar immediately so you always see the current interval.

## Installation

1. Clone or download this repository.
2. Copy `main.js`, `manifest.json`, and `styles.css` into your vault at `Vault/.obsidian/plugins/obsidian-time-log/`.
3. Reload Obsidian and enable **Timelog** from the Community Plugins panel.

## Development

```bash
npm install
npm run dev
```

The dev script recompiles `main.ts` to `main.js` whenever you save. Symlink the project into your vault for hot reloading if you use a development plugin that supports it.

Example (adjust paths to your vault):

```bash
ln -s ~/src/obsidian-time-log ~/Documents/Obsidian/.obsidian/plugins/obsidian-time-log
```

## License

MIT
