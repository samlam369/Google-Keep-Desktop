const { contextBridge, ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  // Push content down
  const bodyStyle = document.createElement('style');
  bodyStyle.textContent = `
    body {
      margin-top: 32px !important;
    }

    /* Keep the note footer on one line. Keep renamed yePe5c to nK2kYb;
       do not depend on the extension's fullscreen class for this layout. */
    :is(.IZ65Hb-nK2kYb, .IZ65Hb-yePe5c):has(> [role="toolbar"]) {
      flex-wrap: nowrap !important;
    }

    /* The Close button precedes the icons in Keep's reversed flex row. */
    :is(.IZ65Hb-nK2kYb, .IZ65Hb-yePe5c):has(> [role="toolbar"]) > [role="button"] {
      flex: 0 0 auto !important;
      white-space: nowrap !important;
    }

    /* Reserve Close's width, clipping icons only when space runs out. */
    :is(.IZ65Hb-nK2kYb, .IZ65Hb-yePe5c) > [role="toolbar"] {
      min-width: 0 !important;
      overflow: hidden !important;
      flex-wrap: nowrap !important;
    }

    :is(.IZ65Hb-nK2kYb, .IZ65Hb-yePe5c) > [role="toolbar"] > [role="button"] {
      flex-shrink: 0 !important;
    }
  `;
  document.head.appendChild(bodyStyle);


  // Create the drag region (always present, fully transparent)
  const dragRegion = document.createElement('div');
  Object.assign(dragRegion.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    height: '32px',
    webkitAppRegion: 'drag',
    zIndex: '2147483647',
    pointerEvents: 'auto', // Changed to auto to detect mouse events
  });


  // Create the visual indicator (shows on hover)
  const visualIndicator = document.createElement('div');
  // Add styles for the visual indicator
  const indicatorStyle = document.createElement('style');
  indicatorStyle.textContent = `
    .drag-indicator {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 32px;
      background-color: rgba(0, 0, 0, 0.5);
      opacity: 0;
      z-index: 2147483646;
      pointer-events: none;
    }
    .drag-indicator.fade-out {
      transition: opacity 200ms ease-out 100ms;
    }
  `;
  document.head.appendChild(indicatorStyle);

  Object.assign(visualIndicator, {
    className: 'drag-indicator'
  });

  // --- Global mouse tracking logic (from preload.mockfix.js) ---
  let trackingTimeoutId = null;
  let isInDragRegion = false;
  let windowBounds = null;
  let isWindowFocused = document.hasFocus();
  const TRACKING_INTERVAL = 100; // Mouse position check interval

  // Helper to update window bounds (for multi-display/resize support)
  const updateWindowBounds = async () => {
    windowBounds = await ipcRenderer.invoke('get-window-bounds');
  };

  // Check if mouse is in drag region
  const checkMouseInDragRegion = async (x, y) => {
    if (!windowBounds) return false;
    const withinX = x >= windowBounds.x && x <= windowBounds.x + windowBounds.width;
    const withinY = y >= windowBounds.y && y <= windowBounds.y + 32; // 32px drag region
    return withinX && withinY;
  };

  const startTracking = () => {
    const track = async () => {
      try {
        const globalPos = await ipcRenderer.invoke('get-cursor-position');
        const inRegion = await checkMouseInDragRegion(globalPos.x, globalPos.y);
        isInDragRegion = inRegion;
        if (inRegion) {
          visualIndicator.classList.remove('fade-out');
          visualIndicator.style.opacity = '1';
        } else {
          visualIndicator.classList.add('fade-out');
          visualIndicator.style.opacity = '0';
        }
      } catch (error) {
        // Ignore errors, keep tracking
      }
      trackingTimeoutId = setTimeout(track, TRACKING_INTERVAL);
    };
    if (!trackingTimeoutId) track();
  };

  const stopTracking = () => {
    if (trackingTimeoutId) {
      clearTimeout(trackingTimeoutId);
      trackingTimeoutId = null;
    }
  };


  // Keep windowBounds up-to-date after move/resize
  ipcRenderer.on('window-moved-or-resized', () => {
    updateWindowBounds();
    // Only start tracking if window is focused
    if (isWindowFocused) {
      startTracking();
    }
  });

  // Event listeners to control tracking
  window.addEventListener('mouseenter', () => {
    updateWindowBounds();
    startTracking();
  });

  window.addEventListener('mouseleave', () => {
    stopTracking();
    isInDragRegion = false;
    visualIndicator.style.opacity = '0';
  });

  window.addEventListener('focus', () => {
    isWindowFocused = true;
    updateWindowBounds();
    startTracking();
  });

  window.addEventListener('blur', () => {
    isWindowFocused = false;
    stopTracking();
    isInDragRegion = false;
    visualIndicator.style.opacity = '0';
  });

  // Insert elements when body is ready
  const insertElements = () => {
    if (document.body) {
      document.body.insertBefore(visualIndicator, document.body.firstChild);
      document.body.insertBefore(dragRegion, document.body.firstChild);
      return true;
    }
    return false;
  };

  // Try to insert immediately or wait for body
  if (!insertElements()) {
    const observer = new MutationObserver(() => {
      if (insertElements()) {
        observer.disconnect();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
});
