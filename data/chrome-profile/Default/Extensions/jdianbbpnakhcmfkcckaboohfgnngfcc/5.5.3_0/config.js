/*
 * Shared runtime configuration for the Email Extractor extension.
 *
 * There is no bundler here (unlike the Vite-built finder/tracker extensions), so
 * the environment is chosen from a single build flag instead of build-time env
 * substitution:
 *
 *   - The source tree ships BUILD_ENV = "development", so loading
 *     apps/ext-extractor/ unpacked points at the local dev stack (see .env.example).
 *   - The packaging script (scripts/package.mjs) rewrites the flag to "production"
 *     in the zipped build, so a packaged extension — whether you load the zip
 *     unpacked or publish it to the Web Store — uses the real public hosts.
 *
 * Loaded first in popup.html (before popupv3.js) and via importScripts in the
 * background service worker, so MS_URLS is available to both.
 */
(function () {
  // Flipped to "production" by scripts/package.mjs. Do not rename the marker.
  var BUILD_ENV = "production"; // @build-env

  var isProd = BUILD_ENV === "production";

  // Production: the real public hosts.
  //
  // The new Email Extractor talks to the Mailsumo app directly (app.mailsumo.io) instead of
  // the legacy email-extractor.io host. That legacy apex only reaches the Mailsumo backend
  // once its DNS is cut over behind Cloudflare; pointing the extension straight at
  // app.mailsumo.io lets the production build be tested before that cutover and mirrors how
  // the Finder extension owns its own hostname. The app serves the extractor's public pages
  // (/subscription, /uninstall, ...) under /ee, and proxy.ts maps them onto the app root, so
  // the same clean paths used here resolve there too.
  var PROD = {
    backend: "https://app.mailsumo.io", // extractor backend: subscription, install, api
    // Marketing site (product pages: /welcome, /help, /uninstall). These live only on the
    // static site-extractor service. email-extractor.io routes its marketing paths there via
    // Cloudflare, so it stays the clean public home for those pages even though the backend
    // now points straight at app.mailsumo.io.
    site: "https://email-extractor.io",
    app: "https://app.mailsumo.io", // the Mailsumo dashboard
    brand: "https://mailsumo.io", // umbrella marketing site
    tracker: "https://mailtracker.io", // Mail Tracker product site
    finder: "https://mailfinder.app", // Mail Finder product site
  };

  // Development: the local monorepo dev stack (see .env.example).
  var DEV = {
    backend: "http://extractor.localhost:3000",
    // site-extractor's own dev server (marketing pages). Distinct from `backend` (the app) in
    // dev, since locally there is no Cloudflare to split the domain by path.
    site: "http://localhost:3002",
    app: "http://localhost:3000",
    brand: "http://localhost:3001",
    tracker: "http://localhost:3004",
    // No finder site runs locally; keep it pointed at production.
    finder: "https://mailfinder.app",
  };

  globalThis.MS_ENV = isProd ? "production" : "development";
  globalThis.MS_URLS = isProd ? PROD : DEV;
})();

/*
 * Hosts where the repeat scanning stays off.
 *
 * The extractor runs on <all_urls> because autosave is meant to capture emails as you
 * browse. But heavy single-page apps (video, social, chat) churn the DOM constantly, which
 * makes the MutationObserver re-scan the whole page every ~500ms, pinning the CPU and
 * slowing the browser to a crawl. Uninstall feedback called this out by name (youtube.com,
 * messenger.com).
 *
 * What is off here is the repetition, not the extraction: content.js attaches neither the
 * observer nor the focus rescan, but still scans once per page load. These are exactly the
 * hosts people queue up in the automation tool (influencer profiles on tiktok.com,
 * instagram.com and youtube.com carry public contact addresses), and it navigates a tab
 * through a list with no popup to open per page, so dropping the load scan left those runs
 * collecting nothing. Add registrable domains here; subdomains (www., web., mail., …) are
 * matched automatically.
 */
(function () {
  var INERT_HOSTS = [
    // Video / streaming
    "youtube.com",
    "netflix.com",
    "twitch.tv",
    "spotify.com",
    "hulu.com",
    "disneyplus.com",
    "primevideo.com",
    // Social / chat
    "facebook.com",
    "messenger.com",
    "instagram.com",
    "tiktok.com",
    "twitter.com",
    "x.com",
    "reddit.com",
    "whatsapp.com",
    "discord.com",
    "telegram.org",
    "snapchat.com",
    "pinterest.com",
  ];

  function isInertHost(host) {
    if (!host) return false;
    // Drop any port and a leading www. so "www.youtube.com:443" matches "youtube.com".
    var h = String(host).toLowerCase().split(":")[0].replace(/^www\./, "");
    for (var i = 0; i < INERT_HOSTS.length; i++) {
      var d = INERT_HOSTS[i];
      if (h === d || h.slice(-(d.length + 1)) === "." + d) return true;
    }
    return false;
  }

  globalThis.MS_INERT_HOSTS = INERT_HOSTS;
  globalThis.msIsInertHost = isInertHost;
})();
