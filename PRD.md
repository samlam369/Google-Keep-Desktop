# Product Requirements Document (PRD)

## Project: Google Keep Memo Pad

### Overview
Google Keep Memo Pad is an Electron desktop application that delivers access to Google Keep via a system tray icon. It features a narrow, resizable window, Always on Top functionality, Windows System Tray integration, and a full page note capability to mimick a memo pad while leveraging Google Keep's cloud synchronization and cross-platform support.

---

## 1. Goals
- Provide a lightweight, always-available desktop wrapper for Google Keep.
- Enable quick access via a system tray icon.
- Allow users to resize the window for better usability.

---

## 2. Features & Requirements

### 2.1 System Tray Integration
- The app displays an icon in the system tray when running.
- **Left-click** on the tray icon toggles (shows/hides) the main window.
- **Right-click** on the tray icon opens a context menu with:
    - "Show Window" (checkbox, toggles window visibility)
    - "Always On Top" (checkbox, toggles window always-on-top)
    - "Show Title Bar" (checkbox, toggles window title bar visibility)
    - "Set Default Note URL" (allows user to specify a custom Google Keep URL to load by default)
    - "Quit" to close the app

### 2.2 Main Window
- **Default Size:** 500 x 300 pixels (height x width)
- **Resizable:** User can freely resize the window by dragging its edges/corners.
- **Content:** Displays the live content of https://keep.google.com/u/0/ in a webview/browser window. User can set a custom default URL (e.g., a specific note) via the tray menu.
- **Authentication:** User logs into Google Keep manually in the app window. Enlarging the window is supported for easier login.
- **Always On Top:** User can toggle this feature from the tray menu.
- **Draggable Region:** A 16px high transparent margin at the top of the window enables window repositioning even when the title bar is hidden. The region provides visual feedback on hover with a subtle background color change.

### 2.3 Platform Support
- **Primary:** Windows
- **Future:** Leave code structure open for cross-platform support (macOS, Linux)

### 2.4 Distribution & Setup
- Distributed via GitHub. Users can clone the repo and run `npm start` to launch the app.
- No installer or packaged distribution initially.
- **Auto-launch:** Users can use the provided `Google-Keep-Memo-Pad.vbs` script and add it to their Windows Startup folder for auto-launch functionality (see README for instructions).

### 2.5 Additional Notes
- No analytics, privacy, or data storage requirements at this stage.
- No auto-update or advanced accessibility features planned for initial release.

### 2.6 Full Screen Extension Integration
- The Electron app sideloads a fork of the [chrome-google-keep-full-screen](https://github.com/chrisputnam9/chrome-google-keep-full-screen) Chrome extension directly into the app.
- This provides full-screen editing capabilities for Google Keep notes, automatically expanding notes when opened.
- A full-screen toggle button appears in the note toolbar, allowing users to exit full-screen mode if desired.
- The extension is loaded natively using Electron's session API, allowing for seamless integration of the extension with customizations to ensure compatibility.
- The integration leverages Electron's built-in Chrome extension compatibility capabilities with additional error handling to ensure proper functionality.

### 2.7 Extension Management
- The app tracks [samlam369/chrome-google-keep-full-screen](https://github.com/samlam369/chrome-google-keep-full-screen) as a Git submodule, pinning a tested extension commit.
- `install-extension.js` runs during `npm install` and initializes/checks out the pinned commit. It also supports existing nested clones and refuses to switch versions when the extension has uncommitted changes.
- Maintainers use `npm run update-extension` to check out the fork's latest `master`, test it, and commit the new submodule pointer in the app. Original upstream changes are reviewed and merged into the fork separately.
- The fork contains necessary modifications for Electron compatibility while maintaining core functionality, with detailed documentation in `README.md`.
- Using our own fork allows us to maintain compatibility patches while still being able to incorporate upstream improvements when needed.

---

## 3. Future Improvements (Not in Initial Scope)
- Cross-platform support (macOS, Linux)
- Auto-update mechanism
- Customizable shortcuts
- Notifications integration
- Advanced accessibility features

---

## 4. Open Questions / Implementation Considerations
- If any privacy or technical requirements arise during implementation (e.g., handling cookies, user data, or permissions), they should be documented and addressed as needed.

---

## 5. Appendix
- **Last updated:** 2025-05-23
