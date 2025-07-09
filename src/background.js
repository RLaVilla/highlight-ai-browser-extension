/* global chrome */
import { abortCurrentRequest, askGPT } from "./gptController.js";

import { analytics } from "./firebase.js";

analytics
  .init()
  .then(() => {
    console.log("Firebase connected successfully!");
  })
  .catch((error) => {
    console.error("Firebase connection failed:", error);
  });

chrome.runtime.onInstalled.addListener(() => {
  console.log("AI Sidebar Extension Installed");
  // Auto-refresh content scripts on install/update
  refreshAllContentScripts();
});

async function refreshAllContentScripts() {
  try {
    const tabs = await chrome.tabs.query({});

    for (const tab of tabs) {
      // Skip special pages that can't run content scripts
      if (
        tab.url.startsWith("chrome://") ||
        tab.url.startsWith("chrome-extension://") ||
        tab.url.startsWith("edge://") ||
        tab.url.startsWith("about:") ||
        tab.url.startsWith("moz-extension://")
      ) {
        continue;
      }

      try {
        // Inject the content script into existing tabs
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["assets/content.js"],
        });
        console.log(`Refreshed content script for tab: ${tab.url}`);
      } catch (error) {
        // Some tabs can't be injected (permissions, etc.) - that's okay
        console.log(`Couldn't refresh tab ${tab.id}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error("Error refreshing content scripts:", error);
  }
}

chrome.runtime.onStartup.addListener(() => {
  console.log("Extension starting up - refreshing content scripts");
  refreshAllContentScripts();
});

let panelWindowId = null;

function setPanelOpenState(isOpen) {
  chrome.storage.local.set({ panelOpen: isOpen });
}

chrome.action.onClicked.addListener(() => {
  if (panelWindowId !== null) {
    chrome.windows.remove(panelWindowId, () => {
      panelWindowId = null;
      setPanelOpenState(false);
    });
    return;
  }

  chrome.storage.local.set({
    image: null,
    selectedText: "",
    aiResponse: "",
  });

  chrome.windows.getCurrent((currentWindow) => {
    const sidebarWidth = 400;

    chrome.windows.create(
      {
        url: chrome.runtime.getURL("src/sidebar.html"),
        type: "panel",
        width: sidebarWidth,
        height: currentWindow.height,
        left: currentWindow.left + currentWindow.width - sidebarWidth, // Right edge
        top: currentWindow.top,
        focused: true,
      },
      (newWindow) => {
        panelWindowId = newWindow.id;
        setPanelOpenState(true);
      }
    );
  });
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === panelWindowId) {
    panelWindowId = null;
    setPanelOpenState(false);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "focusExtension" && panelWindowId) {
    chrome.windows.update(panelWindowId, { focused: true });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "abortGPTRequest") {
    console.log("Received abort request from popup");
    abortCurrentRequest(message.reason);

    if (message.reason === "modeSwitch") {
      chrome.storage.local.set({ isLoading: false });
    }

    return true;
  }
});

chrome.runtime.onMessage.addListener(async (message, sender) => {
  console.log("Message received:", message);

  if (message.action === "askGPT") {
    const userQuery = message.text;
    const image = message.payload?.image;

    chrome.storage.local.set({ isLoading: true });
    chrome.storage.local.set({ selectedText: userQuery });
    chrome.storage.local.set({ image: image });

    try {
      const limitCheck = await analytics.checkDailyLimit();

      if (!limitCheck.canAsk) {
        console.log("Daily limit reached");
        chrome.storage.local.set({
          aiResponse: {
            shortAnswer: "Daily limit reached!",
            explanation: `You've used all ${limitCheck.total} free questions today. Upgrade for unlimited access!`,
          },
          isLoading: false,
          showUpgradePrompt: true,
        });
        return true;
      }

      const method = image ? "image_drop" : "text_highlight";
      const source = "AI";
      const website = sender?.tab?.url
        ? new URL(sender.tab.url).hostname
        : "unknown";

      console.log(`Tracking question: ${method} on ${website}`);

      // Run API call and tracking in parallel
      const payload = image || userQuery;
      const [response] = await Promise.all([
        askGPT(payload),
        analytics
          .trackQuestion(source, method, website, userQuery || "image")
          .catch((err) => {
            console.error("Tracking error:", err);
            return null;
          }),
      ]);

      console.log("Response from GPT:", response);

      if (response && response.shortAnswer && response.explanation) {
        chrome.storage.local.set(
          {
            aiResponse: {
              shortAnswer: response.shortAnswer,
              explanation: response.explanation,
            },
            isLoading: false,
            showUpgradePrompt: false,
          },
          () => {
            console.log("Response stored:", response);
          }
        );

        // Fire-and-forget success tracking
        analytics
          .trackEvent("question_answered", {
            source,
            method,
            website,
            success: true,
            responseLength: response.explanation.length,
          })
          .catch((err) => console.error("Event tracking error:", err));
      }
    } catch (error) {
      console.error("Error in askGPT flow:", error);

      if (error.message.includes("Daily limit reached")) {
        chrome.storage.local.set({
          aiResponse: {
            shortAnswer: "Daily limit reached!",
            explanation: error.message,
          },
          isLoading: false,
          showUpgradePrompt: true,
        });
      } else {
        chrome.storage.local.set(
          {
            aiResponse: {
              shortAnswer: "Error: Unable to get a response",
              explanation: "An error occurred while processing your request",
            },
            isLoading: false,
          },
          () => {
            console.log("Error message stored");
          }
        );
      }
    }

    return true; // ✅ Here it is!
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "captureVisibleTab") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      sendResponse(dataUrl);
    });
    return true;
  }
});

let searchTabId = null;

chrome.runtime.onMessage.addListener(async (message, sendResponse) => {
  if (message.action === "searchInTab") {
    const { url } = message;

    let source = null;
    if (url.includes("google.com")) source = "Google";
    else if (url.includes("chegg.com")) source = "Chegg";
    else if (url.includes("quizlet.com")) source = "Quizlet";

    if (source) {
      try {
        await analytics.updateSearchCounter(source);
        console.log(`${source} search count updated`);
      } catch (error) {
        console.error("Error updating search counter:", error);
      }
    }

    if (searchTabId !== null) {
      chrome.tabs.update(searchTabId, { url, active: true }, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          chrome.tabs.create({ url, active: true }, (newTab) => {
            searchTabId = newTab.id;
          });
        }
      });
    } else {
      chrome.tabs.create({ url, active: true }, (tab) => {
        searchTabId = tab.id;
      });
    }

    sendResponse({ status: "done" });
  }
});
