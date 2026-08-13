// Background Service Worker for ReMark Chrome Extension

// Open side panel on action icon click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Initialize context menus on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "remark_highlight",
      title: "划线高亮并保存 (ReMark)",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: "remark_open_sidepanel",
      title: "打开划词灵感侧边栏",
      contexts: ["all"]
    });
  });
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "remark_highlight" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: "CONTEXT_HIGHLIGHT",
      text: info.selectionText
    });
  } else if (info.menuItemId === "remark_open_sidepanel" && tab?.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

// Handle messages from content script or sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "OPEN_SIDE_PANEL") {
    if (sender.tab?.windowId) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).then(() => {
        setTimeout(() => chrome.runtime.sendMessage({ action: 'FOCUS_CLIP', clipId: message.clipId, markId: message.markId }), 180);
      });
      sendResponse({ success: true });
    }
  }
  return true;
});
