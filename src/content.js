/* global chrome */

console.log("Content script loaded");

try {
  chrome.runtime.sendMessage({
    action: "test",
    text: "Hello from content script",
  });
  console.log("Message sent successfully");
} catch (e) {
  console.error("Failed to send message:", e);
}

document.addEventListener("mouseup", () => {
  const selectedText = window.getSelection().toString().trim();
  console.log(selectedText);
  if (selectedText) {
    {
      chrome.runtime.sendMessage({
        type: "highlight",
        text: selectedText,
      });
    }
  }
});
