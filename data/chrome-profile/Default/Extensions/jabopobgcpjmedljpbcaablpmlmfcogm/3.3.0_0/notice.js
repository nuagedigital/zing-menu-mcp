// Shown under the toolbar icon when WhatFont can't run on the current page.
// background/index.ts picks the problem.
const MESSAGES = {
  browser: {
    title: "WhatFont can't run on this page",
    body: "Browsers don't let extensions run on their own pages, such as settings and new tabs. Open any website, then click the WhatFont icon again.",
  },
  store: {
    title: "WhatFont can't run on the store",
    body: "Browsers don't let extensions run on their extension stores. Open any other website, then click the WhatFont icon again.",
  },
  file: {
    title: "Allow WhatFont to read local files",
    body: "This page is a file on your computer, and extensions need your permission to read those. Open WhatFont's settings, turn on “Allow access to file URLs”, then click the WhatFont icon again.",
    settings: true,
  },
  pdf: {
    title: "WhatFont can't read PDFs",
    body: "PDFs are shown by the browser's built-in viewer, which extensions can't inspect. WhatFont works on text in web pages.",
  },
  blocked: {
    title: "WhatFont can't run on this page",
    body: "The browser doesn't allow extensions on this page. Try another website.",
  },
};

const problem = new URLSearchParams(location.search).get("problem");
const message = MESSAGES[problem] ?? MESSAGES.browser;

document.getElementById("title").textContent = message.title;
document.getElementById("body").textContent = message.body;

const settings = document.getElementById("settings");
if (message.settings) {
  settings.hidden = false;
  settings.addEventListener("click", () => {
    chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    window.close();
  });
}
