# Google Keep Memo Pad

## First Time Install

1. **Clone this repository**:
   ```sh
   git clone https://github.com/samlam369/Google-Keep-Memo-Pad.git
   cd Google-Keep-Memo-Pad
   ```

2. **Install dependencies (this also checks out the pinned fullscreen extension commit)**:
   ```sh
   npm install
   ```

3. **Start the app**:
   ```sh
   npm start
   ```

## Features
- System tray icon for quick access
- Tray menu with checkboxes for:
    - Show Window (toggle window visibility)
    - Always On Top (toggle window always-on-top)
    - Show Title Bar (toggle window title bar visibility)
    - Set Default Note URL (allows specifying a custom Google Keep note URL to open by default)
- Left-click tray icon to show/hide main window
- Main window displays https://keep.google.com/u/0/
- Default window size: 500x300px, resizable
- Draggable window region: A subtle transparent margin at the top allows window repositioning even when the title bar is hidden
- **Manual login required**

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [Git](https://git-scm.com/)

### Installation
```sh
git clone https://github.com/samlam369/Google-Keep-Memo-Pad.git
cd Google-Keep-Memo-Pad
npm install
npm start
```

## Auto-launch at Startup (Windows)

To have Google Keep Memo Pad launch automatically when you log in:

1. Make sure you have [Node.js](https://nodejs.org/) installed.
2. Use the provided `Google-Keep-Memo-Pad.vbs` script in this repo to launch the app silently at startup.
3. Right-click `Google-Keep-Memo-Pad.vbs` and choose **Create shortcut**.
4. Press `Win + R`, type `shell:startup`, and press Enter. This opens your Startup folder.
5. Move the **shortcut** (not the `.vbs` file itself) into the Startup folder.

This ensures the script always runs from your app's folder, so `npm start` works correctly.

To remove auto-launch, simply delete the shortcut from the Startup folder.

## Full Screen Extension Integration

This app integrates a forked version of the [chrome-google-keep-full-screen](https://github.com/chrisputnam9/chrome-google-keep-full-screen) extension by directly sideloading it into the Electron app.

- The extension is loaded from the `chrome-google-keep-full-screen` directory, using our [custom fork](https://github.com/samlam369/chrome-google-keep-full-screen) which contains Electron compatibility modifications.
- The extension implements fullscreen editing, enabled by default, and remembers the saved fullscreen setting.
- The extension also implements a toolbar toggle and keyboard shortcut. These depend on Keep's current DOM and Electron's extension API support; verify them when changing the extension version.
- The extension is a Git submodule. `npm install` initializes it and checks out the exact commit recorded by this app, rather than the latest fork commit.

### Installing the App's Tested Extension Version

Run the following commands from the app repository. Quit the app using **Quit** in the system tray first; closing the memo window only hides it. Commit or stash any work you want to keep before switching branches or versions. For a checkout on the app's `main` branch:

```sh
git pull --ff-only origin main
npm install
```

To restore just the extension to the commit recorded in the app's Git index:

```sh
npm run install-extension
```

Both `npm install` (through its postinstall hook) and `npm run install-extension` use `git submodule update --init --checkout`. This follows the app's **Git index**: normally the committed pointer, or the staged pointer if you have staged a dependency change. A detached HEAD in the extension directory is normal; the dependency is selected by commit, not by its checked-out branch name. Git is required; downloading the app as a ZIP does not include the Git metadata needed for this workflow.

Existing installations with a standalone clone in `chrome-google-keep-full-screen` are supported without deleting or recloning that directory. Installation and upgrade stop if the extension has uncommitted changes, including untracked files; commit or stash those changes first.

### Upgrading the Extension Dependency

This is a maintainer operation, separate from installing the app's tested version. Start with the current app dependencies installed and no pending submodule-pointer changes. Quit the running app before changing the extension version.

```sh
npm run update-extension
git diff --submodule=log -- chrome-google-keep-full-screen
npm start
```

The update command uses `git submodule update --init --checkout --remote`. With this repository's default remote configuration, it fetches the fork's `origin/master`, as configured in `.gitmodules`. Local Git submodule/branch configuration can override the defaults; check the remotes if you have customized them. It does not merge the original author's upstream changes into the fork, or automatically stage or commit the app's new submodule pointer.

Do not run `npm install` or `npm run install-extension` between selecting a candidate and testing it: these commands restore the indexed version. Use `npm start` directly. Follow the validation checklist below. If the update works, quit the app and stage the pointer explicitly:

```sh
git add chrome-google-keep-full-screen
git diff --cached --submodule=log -- chrome-google-keep-full-screen
```

Commit that dependency change separately from unrelated app changes, using the repository's Conventional Commit format. Include the reason for the upgrade and validation results. The referenced extension commit must be available in the fork remote so another machine can install it.

### Rolling Back an Extension Upgrade

Quit the app and preserve any extension edits first. Choose the case that matches your app repository:

- **Candidate not staged:** run `npm run install-extension` to return to the indexed version.
- **Pointer staged but not committed:** restore the index to the app's current commit, then install:

  ```sh
  git restore --source=HEAD --staged -- chrome-google-keep-full-screen
  npm run install-extension
  ```

- **Upgrade already committed:** revert the dedicated dependency-upgrade commit in the app repository, then run `npm run install-extension`. This records the rollback without rewriting shared history. If the commit also contains unrelated work, restore only the submodule pointer from a known-good app commit and commit that rollback separately.

After restoring a version, run `npm start` and check the affected behavior again. Restoring the Git pointer alone does not change the extension files until the installation command runs.

### Bringing Original Upstream Changes into the Fork

This is a separate operation from `npm run update-extension`. Work on a branch in the extension repository, not directly on its detached HEAD. Install the app dependencies before starting, quit the app, and preserve any existing extension work.

From the app directory:

```sh
cd chrome-google-keep-full-screen
git remote -v
```

`origin` should point to your fork. If `upstream` is absent, add it once:

```sh
git remote add upstream https://github.com/chrisputnam9/chrome-google-keep-full-screen.git
```

If `upstream` already exists, verify its URL instead of adding it again. Then fetch both repositories and inspect the changes:

```sh
git fetch origin
git fetch upstream
git log --oneline origin/master..upstream/master
```

If this log is empty, the fork already contains the upstream commits; no merge is needed. Otherwise, choose a new maintenance branch name and merge there:

```sh
git switch -c maintenance/sync-upstream origin/master
git merge --no-commit --no-ff upstream/master
```

Resolve conflicts while retaining the Electron compatibility changes. Check `manifest.json` remains a regular file with the intended permissions, content-script paths and `run_at: "document_idle"`; do not blindly replace it with the upstream manifest. Review changes to the content script, CSS selectors, storage handling and runtime messaging. Stage resolved files by explicit path and complete the merge using the repository's Conventional Commit format before testing.

The app loads this directory directly, so you can test the maintenance branch without changing the app's pinned pointer:

```sh
cd ..
npm start
```

Do not run either installation command during this test, because it switches the extension back to the app's indexed version. Complete the validation below, then commit any further extension fixes on the maintenance branch. Push that branch to the fork and review/merge it into the fork's `master` through the usual process.

Finally, quit the app, run `npm run update-extension` from the app directory, validate the resulting fork commit, and commit the new app pointer using the upgrade procedure above. Keep the maintenance branch until its work has been merged.

### Validating an Extension Candidate

- Check startup with the saved note URL, then close and reopen a note. Confirm the extension loads and fullscreen follows the saved setting.
- Check plain-text notes and checklists. Verify the fullscreen toggle/shortcut if available; record any unavailable controls rather than assuming they work.
- Check light/dark mode, scrolling to the bottom of a long note, and opening toolbar menus.
- At window widths of 200px, 376px, 380px and a wider size, verify the footer stays on one row, Close remains visible and clickable, and clipped icons return when widened. Repeat at your usual page zoom; CSS viewport width and window width differ when zoomed.
- Run `npm test` in the app repository to check the installation/update workflow. These local Git tests do **not** validate Google Keep's live DOM, fullscreen behavior or Electron UI.

Record the extension commit tested and any failures or limitations before accepting the upgrade.

Keep generic fullscreen and Electron extension compatibility fixes in the fork. App-specific behavior, such as the tray, drag region and narrow-window toolbar layout, belongs in the app repository.

The [extension fork README](https://github.com/samlam369/chrome-google-keep-full-screen/blob/master/README.md) describes the compatibility modifications. Treat it as background and compare its examples with the candidate's actual code; Google Keep can change independently of either repository.

## Development
- Main process: `main.js`
- Run `npm test` for extension installation/update integration tests. They use temporary local Git repositories and do not contact GitHub or modify the installed extension.
- No auto-update or analytics in initial release

## License
MIT

---

See [PRD.md](./PRD.md) for full requirements.

> **Disclaimer:** This is a third-party project and is not affiliated with, endorsed by, or associated with Google LLC. All Google Keep trademarks and copyrights are property of Google.

## Credits

Systray icon is from [Boxicons](https://boxicons.com/), used under the [MIT License](https://github.com/atisawd/boxicons/blob/master/LICENSE).
