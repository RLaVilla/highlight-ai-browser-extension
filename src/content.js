/* global chrome */

let isInitialized = false;
let isImageModeActive = false;
let isDragging = false;
let startX, startY, endX, endY;
let selectionBox;
let dragTimeout;
let lastCaptureTime = 0;
const CAPTURE_COOLDOWN = 2000;

// Initialize the content script
function initializeContentScript() {
  if (isInitialized) return;

  console.log("content script loaded");

  // Add mouseup listener for text selection
  document.addEventListener("mouseup", handleMouseUp);

  // Check initial user mode
  chrome.storage.local.get("userMode", ({ userMode }) => {
    if (userMode === "image") {
      enableImageMode();
    }
  });

  // Listen for runtime messages
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  // Listen for storage changes
  chrome.storage.onChanged.addListener(handleStorageChange);

  isInitialized = true;
}

// Clean up when extension is disabled
function cleanupContentScript() {
  if (!isInitialized) return;

  disableImageMode();

  document.removeEventListener("mouseup", handleMouseUp);
  chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
  chrome.storage.onChanged.removeListener(handleStorageChange);

  isInitialized = false;
  console.log("content script cleaned up");
}

// Handle mouseup events
function handleMouseUp(e) {
  const target = e.target;
  const tagName = target.tagName.toLowerCase();

  if (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.contentEditable === "true" ||
    target.isContentEditable || // This catches inherited contenteditable
    target.closest('[contenteditable="true"]') ||
    target.closest("input, textarea, select") ||
    target.closest('[role="searchbox"]') || // ARIA search boxes
    target.closest('[role="textbox"]') || // ARIA text inputs
    target.closest('[role="combobox"]') || // Dropdown searches
    target.closest(".search-bar, .search-input, .search-box") // Common classes
  ) {
    return;
  }

  const selectedText = window.getSelection().toString().trim();
  if (!selectedText || selectedText.length < 10) return;

  if (selectedText.length > 1000) {
    console.log("Selection too long, might be accidental");
    return;
  }

  chrome.storage.local.set({ selectedText });

  chrome.storage.local.get(["autoSearch", "selectedLocation"], (result) => {
    const autoSearch = result.autoSearch ?? true;
    const location = result.selectedLocation || "AI";

    if (!autoSearch) return;

    if (location === "AI") {
      chrome.runtime.sendMessage(
        { action: "askGPT", text: selectedText },
        (response) => {
          if (response) {
            chrome.storage.local.set({ aiResponse: response.answer }, () => {
              console.log("Response saved to chrome storage.");
            });
          }
        }
      );
    } else {
      handleExternalSearch(location, selectedText);
    }
  });
  window.getSelection().removeAllRanges();
}

// Handle external search
function handleExternalSearch(location, selectedText) {
  let baseUrl, suffix;

  switch (location) {
    case "Google":
      baseUrl = "https://www.google.com/search?q=";
      break;
    case "Quizlet":
      baseUrl = "https://quizlet.com/search?query=";
      suffix = "&type=questions&useOriginal=";
      break;
    case "Chegg":
      baseUrl = "https://www.chegg.com/search?q=";
      suffix = "&contentType=study";
      break;
    default:
      return;
  }

  const query = encodeURIComponent(selectedText);
  const fullUrl = `${baseUrl}${query}${suffix || ""}`;
  chrome.runtime.sendMessage({
    action: "searchInTab",
    url: fullUrl,
    active: true,
  });
}

// Enable image mode
function enableImageMode() {
  if (isImageModeActive) return;

  isImageModeActive = true;
  window.addEventListener("mousedown", startDrag);
  window.addEventListener("mousemove", onDrag);
  window.addEventListener("mouseup", endDrag);

  window.addEventListener("contextmenu", preventContextMenu);

  document.addEventListener("selectstart", preventSelection, true);
  document.addEventListener("mousedown", preventTextSelection, true);

  window.addEventListener("blur", cleanupDrag);
  document.addEventListener("visibilitychange", cleanupDrag);

  // Add CSS override for all elements
  const style = document.createElement("style");
  style.id = "image-capture-override";
  style.textContent = `
    * {
      user-select: none !important;
      -webkit-user-select: none !important;
      -moz-user-select: none !important;
      -ms-user-select: none !important;
      -webkit-user-drag: none !important;
    }
    body {
      cursor: crosshair !important;
    }
  `;
  document.head.appendChild(style);
}

