let lastActiveTabId = null;

chrome.action.onClicked.addListener(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  lastActiveTabId = tab.id; // remember this

  chrome.windows.create({
    url: "popup.html",
    type: "popup",
    width: 1000,
    height: 800,
  });
});

// Allow popup to ask for the original tab
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_LAST_TAB") {
    sendResponse({ tabId: lastActiveTabId });
  }
});
