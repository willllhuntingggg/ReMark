importScripts('lib/i18n.js');

const SETTINGS_KEY = 'markit_settings';

function refreshNativeUi() {
  chrome.action.setTitle({ title: ReMarkI18n.t('open_sidepanel') }).catch(() => {});
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'remark_highlight',
      title: ReMarkI18n.t('highlight_context_menu'),
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: 'remark_open_sidepanel',
      title: ReMarkI18n.t('open_sidepanel_context_menu'),
      contexts: ['all']
    });
  });
}

async function syncNativeLanguage() {
  try {
    const data = await chrome.storage.local.get(SETTINGS_KEY);
    ReMarkI18n.setLocale(data?.[SETTINGS_KEY]?.language);
  } catch (_) {
    ReMarkI18n.setLocale('system');
  }
  refreshNativeUi();
}

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onInstalled.addListener(() => { void syncNativeLanguage(); });
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes?.[SETTINGS_KEY]) void syncNativeLanguage();
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'remark_highlight' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'CONTEXT_HIGHLIGHT',
      text: info.selectionText
    });
  } else if (info.menuItemId === 'remark_open_sidepanel' && tab?.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

// Handle messages from content script or sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'OPEN_SIDE_PANEL') {
    if (sender.tab?.windowId) {
      const focus = { clipId: message.clipId, markId: message.markId };
      chrome.storage.local.set({ remark_pending_focus: focus }).catch(() => {});
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).then(() => {
        setTimeout(() => chrome.runtime.sendMessage({ action: 'FOCUS_CLIP', ...focus }), 180);
        setTimeout(() => chrome.runtime.sendMessage({ action: 'FOCUS_CLIP', ...focus }), 700);
      });
      sendResponse({ success: true });
    }
  }
  return true;
});

void syncNativeLanguage();