// Disable image mode
function disableImageMode() {
  if (!isImageModeActive) return;

  isImageModeActive = false;
  window.removeEventListener("mousedown", startDrag);
  window.removeEventListener("mousemove", onDrag);
  window.removeEventListener("mouseup", endDrag);

  window.removeEventListener("contextmenu", preventContextMenu);
  window.removeEventListener("blur", cleanupDrag);
  document.removeEventListener("visibilitychange", cleanupDrag);

  document.removeEventListener("selectstart", preventSelection, true);
  document.removeEventListener("mousedown", preventTextSelection, true);

  cleanupDrag();

  // Remove CSS override
  const style = document.getElementById("image-capture-override");
  if (style) style.remove();

  // Clean up any ongoing drag
  if (isDragging) {
    clearTimeout(dragTimeout);
    isDragging = false;
    if (selectionBox && selectionBox.parentNode) {
      document.body.removeChild(selectionBox);
    }
  }
}

function preventContextMenu(e) {
  if (isImageModeActive) {
    e.preventDefault();
    cleanupDrag(); // Clean up any ongoing drag
    return false;
  }
}

// Clean up function for stuck selections
function cleanupDrag() {
  if (isDragging) {
    clearTimeout(dragTimeout);
    isDragging = false;
    if (selectionBox && selectionBox.parentNode) {
      document.body.removeChild(selectionBox);
      selectionBox = null;
    }
  }
}

function preventSelection(e) {
  if (isImageModeActive) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }
}

function preventTextSelection(e) {
  if (isImageModeActive && e.detail > 1) {
    // Prevent double-click selection
    e.preventDefault();
    return false;
  }
}

// Image mode drag functions
function startDrag(e) {
  if (!isImageModeActive) return;

  if (e.button !== 0) {
    cleanupDrag();
    return;
  }

  e.preventDefault();

  dragTimeout = setTimeout(() => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    selectionBox = document.createElement("div");
    selectionBox.style.position = "fixed";
    selectionBox.style.border = "2px dashed rgb(147, 51, 234)";
    selectionBox.style.background = "rgba(147, 51, 234, 0.1)";
    selectionBox.style.zIndex = "999999";
    selectionBox.style.pointerEvents = "none";
    document.body.appendChild(selectionBox);
  }, 50);
}

function onDrag(e) {
  if (!isDragging || !selectionBox) return;

  endX = e.clientX;
  endY = e.clientY;

  const rect = {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    width: Math.abs(startX - endX),
    height: Math.abs(startY - endY),
  };

  Object.assign(selectionBox.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

function endDrag() {
  clearTimeout(dragTimeout);
  if (!isDragging) return;
  isDragging = false;

  const captureRect = selectionBox.getBoundingClientRect();

  const minSize = 10;
  if (captureRect.width < minSize || captureRect.height < minSize) {
    document.body.removeChild(selectionBox);
    return;
  }

  selectionBox.style.display = "none";

  setTimeout(() => {
    captureScreenArea(captureRect);

    if (selectionBox && selectionBox.parentNode) {
      document.body.removeChild(selectionBox);
    }
  }, 50);
}

function captureScreenArea(rect) {
  const now = Date.now();
  if (now - lastCaptureTime < CAPTURE_COOLDOWN) {
    console.log("Capture prevented due to cooldown.");
    return;
  }

  lastCaptureTime = now;

  chrome.runtime.sendMessage({ action: "captureVisibleTab" }, (dataUrl) => {
    if (dataUrl) {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = rect.width;
        canvas.height = rect.height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(
          img,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          0,
          0,
          rect.width,
          rect.height
        );

        const croppedDataUrl = canvas.toDataURL("image/png");

        chrome.runtime.sendMessage({
          action: "askGPT",
          payload: {
            image: croppedDataUrl,
          },
        });
      };
      img.src = dataUrl;
    }
  });
}

// Handle runtime messages
function handleRuntimeMessage(message) {
  if (message.action === "enableImageMode") {
    enableImageMode();
  } else if (message.action === "disableImageMode") {
    disableImageMode();
  }
}

// Handle storage changes
function handleStorageChange(changes, area) {
  if (area === "local") {
    // Handle panel open/close
    if (changes.panelOpen) {
      if (changes.panelOpen.newValue) {
        initializeContentScript();
      } else {
        disableImageMode();
        cleanupContentScript();
      }
    }

    // Handle user mode changes
    if (changes.userMode) {
      const newMode = changes.userMode.newValue;
      if (newMode === "image") {
        enableImageMode();
      } else {
        disableImageMode();
      }
    }
  }
}

// Initial check and setup - check immediately when script loads
chrome.storage.local.get(["panelOpen"], (result) => {
  if (result.panelOpen) {
    initializeContentScript();
  }
});

// Also listen for when popup actually opens (immediate initialization)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.panelOpen) {
    if (changes.panelOpen.newValue) {
      initializeContentScript();
    } else {
      cleanupContentScript();
    }
  }
});

// Listen for other storage changes
chrome.storage.onChanged.addListener(handleStorageChange);

// Listen for messages from popup when it opens
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "popupOpened") {
    initializeContentScript();
  } else if (message.action === "popupClosed") {
    disableImageMode();
    cleanupContentScript();
  }
});
