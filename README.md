# Game Night

Skyjo and Family Feud for a group of friends. Everyone plays on their own phone, live, and every finished game is saved to a shared leaderboard.

- Static site (no build step), hosted on GitHub Pages
- Firebase Firestore for live tables and history, Firebase anonymous sign-in
- Installable to the home screen (web app manifest + service worker)

## How it works

- **Invite code.** On first open, each person enters their name and the group's invite code. The code is checked by the Firestore rules, so people without it can't read or write anything.
- **Tables.** Anyone starts a table, gets a 4-letter code, and friends join from *Live tables* or by typing the code. The host picks settings and starts.
- **Moves** run as Firestore transactions, so two phones can't overwrite each other.
- **History.** When a game ends, a record is written to `games/` (create-only). The leaderboard groups by player name.
- **Away players.** After 90 seconds without a move, anyone at the table can play that person's turn for them (Skyjo) or give them a strike (Feud).

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `app.css` | App shell and styles |
| `js/main.js` | Screens: join, home, tables, lobby, results, leaderboard |
| `js/backend.js` | Firestore data layer |
| `js/config.js` | Firebase web config (public by design) |
| `js/games/skyjo.js` | Skyjo rules and board, 2–8 players |
| `js/games/feud.js`, `feud-data.js` | Family Feud rules, board and 107 survey questions |
| `vendor/firebase.js` | Firebase SDK bundled with esbuild (firebase@12) |
| `firestore.rules` | Security rules template (put your real invite code in the console only) |

## Adding a game

Add a module in `js/games/` that exports `meta`, `defaultSettings`, `settingsHtml`, `applySetting`, `init`, `view`, `actionFor`, `results`, `onChange`, and optionally `idlePlayer`, `skip`, `IDLE_MS`. Register it in `GAMES` in `js/main.js`. Game state is stored as a JSON string, so any shape works.
