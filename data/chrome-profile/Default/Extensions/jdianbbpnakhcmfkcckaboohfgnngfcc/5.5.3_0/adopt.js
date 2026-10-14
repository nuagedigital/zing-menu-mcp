/*
    Email Extractor - account adoption

    Points this install at whoever is signed in on the Mailsumo app, so installing the extension
    and signing in are the only two things anyone has to do, in either order.

    It runs here, on an app page, rather than in the background, because the session cookie is
    SameSite=Lax: it rides on a request made from this page and on nothing the extension sends
    from its own context. And it is its own script because content.js is excluded from the app
    host on purpose (it would re-scan the addresses the dashboard displays).
*/
(function () {
    var appBase = (typeof MS_URLS !== "undefined" && MS_URLS.app) ? MS_URLS.app : "https://app.mailsumo.io";
    if (window.location.origin !== appBase) { return; }

    chrome.runtime.sendMessage({message: "ms_get_install_token"}, function (res) {
        if (chrome.runtime.lastError || !res || !res.token) { return; }
        fetch(appBase + "/api/extension/adopt", {
            method: "POST",
            credentials: "include",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({token: res.token})
        }).catch(function () { /* signed out, or offline: nothing to do, nothing to say */ });
    });
})();
