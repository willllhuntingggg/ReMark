/**
 * ReMark Store Assets — presentation-only chrome mock.
 *
 * This adapter lets the REAL ReMark product files
 * (content/content.js, sidepanel/sidepanel.html/css/js, lib/storage.js)
 * run in a plain local browser page for screenshot capture.
 *
 * It only fakes the extension runtime APIs the product calls; it does not
 * change, copy, or recreate any product interface.
 */
(function () {
  if (window.__remarkChromeMockLoaded__) return;
  window.__remarkChromeMockLoaded__ = true;

  const listeners = new Set();
  const storageChangeListeners = new Set();
  const readLS = (key) => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? undefined : JSON.parse(raw);
    } catch (_) {
      return undefined;
    }
  };
  const writeLS = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
    const change = {};
    change[key] = { oldValue: undefined, newValue: value };
    storageChangeListeners.forEach((listener) => {
      try { listener(change, 'local'); } catch (_) {}
    });
  };

  const chromeMock = {
    runtime: {
      lastError: null,
      id: 'fignfifoniblkonapihmkfakmlgkbkcf',
      getManifest() {
        return { manifest_version: 3, name: 'ReMark', version: '1.0.1', description: 'Mark it now. Find it later.' };
      },
      getURL(path) {
        return 'chrome-extension://' + this.id + '/' + String(path).replace(/^\//, '');
      },
      sendMessage() {
        return Promise.resolve(null);
      },
      onMessage: {
        addListener(listener) { listeners.add(listener); },
        removeListener(listener) { listeners.delete(listener); }
      }
    },
    storage: {
      local: {
        get(keys, callback) {
          const request = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
          const result = {};
          request.forEach((key) => {
            const value = readLS(key);
            if (value !== undefined) result[key] = value;
          });
          return new Promise((resolve) => {
            const done = () => {
              if (typeof callback === 'function') callback(result);
              resolve(result);
            };
            queueMicrotask(done);
          });
        },
        set(items, callback) {
          return new Promise((resolve) => {
            Object.entries(items || {}).forEach(([key, value]) => writeLS(key, value));
            if (typeof callback === 'function') callback();
            resolve(true);
          });
        },
        remove(keys, callback) {
          return new Promise((resolve) => {
            (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
              localStorage.removeItem(key);
              const change = {};
              change[key] = { oldValue: undefined, newValue: undefined };
              storageChangeListeners.forEach((listener) => {
                try { listener(change, 'local'); } catch (_) {}
              });
            });
            if (typeof callback === 'function') callback();
            resolve(true);
          });
        }
      },
      onChanged: {
        addListener(listener) { storageChangeListeners.add(listener); },
        removeListener(listener) { storageChangeListeners.delete(listener); }
      }
    },
    scripting: {
      executeScript() { return Promise.resolve([]); },
      insertCSS() { return Promise.resolve(); }
    },
    tabs: {
      query() { return Promise.resolve([]); },
      create() { return Promise.resolve({ id: 1, windowId: 1 }); },
      update() { return Promise.resolve({}); },
      sendMessage() { return Promise.resolve(); }
    },
    windows: {
      update() { return Promise.resolve({}); }
    },
    sidePanel: {
      setPanelBehavior() { return Promise.resolve(); },
      open() { return Promise.resolve(); }
    }
  };

  window.chrome = chromeMock;
})();
