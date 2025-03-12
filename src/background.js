/* global chrome */

chrome.runtime.onInstalled.addListener(() => {
  console.log("AI Sidebar Extension Installed");
});

chrome.action.onClicked.addListener(() => {
  chrome.windows.getCurrent(function (currentWindow) {
    chrome.windows.create({
      url: chrome.runtime.getURL("src/sidebar.html"),
      type: "panel",
      width: 400,
      height: currentWindow.height,
      focused: true,
      top: 0,
      left: currentWindow.left + currentWindow.width - 416,
    });
  });
});

let selectedText = "";

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "highlight") {
    selectedText = message.text;

    console.log("Saving text: ", selectedText);
    chrome.storage.local.set({ selectedText: selectedText });
  }
});
