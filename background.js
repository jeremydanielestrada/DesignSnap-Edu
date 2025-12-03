let lastActiveTabId = null;
let lastCapturedImage = null;

chrome.action.onClicked.addListener(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Capture the visible tab as an image
  const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });
  lastActiveTabId = tab.id; // remember this
  lastCapturedImage = imageDataUrl;

  chrome.windows.create({
    url: "popup.html",
    type: "popup",
    width: 1000,
    height: 800,
    focused: true,
  });
});

// Allow popup to ask for the original tab
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_LAST_TAB") {
    sendResponse({ tabId: lastActiveTabId });
  }

  if (msg.type === "GET_CAPTURED_IMAGE") {
    sendResponse({ image: lastCapturedImage });
  }
});
