# Canvas

**A focused, infinite whiteboard for ideas, diagrams, notes and visual thinking.**

Canvas is a Windows desktop whiteboard built with Electron and a lightweight canvas editor. It is designed to feel fast, stay out of the way, and keep your boards available locally.

## Features

- Infinite canvas with pan and zoom
- Freehand drawing, highlighter, eraser and laser pointer
- Shapes, arrows, lines, text and sticky notes
- Independent shape fill and border colours, including custom colours
- Opacity, line styles and adjustable stroke sizes
- Multiple boards with create, rename, duplicate and delete actions
- Automatic local saving and light/dark themes
- Windows desktop packaging

## Run locally

Requirements: Node.js 22+ and npm.

```bash
npm install
npm run dev --workspace=quickdraw-app
```

## Run the desktop app

```bash
npm run desktop --workspace=quickdraw-app
```

## Build the Windows installer

```bash
npm run dist:win --workspace=quickdraw-app
```

The installer is generated in `apps/app/release/`.

## Data and privacy

Boards are stored locally in the desktop app's Electron profile. There is currently no cloud sync; back up your boards before reinstalling Windows or clearing application data.

## License

Canvas includes MIT-licensed open-source components. See [LICENSE](LICENSE) for the applicable license and copyright notices.
