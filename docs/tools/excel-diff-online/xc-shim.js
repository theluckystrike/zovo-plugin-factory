/* TOOLCHK5: the one VS Code webview call the Excel Compare view (view.js) makes, acquireVsCodeApi().postMessage, handed to
   the page's host code in app.js (self.zovoXcHost). Messages sent before app.js runs wait in a queue. No network. */
self.acquireVsCodeApi = () => ({
  postMessage: (m) => { if (self.zovoXcHost) self.zovoXcHost(m); else (self.zovoXcQueue = self.zovoXcQueue || []).push(m); },
  setState: () => {}, getState: () => undefined,
});
