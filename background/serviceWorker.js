let lastActiveTabId = null;
let lastCapturedImage = null;
let lastActiveTabUrl = null;
let lastActiveTabTitle = null;

chrome.action.onClicked.addListener(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const url = tab?.url || "";
  const isExtensionPage = /^chrome-extension:\/\//i.test(url);

  // Only update the "source tab" when it's not the extension's own page.
  // This prevents overwriting it with the extension popup window/tab.
  if (tab?.id && !isExtensionPage) {
    lastActiveTabId = tab.id;
    lastActiveTabUrl = url;
    lastActiveTabTitle = tab?.title || null;
  }

  // Capture the visible tab as an image (best effort).
  try {
    const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
    });
    lastCapturedImage = imageDataUrl || null;
  } catch {
    lastCapturedImage = null;
  }

  chrome.windows.create({
    url: "popup/popup.html",
    type: "popup",
    // width: 1000,
    // height: 800,
    state: "maximized",
    focused: true,
  });
});

// Allow popup to ask for the original tab
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_LAST_TAB") {
    (async () => {
      if (!lastActiveTabId) {
        sendResponse({ tabId: null, url: null, title: null });
        return;
      }
      try {
        sendResponse({
          tabId: lastActiveTabId,
          url: lastActiveTabUrl || null,
          title: lastActiveTabTitle || null,
        });
      } catch {
        sendResponse({ tabId: lastActiveTabId, url: null, title: null });
      }
    })();
    return true;
  }

  if (msg.type === "GET_CAPTURED_IMAGE") {
    sendResponse({ image: lastCapturedImage });
  }
});
