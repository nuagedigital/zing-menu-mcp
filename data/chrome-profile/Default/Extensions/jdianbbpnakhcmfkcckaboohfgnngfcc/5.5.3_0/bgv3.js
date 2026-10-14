/*
    Email Extractor - background service worker (Manifest V3)
*/

// Shared runtime config (production vs local dev URLs). Defines globalThis.MS_URLS.
try { importScripts("config.js"); } catch (e) { /* fall back to prod default below */ }

const LS = {
  getAllItems: () => chrome.storage.local.get(),
  getItem: async key => (await chrome.storage.local.get(key))[key],
  setItem: (key, val) => chrome.storage.local.set({[key]: val}),
  removeItems: keys => chrome.storage.local.remove(keys),
};

// Backend base URL. All API calls and user-facing pages hang off this. Comes from
// config.js (MS_URLS) so it points at the local dev stack when unpacked and at the
// real host in the published build; falls back to production if config didn't load.
const BACKEND_BASE = (typeof MS_URLS !== "undefined" && MS_URLS.backend) || "https://email-extractor.io";

// Marketing site base. Hosts the product pages (/welcome, /uninstall) served by site-extractor.
// Same host as the backend in production; a separate local origin in dev (config.js).
const SITE_BASE = (typeof MS_URLS !== "undefined" && MS_URLS.site) || BACKEND_BASE;

// The Mailsumo app, which hosts the one Upgrade page shared by all four products.
const APP_BASE = (typeof MS_URLS !== "undefined" && MS_URLS.app) || "https://app.mailsumo.io";

// Hosts that must never be treated as a source of scraped emails: the Mailsumo app itself.
// Its dashboard lists the user's own saved addresses, so autosaving from there would loop
// them straight back in. The content script and popup already stay inert on this host; this
// is a final backstop for any already-open tab still running an older content script.
const BLOCKED_SOURCE_HOSTS = (function(){
  var hosts = { "app.mailsumo.io": true };
  try {
    if(typeof MS_URLS !== "undefined"){
      ["app","backend"].forEach(function(key){
        if(MS_URLS[key]){ hosts[new URL(MS_URLS[key]).host] = true; }
      });
    }
  } catch(e){ /* keep the hardcoded default */ }
  return hosts;
})();
function isBlockedSourceUrl(u){
  if(!u){ return false; }
  try { return BLOCKED_SOURCE_HOSTS[new URL(u).host] === true; } catch(e){ return false; }
}

// Every "this needs a paid plan" path leads here. The page sells Email Extractor first,
// since that is what the user is holding, but also the Suite and the other tools. The
// install token rides along so it can still be bought in one click, with no account.
function upgradeUrl(token){
  return APP_BASE + "/upgrade?product=extractor&token=" + encodeURIComponent(token || "");
}

// Verification is the Email Verifier add-on, sold apart from Extractor Premium, so the
// "Verify" button's paywall sells that product specifically rather than the extractor plan.
function verifierUpgradeUrl(token){
  return APP_BASE + "/upgrade?product=verifier&token=" + encodeURIComponent(token || "");
}

// UTF-8 safe base64 (btoa alone chokes on non-Latin1 characters).
function base64EncodeUtf8(str){
  var bytes = new TextEncoder().encode(String(str));
  var bin = "";
  for (var i = 0; i < bytes.length; i++){ bin += String.fromCharCode(bytes[i]); }
  return btoa(bin);
}

// Redirect users to the uninstall page when the extension is removed. Served by the product's
// own marketing site (site-extractor), same as the post-install /welcome tab, so both share the
// standard site layout. In production SITE_BASE == BACKEND_BASE (Cloudflare routes /uninstall to
// site-extractor); in dev this points at the site's own origin instead of the app.
try {
  chrome.runtime.setUninstallURL(SITE_BASE + '/uninstall');
} catch (e) {
  // no-op
}

chrome.alarms.onAlarm.addListener(function(alarm){if(alarm.name=='autovisitcontinuealarm'){autovisitcontinue();}});

chrome.commands.onCommand.addListener(function(command) {
  if(command=='copy-emails-to-clipboard'){
    chrome.storage.local.get(function (fetch) {
      var showEmails = fetch._saveMailList;
      if(showEmails == undefined || showEmails=="") {
        showEmails = "";
      }else{
        var text=showEmails;
        if(!fetch.autosavepay){text += "\n\nUpgrade the extension to autosave and automate your emails ID capture.";}
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, 
                {
                    message: "copyText",
                    textToCopy: text,
                    elements: fetch._emailsFound
                }, function (response){if (!chrome.runtime.lastError) {} else {}});
            return;
        })
      }
    });
  }
});

//Updating The Count On Notification Badge
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  // The install token, for the auto-connect in content.js. getUserInfo mints one if this
  // install has never had a token, which is the case on a first run.
  if (request.message === 'ms_get_install_token') {
        getUserInfo(false,function(result){sendResponse({token: result.localtoken});});
        return true;
  }
  else if (request.message === 'get_bg_vars') {  
        var callback="got_bg_vars";
        var variables=null;
        if(request.callback && request.callback!==''){callback=request.callback;} 
        if(request.variables && request.variables!==''){variables=request.variables;} 
        LS.getAllItems().then((allvars)=>{chrome.runtime.sendMessage({"message":callback,"vars":allvars,"variables":variables}, function (response){if (!chrome.runtime.lastError) {} else {}});return;});
        sendResponse(true);
        return true;
  }
  else if ((request.from == "content") && (request.subject == "sendMailCount")) {
    if(extensionenabled){
        chrome.action.setBadgeText({text: request.mailCount.toString()});
        LS.getItem('autovisittab').then((autovisittab)=>{
          if(autovisittab>=0){chrome.action.setBadgeBackgroundColor({ color: [0, 0, 255, 255] });} //Styling The Badge
          else{chrome.action.setBadgeBackgroundColor({ color: [0, 0, 0, 255] });}
        });
    }else{
        chrome.action.setBadgeText({text: ''});
    }
    sendResponse(true);
    return true;
  }
  else if ((request.from == "content") && (request.subject == "sendEmails")) {
    chrome.storage.local.set({
        '_saveMailList': request.mails,
        '_emailsFound' : request.mailsFound,
        '_currentUrl'  : request.url
    });
    // update totals for automation overlay
    var found = (isNaN(parseInt(request.mailsFound))?0:parseInt(request.mailsFound));
    LS.getAllItems().then((allvars)=>{
      var prevPageCount = allvars.autovisit_current_emails || 0;
      var delta = Math.max(0, found - prevPageCount);
      var total = (allvars.autovisit_emails_total || 0) + delta;
      LS.setItem('autovisit_emails_total', total);
      LS.setItem('autovisit_current_emails', found);
    });
    sendResponse(true);
    return true;
  }
  else if ((request.from == "content") && (request.subject == "sendLinks")) {
    chrome.storage.local.set({'_saveLinkList': request.links});
    sendResponse(true);
    return true;
  //Return basic (non-personal) extension info: local token + version.
  } else if (request.options === "information"){
        var callback="information_callback";
        var variables=null;
        if(request.callback && request.callback!==''){callback=request.callback;} 
        if(request.variables && request.variables!==''){variables=request.variables;} 
        var sendertabid=0;
        if(sender.tab.id){sendertabid=sender.tab.id;}
        getUserInfo(false,function(userinfo){
          if(sendertabid>0){
            chrome.tabs.sendMessage(sendertabid, {"message":callback,"vars":userinfo,"variables":variables}, function(response){if (!chrome.runtime.lastError) {} else {}});return;
      
          }else{
            chrome.runtime.sendMessage({"message":callback,"vars":userinfo,"variables":variables}, function (response){if (!chrome.runtime.lastError) {} else {}});return;
          }
        });
        sendResponse(true);
        return true;
    } else if(request.options === "chkautosave") {
      //getUserInfo();
      getUserInfo(false,function(result){sendData("autosavesubscriber","token=" + result.localtoken + "&version=" + result.version,chkpaid);});
      sendResponse({status: "wait"});      
    } else if(request.options === "changetoken") {
      if(typeof (request.token)!=='undefined'){
        var newtoken=request.token;
        getUserInfo(false,function(result){
          sendData("autosavesubscriber","token=" + newtoken + "&version=" + result.version,function(data){changetoken(data,newtoken);});
        });
        sendResponse({status: "wait"});
        
      }
    }else if(request.options === "setautosave") {
        autosaveenabled=truefalse(request.enabled);
        autosavepay=truefalse(request.pay);
        chrome.storage.local.set({'autosaveenabled': autosaveenabled});
        chrome.storage.local.set({'autosavepay': autosavepay});
        sendResponse(true);
        return true;
    }else if(request.options === "refreshaccount") {
      // Re-check subscription/account status now. The popup calls this every time it opens,
      // and again when settings opens; setpaid persists the answer and pushes it back so the
      // popup updates in place instead of living with whatever storage happened to hold.
      getUserInfo(false,function(result){
        sendData("autosavesubscriber","token=" + result.localtoken + "&version=" + result.version,setpaid);
      });
      sendResponse({status: "wait"});
      return true;
    }else if (request.options == "saveautosave") {
      var saveSenderTabId = (sender && sender.tab) ? sender.tab.id : -1;
      // Read the gate from storage instead of the module-level copy. MV3 tears the service
      // worker down between page loads and only refills those variables from an async
      // storage read at startup, so a scan arriving on a cold worker would see the default
      // `false` and be dropped even though the user has Autosave switched on.
      LS.getAllItems().then((allvars)=>{
        autosaveenabled = truefalse(allvars.autosaveenabled) || false;
        if(!localtoken){localtoken = allvars.localtoken;}
        if(!(autosaveenabled && localtoken && request.mails.length>0)){return;}
        chrome.tabs.query({currentWindow: true, active: true, windowId: chrome.windows.WINDOW_ID_CURRENT}, function (tabs) {
          url="";
          if(typeof(request.url)!=="undefined" && request.url!==""){url=request.url;}
          else if(typeof (tabs[0]) !== 'undefined'){url=tabs[0].url;}
          else if(typeof (autovisitlinks[0] !== 'undefined')){url=autovisitlinks[0];}

          // Never store emails scraped from the Mailsumo app itself (see BLOCKED_SOURCE_HOSTS).
          if(isBlockedSourceUrl(url)){return;}

          payload="token="+localtoken;
          payload+="&source="+base64EncodeUtf8(url);
          payload+="&mails=" + JSON.stringify(request.mails);
          // Unattended saving stays premium, so the backend needs to tell this apart from the
          // popup's Save button, which any free connected account may use.
          payload+="&mode=autosave";
          var autoLists = savedListIds(allvars);
          if(autoLists.length){payload+="&list=" + encodeURIComponent(autoLists.join(","));}
          sendData("autosavemails",payload,verifyaccount);
        });
      });
      // While automation is running, keep this run's emails (with source page) so
      // the completion screen can download just this run. This is independent of
      // the autosave gate above so the download always reflects what was found.
      if(Array.isArray(request.mails) && request.mails.length>0){
        LS.getAllItems().then((allvars)=>{
          if(allvars.autovisittab && allvars.autovisittab>0 && saveSenderTabId===allvars.autovisittab){
            var rows = Array.isArray(allvars.autovisit_run_rows) ? allvars.autovisit_run_rows : [];
            var seen = {};
            for(var i=0;i<rows.length;i++){ if(rows[i] && rows[i].email){ seen[rows[i].email]=1; } }
            var src = (request.url && request.url!=="") ? request.url : (allvars.autovisit_current || "");
            for(var j=0;j<request.mails.length;j++){
              var m = request.mails[j];
              if(m && !seen[m]){ seen[m]=1; rows.push({email:m, url:src}); }
            }
            LS.setItem('autovisit_run_rows', rows);
          }
        });
      }
      sendResponse(true);
        return true;
    }else if(request.options === "autovisitclearcompleted") {
        LS.setItem('autovisit_completed', false);
        LS.setItem('autovisit_emails_total', 0);
        LS.setItem('autovisit_total', 0);
        LS.setItem('autovisit_processed', 0);
        LS.setItem('autovisit_current', '');
        LS.setItem('autovisit_current_emails', 0);
        LS.setItem('autovisit_run_rows', []);
        sendResponse(true);
        return true;
    }else if(request.options === "setslow") {
        slowenabled=truefalse(request.enabled);
        chrome.storage.local.set({'slowenabled': slowenabled});
        sendResponse(true);
        return true;
      }else if (request.options == "autovisitnavigate") {
        autovisitwindow=request.autovisitwindow;
        LS.setItem('autovisitwindow',autovisitwindow);
        // Drop blank / whitespace-only lines so we never navigate to "http://",
        // and add a scheme to bare domains (e.g. "overloop.com") so the very
        // first page navigates correctly like the rest of the queue does.
        autovisitlinks=(Array.isArray(request.urls)?request.urls:[])
          .map(function(s){return (s||"").trim();})
          .filter(function(s){return s.length>0;})
          .map(function(s){return (s.indexOf('://')===-1) ? ('http://'+s) : s;});
        LS.setItem('autovisitlinks',autovisitlinks);
        LS.setItem('autovisit_total', autovisitlinks.length);
        LS.setItem('autovisit_processed', 0);
        LS.setItem('autovisit_emails_total', 0);
        LS.setItem('autovisit_current_emails', 0);
        LS.setItem('autovisit_completed', false);
        LS.setItem('autovisit_run_rows', []);
        if (autovisitlinks.length>1000){autovisitlinks.splice(1000,autovisitlinks.length-1000);LS.setItem('autovisitlinks',autovisitlinks);}
        url=autovisitlinks[0];
        LS.setItem('autovisit_current', url);
        LS.setItem('autovisit_current_emails', 0);
        isdemo=request.isdemo;
        LS.setItem('isdemo',isdemo);
        // Automation's whole purpose is to collect emails, so make sure autosave
        // is on for the run (otherwise saveautosave silently drops every page).
        if(!isdemo){
          autosaveenabled=true;
          chrome.storage.local.set({'autosaveenabled': true});
        }
        chrome.storage.local.get('autovisittab', function (avt) {
          autovisittab=avt.autovisittab;
          if(autovisittab==-1){
            chrome.action.setBadgeBackgroundColor({ color: [0, 0, 255, 255] });
            // Keep automation window visible (do not minimize)
            // chrome.windows.update(autovisitwindow, {"state":"minimized"}, function(window){});
            chrome.tabs.create({"windowId":autovisitwindow, url:url}, function(tab){autovisittab=tab.id;LS.setItem('autovisittab',autovisittab);});
          }else{
            chrome.tabs.get(autovisittab,function(avt){
              if (!chrome.runtime.lastError) {
                autovisittab=avt.id;
                chrome.tabs.update(autovisittab,{url:url},function(){})
              } else { //For any reason tab does not exists and we have to regenerate it
                chrome.action.setBadgeBackgroundColor({ color: [0, 0, 255, 255] });
                // Keep automation window visible (do not minimize)
                // chrome.windows.update(autovisitwindow, {"state":"minimized"}, function(window){});
                chrome.tabs.create({"windowId":autovisitwindow, url:url}, function(tab){autovisittab=tab.id;LS.setItem('autovisittab',autovisittab);});
              }});
            //chrome.tabs.update(autovisittab,{url:url},function(){})
          }
        });
        sendResponse(true);
        return true;
    }else if (request.options == "extensionenable") {
        if (typeof (request.enable)!=='undefined'){
          extensionenabled=request.enable;
          chrome.storage.local.set({'extensionenabled': extensionenabled});
          if(extensionenabled){
              chrome.action.setBadgeText({text: '0'}); //Set Initial Badge Count
              if(autovisittab>=0){chrome.action.setBadgeBackgroundColor({ color: [0, 0, 255, 255] });} //Styling The Badge
              else{chrome.action.setBadgeBackgroundColor({ color: [0, 0, 0, 255] });}
              chrome.action.setIcon({path: {"16": "icon16.png", "19": "icon19.png", "38": "icon38.png", "48": "icon48.png","128": "icon128.png"}}, function(){});
          }else{
              chrome.action.setBadgeText({text: ''}); //Clear the badge
              chrome.action.setBadgeBackgroundColor({ color: [0, 0, 0, 0] }); //Styling The Badge
              chrome.action.setIcon({path: {"16": "icondisabled16.png", "19": "icondisabled19.png", "38": "icondisabled38.png", "48": "icondisabled48.png","128": "icondisabled128.png"}}, function(){});
          }
        }else{sendResponse({status: extensionenabled});return true;}
        sendResponse(true);
        return true;
    }else if (request.options == "stats") {
      if(typeof(request.data)!=="undefined" && typeof(request.event)!=="undefined")
      {
        url="";
        if(typeof(request.data.url)!=="undefined" && request.data.url!==""){url=request.data.url; delete request.data.url; }

        payload="token="+localtoken;
        payload+="&source="+base64EncodeUtf8(url);
        payload+="&event="+request.event;
        if(JSON.stringify(request.data)!=='{}'){payload+="&data=" + JSON.stringify(request.data);}
        sendData("stats", payload);
        return true;
      }
      sendResponse(true);
        return true;
    }else if (request.options == "rated") {
      chrome.storage.local.set({'rated': true});
      chrome.storage.local.set({'needtorate': false});
      needtorate=false;
      sendResponse({status: "ok"});
      return true;
  }else if (request.options === "savemailsmanual") {
      // Manual, on-demand save from the popup's Save button: premium users with Autosave off,
      // and free users with a connected account.
      //
      // The backend answers two separate questions now. `active` is Extractor Premium and
      // nothing else (it drives the cached paid flag, so a free save must never set it), while
      // `saved` says whether the addresses landed. `reason` explains a refusal: "connect" needs
      // an account, "premium_only" is an unattended save without the subscription.
      var manualEmails = Array.isArray(request.mails) ? request.mails : [];
      if(manualEmails.length === 0){ sendResponse({ ok:false, error:"empty" }); return true; }
      LS.getAllItems().then(function(allvars){
        getUserInfo(false, function(info){
          var payload = "token=" + info.localtoken;
          payload += "&source=" + base64EncodeUtf8(request.url || "");
          payload += "&mails=" + JSON.stringify(manualEmails);
          payload += "&mode=manual";
          var listIds = (Array.isArray(request.lists) && request.lists.length)
            ? request.lists
            : savedListIds(allvars);
          if(listIds.length){ payload += "&list=" + encodeURIComponent(listIds.join(",")); }
          postData(BACKEND_BASE + "/api/emails", payload)
            .then(function(result){
              if(typeof result !== "object" || result === null){
                sendResponse({ ok:false, error:"bad_response" });
                return;
              }
              // Only a premium answer may touch the cached paid state: setpaid() with a free
              // answer would clear the flags a subscriber legitimately holds.
              if(knowsPaidState(result) && result["active"]){ setpaid(result); }
              if(result["saved"]){
                sendResponse({ ok: true, stored: result["stored"] || 0 });
                return;
              }
              sendResponse({
                ok: false,
                reason: result["reason"] || "",
                // Only a genuine entitlement problem should send the user to checkout. Needing
                // an account is a different fix, and the popup already has a card for it.
                upgrade: result["reason"] === "premium_only" || (knowsPaidState(result) && !result["reason"]),
                needsAccount: result["reason"] === "connect"
              });
            })
            .catch(function(){ sendResponse({ ok:false, error:"network" }); });
        });
      });
      return true; // keep the message channel open for the async sendResponse
  }else if (request.options === "setsavelist") {
      // Which extra lists the popup's Save button files into, on top of the account's
      // Extractor list, where every save lands regardless.
      chrome.storage.local.set({'savelistids': Array.isArray(request.lists) ? request.lists : []});
      sendResponse(true);
      return true;
  }else if (request.options === "createlist") {
      // "New list" in the popup's picker. The install token is the only credential this
      // extension holds, so list creation has its own token-authenticated route rather than
      // going through the account-scoped /api/lists the Finder uses.
      var newListName = (request.name || "").replace(/\s+/g, " ").trim();
      if(!newListName){ sendResponse({ ok:false, error:"empty" }); return true; }
      getUserInfo(false, function(info){
        var payload = "token=" + info.localtoken + "&name=" + encodeURIComponent(newListName);
        postData(BACKEND_BASE + "/api/lists/create", payload)
          .then(function(result){
            if(typeof result !== "object" || result === null){
              sendResponse({ ok:false, error:"bad_response" });
              return;
            }
            // Cache the fresh set so the picker (and the next popup open) sees the new list
            // without waiting for the next status refresh.
            if(Array.isArray(result["lists"])){ chrome.storage.local.set({'lists': result["lists"]}); }
            sendResponse({
              ok: !!result["ok"],
              list: result["list"] || null,
              lists: Array.isArray(result["lists"]) ? result["lists"] : [],
              error: result["error"] || ""
            });
          })
          .catch(function(){ sendResponse({ ok:false, error:"network" }); });
      });
      return true;
  }else if (request.options === "savedstatus") {
      // Which of the displayed addresses are already in the user's leads. Runs here so the
      // token stays in the worker. Answers { saved:[lowercased emails] }; the popup uses it
      // to mark those rows as already-saved instead of offering a Save button.
      var statusEmails = Array.isArray(request.mails) ? request.mails : [];
      if(statusEmails.length === 0){ sendResponse({ ok:true, saved:[] }); return true; }
      getUserInfo(false, function(info){
        var payload = "token=" + info.localtoken + "&mails=" + JSON.stringify(statusEmails);
        postData(BACKEND_BASE + "/api/emails/saved", payload)
          .then(function(result){
            if(result && typeof result === "object" && Array.isArray(result.saved)){
              sendResponse({ ok:true, saved: result.saved });
            } else {
              sendResponse({ ok:false, saved: [] });
            }
          })
          .catch(function(){ sendResponse({ ok:false, saved: [] }); });
      });
      return true; // keep the message channel open for the async sendResponse
  }else if (request.options === "verifyemails") {
      // Inline verification for the popup's Verify button. Runs here (not in the popup) so the
      // install token never has to leave the service worker. The backend answers with either
      // { ok:true, results:[{email,status}] }, { upgrade:true } (not entitled), or
      // { outOfCredits:true } (a Verifier owner who ran dry) — the popup routes on those.
      var emails = Array.isArray(request.emails) ? request.emails : [];
      getUserInfo(false, function(info){
        var payload = "token=" + encodeURIComponent(info.localtoken)
          + "&version=" + encodeURIComponent(info.version)
          + "&emails=" + encodeURIComponent(JSON.stringify(emails));
        postData(BACKEND_BASE + "/api/extractor/verify", payload)
          .then(function(result){
            if(result && typeof result === "object"){ sendResponse(result); }
            else{ sendResponse({ ok:false, error:"bad_response" }); }
          })
          .catch(function(){ sendResponse({ ok:false, error:"network" }); });
      });
      return true; // keep the message channel open for the async sendResponse
  }else{
      sendResponse({status: "ok"});
      return true;
    }
    return;
  //sendResponse({status: "ok"});
});

var version=chrome.runtime.getManifest().version;
chrome.storage.local.set({'version': version});
var localtoken; //Local storaged token
var autosaveenabled=false; //Saves if user has enabled autosave
var autosavepay=false;  //Saves if user has paid for autosave
var autovisitwindow=-1;
var autovisittab=-1;
var autovisitlinks=[];
var slowenabled=false; //enables a 5 seconds delay between automation pages
var isdemo=false;
var demostring="\"Email\",\"Source URL\"\nhola@carlosmdh.es,https://carlosmdh.es/en/contactar/\ndev@orestbida.com,https://orestbida.com/contact/\nhanna.juergensmeier@gmx.de,https://www.horsetelex.com/horses/pedigree/118887/contact-me\nmsilvermantherapy@gmail.com,https://www.blackfemaletherapists.com/directory/listing/dr-markie-silverman/\nsupport@altkie.com,http://altkie.com/\ndlee35@avc.edu,https://www.avc.edu/administration/marketing/contact\nlearn@stanbridge.edu,https://www.stanbridge.edu/contact\ninformation@stowers.org,https://www.stowers.org/scientists/jennifer-gerton\n\n\n>>> SUBSCRIBE TO \"AUTOSAVE & AUTOMATION\" AND EXTRACT THOUSANDS OF EMAILS IDs IN MINUTES\n\n\nHOW AUTOMATION WORKS ?\n- You paste a list of up to 1.000 URL in the widget, and you start the automation. A new tab will open and start visiting all the URL, one at a time. All email ID's found in those pages will be autosaved.\n- If you close the Automation Tab, the process will stop, but you can restart the process at any time.\n- When the 1.000 URL have been processed, you can launch a new batch of 1.000 new URLs.";
var extensionenabled=true;
var needtorate=true;
// The settings a fresh profile starts from, written whenever storage is missing them. The
// popup mirrors storage rather than these variables, so a key that never gets written reads
// as off/absent there no matter what the default here says.
function seedDefaults(){
  chrome.storage.local.set({
    'autosaveenabled': autosaveenabled,
    'autosavepay': autosavepay,
    'needtorate': needtorate,
    'slowenabled': slowenabled,
    'autovisitlinks': autovisitlinks,
    'autovisitwindow': autovisitwindow,
    'autovisittab': autovisittab,
    'extensionenabled': extensionenabled,
    'isdemo': isdemo
  });
}
chrome.storage.local.get(function (fetch) {
  if(typeof fetch.autosaveenabled === "undefined"){
    chrome.storage.local.set({'autosaveenabled': autosaveenabled});
  }else{
    autosaveenabled=truefalse(fetch.autosaveenabled);
  }
  if(typeof fetch.autosavepay === "undefined"){
    chrome.storage.local.set({'autosavepay': autosavepay});
  }else{
    autosavepay=truefalse(fetch.autosavepay);
  }
  if(typeof fetch.needtorate === "undefined"){
    chrome.storage.local.set({'needtorate': needtorate});
  }else{
    needtorate=truefalse(fetch.needtorate);
  }
  if(typeof fetch.rated !== "undefined"){needtorate=false;}
  if(typeof fetch.slowenabled === "undefined"){
    chrome.storage.local.set({'slowenabled': slowenabled});
  }else{
    slowenabled=truefalse(fetch.slowenabled);
  }
  if(typeof fetch.autovisitlinks === "undefined"){
    chrome.storage.local.set({'autovisitlinks': []});
  }else{
    autovisitlinks=fetch.autovisitlinks;
  }
  if(typeof fetch.autovisitwindow === "undefined"){
    chrome.storage.local.set({'autovisitwindow': -1});
  }else{
    autovisitwindow=fetch.autovisitwindow;
  }
  if(typeof fetch.autovisittab === "undefined"){
    chrome.storage.local.set({'autovisittab': -1});
  }else{
    autovisittab=fetch.autovisittab;
  }
  if(typeof fetch.extensionenabled === "undefined"){
    chrome.storage.local.set({'extensionenabled': true});
  }else{
    extensionenabled=fetch.extensionenabled;
  }
  if(typeof fetch.isdemo === "undefined"){
    chrome.storage.local.set({'isdemo': false});
  }else{
    isdemo=fetch.isdemo;
  }
  
});

chrome.windows.onRemoved.addListener(function(windowId){

  LS.getItem('autovisitwindow').then((autovisitwindow)=>{
    if(autovisitwindow==windowId){
      LS.setItem('autovisitwindow',-1);
      LS.setItem('autovisittab',-1);
    }
  });
});

autovisitcontinue=function(){
  chrome.alarms.clearAll()
  LS.getAllItems().then((allvars)=>{
    autovisitlinks=allvars.autovisitlinks;
    autovisitwindow=allvars.autovisitwindow;
    autovisittab=allvars.autovisittab;
    localtoken=allvars.localtoken;
    isdemo=allvars.isdemo;
    autovisitlinks.splice(0,1);
    LS.setItem('autovisitlinks',autovisitlinks);
    if(typeof allvars.autovisit_total !== 'undefined'){
      LS.setItem('autovisit_processed', Math.max(0, (allvars.autovisit_total||0) - autovisitlinks.length));
    }
    if(autovisitlinks.length>=1){
        chrome.action.setBadgeBackgroundColor({ color: [0, 0, 255, 255] });
        url=autovisitlinks[0];
        LS.setItem('autovisit_current', url);
        LS.setItem('autovisit_current_emails', 0);
        url = (url.indexOf('://') === -1) ? 'http://' + url : url;
        chrome.tabs.get(autovisittab,function(avt){
          if (!chrome.runtime.lastError) {
            autovisittab=avt.id;
            chrome.tabs.update(autovisittab,{url:url},function(){chrome.alarms.create("autovisitcontinuealarm",{when:Date.now() + 15000});});
          }else{}
        });
    }else if(isdemo){
        isdemo=false;
        LS.setItem('isdemo',false);
        if(autovisittab>0){
          chrome.tabs.create({url: upgradeUrl(localtoken)}, function (tab) {});
          chrome.tabs.update(autovisittab,{url:"data:text/csv;base64,"+btoa(demostring)},function(){chrome.alarms.create("autovisitcontinuealarm",{when:Date.now() + 15000});});
        }
    }else{
        finishAutomation();
    }
  });

  
}
chrome.webNavigation.onCompleted.addListener(function(details) {
    if (details.frameId !== 0) return; // Only process top-frame requests
    var tabId = details.tabId;
    LS.getAllItems().then((allvars)=>{
      if (details.tabId!== allvars.autovisittab) return; 
      autovisitlinks=allvars.autovisitlinks;
      autovisitwindow=allvars.autovisitwindow;
      autovisittab=allvars.autovisittab;
      localtoken=allvars.localtoken;
      isdemo=allvars.isdemo;
      autovisitlinks.splice(0,1);
      LS.setItem('autovisitlinks',autovisitlinks);
      if(autovisitlinks.length>=1){
        chrome.action.setBadgeBackgroundColor({ color: [0, 0, 255, 255] });
        chrome.alarms.clearAll()
        url=autovisitlinks[0];
        if(typeof allvars.autovisit_total !== 'undefined'){
          LS.setItem('autovisit_processed', Math.max(0, (allvars.autovisit_total||0) - autovisitlinks.length));
        }
        LS.setItem('autovisit_current', url);
        LS.setItem('autovisit_current_emails', 0);
        url = (url.indexOf('://') === -1) ? 'http://' + url : url;
        var navigateNext = function(){
          chrome.tabs.update(autovisittab,{url:url},function(){chrome.alarms.create("autovisitcontinuealarm",{when:Date.now() + 15000});});
        };
        if (slowenabled) {slowPause(5, navigateNext);} else {navigateNext();}
      }else if(isdemo){
        isdemo=false;
        LS.setItem('isdemo',false);
        if(autovisittab>0){
          chrome.tabs.create({url: upgradeUrl(localtoken)}, function (tab) {});
          chrome.tabs.update(autovisittab,{url:"data:text/csv;base64,"+btoa(demostring)},function(){chrome.alarms.create("autovisitcontinuealarm",{when:Date.now() + 15000});});

        }
      }else{
        finishAutomation();
      }
    });
});
chrome.webNavigation.onErrorOccurred.addListener(function(details){
    if (details.frameId !== 0) return; // Only process top-frame requests
    //if (details.tabId!== autovisittab) return; 
    var tabId = details.tabId;
    LS.getAllItems().then((allvars)=>{
      if (details.tabId!== allvars.autovisittab) return; 
      autovisitlinks=allvars.autovisitlinks;
      autovisitwindow=allvars.autovisitwindow;
      localtoken=allvars.localtoken;
      isdemo=allvars.isdemo;
      autovisitlinks.splice(0,1);
      LS.setItem('autovisitlinks',autovisitlinks);
      if(autovisitlinks.length>=1){
        chrome.action.setBadgeBackgroundColor({ color: [0, 0, 255, 255] });
        chrome.alarms.clearAll()
        url=autovisitlinks[0];
        if(typeof allvars.autovisit_total !== 'undefined'){
          LS.setItem('autovisit_processed', Math.max(0, (allvars.autovisit_total||0) - autovisitlinks.length));
        }
        LS.setItem('autovisit_current', url);
        LS.setItem('autovisit_current_emails', 0);
        url = (url.indexOf('://') === -1) ? 'http://' + url : url;
        chrome.tabs.get(autovisittab,function(avt){
          if (!chrome.runtime.lastError) {
            autovisittab=avt.id;
            chrome.tabs.update(autovisittab,{url:url},function(w){chrome.alarms.create("autovisitcontinuealarm",{when:Date.now() + 15000});});
          }else{}
        });
      }else if(isdemo){
        isdemo=false;
        LS.setItem('isdemo',false);
        if(autovisittab>0){
          chrome.tabs.create({url: upgradeUrl(localtoken)}, function (tab) {});
          chrome.tabs.update(autovisittab,{url:"data:text/csv;base64,"+btoa(demostring)},function(){chrome.alarms.create("autovisitcontinuealarm",{when:Date.now() + 15000});});
        }
      }else{
        finishAutomation();
      }
    });

});

// Called when an automation run reaches the end of its URL queue.
// Closes the scraping window, resets the run pointers and flags the run as
// completed so the popup can show the "done + download" screen instead of just
// snapping back to the empty form. The email/total counters are intentionally
// left untouched so the summary can display them.
function finishAutomation(){
  // Grab the window/tab ids before we clear them.
  var tabId = autovisittab;
  var winId = autovisitwindow;
  autovisittab=-1;
  autovisitwindow=-1;
  LS.setItem('autovisittab',-1);
  LS.setItem('autovisitwindow',-1);
  LS.setItem('autovisit_current','');
  LS.setItem('autovisit_completed', true);
  chrome.action.setBadgeText({text: ''});
  chrome.action.setBadgeBackgroundColor({ color: [0, 0, 0, 255] });
  // Keep the automation window open and show the results page inside it, so the
  // user sees the summary right away instead of having to reopen the popup.
  var completeUrl = chrome.runtime.getURL('complete.html');
  if(tabId && tabId>0){
    chrome.tabs.update(tabId,{url:completeUrl, active:true}, function(){
      if(chrome.runtime.lastError && winId>=0){chrome.tabs.create({windowId:winId, url:completeUrl}, function(){});}
      if(winId>=0){chrome.windows.update(winId,{focused:true}, function(){if(chrome.runtime.lastError){}});}
    });
  }else if(winId>=0){
    chrome.tabs.create({windowId:winId, url:completeUrl}, function(){
      chrome.windows.update(winId,{focused:true}, function(){if(chrome.runtime.lastError){}});
    });
  }
}
// Show a "zzz" badge for `seconds`, then restore the badge and run `done`.
// (Replaces the old synchronous busy-wait that froze the service worker.)
function slowPause(seconds, done){
  chrome.action.setBadgeBackgroundColor({ color: [255, 0, 0, 255] });
  chrome.action.setBadgeText({text: 'zzz'});
  setTimeout(function(){
    chrome.action.setBadgeBackgroundColor({ color: [0, 0, 255, 255] });
    chrome.action.setBadgeText({text: ''});
    if(typeof done === "function"){done();}
  }, seconds*1000);
}
async function postData(url = '', data = {}) {
  // Default options are marked with *
  
  const response = await fetch(url, {
    method: 'POST', // *GET, POST, PUT, DELETE, etc.
    mode: 'cors', // no-cors, *cors, same-origin
    cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
    credentials: 'omit', // include, *same-origin, omit
    headers: {
      //'Content-Type': 'application/json'
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    redirect: 'follow', // manual, *follow, error
    referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
    //body: JSON.stringify(data) // body data type must match "Content-Type" header
    body: data
  });
  const responsebody = await response.text(); // Parse it as text
  try {
    const validresponse = JSON.parse(responsebody); // Try to parse it as JSON
    return validresponse;
  } catch(err) {
    return responsebody;
  }
}
// Which lists a save files into, out of a storage snapshot. Stored as an array since the picker
// went multi-select; `savelistid` is what an earlier build left behind and reads as the
// one-element case, so an upgrade keeps whatever list the user had chosen.
function savedListIds(vars){
  if(Array.isArray(vars.savelistids)){
    return vars.savelistids.filter(function(id){return typeof id === "string" && id;});
  }
  return (typeof vars.savelistid === "string" && vars.savelistid) ? [vars.savelistid] : [];
}
// Maps the extension's internal method names to the backend's clean routes.
const BACKEND_PATHS = {
    autosavesubscriber: "/api/subscription/status",
    autosavemails: "/api/emails",
    stats: "/api/stats",
};
function sendData(method, payload, callback)
{
    url=BACKEND_BASE + (BACKEND_PATHS[method] || ("/extension/" + method));
    postData(url, payload)
    .then(result => {
      if(typeof(callback)=="function"){callback(result);}
    })
    // A dropped request must still reach the callback, as null rather than as an unhandled
    // rejection, so callers can tell "the backend said no" from "the backend said nothing".
    .catch(() => {
      if(typeof(callback)=="function"){callback(null);}
    });
}

function getRandomToken() {
    var randomPool = new Uint8Array(32);
    crypto.getRandomValues(randomPool);
    var hex = '';
    for (var i = 0; i < randomPool.length; ++i) {hex += randomPool[i].toString(16);}
    return hex;
}
function getUserInfo(rested,callback) {
    if(typeof rested === "undefined"){rested=false;}
    chrome.storage.local.get(function (fetch) {
      if(!localtoken || localtoken==""){
        if(typeof fetch.localtoken === "undefined"){
          localtoken=getRandomToken(); //Generate Token
          chrome.storage.local.set({'localtoken': localtoken}); //Saves token in local Storage
        }else{
          localtoken=fetch.localtoken; //Get token from Local Storage
        }
      }
      if(!version || version==""){
        if(typeof fetch.version === "undefined"){
          version=chrome.runtime.getManifest().version; //Get version
          chrome.storage.local.set({'version': version}); //Saves version in local Storage
        }else{
          version=fetch.version; //Get version from Local Storage
        }
      }
      if(rested){result= "token=" + localtoken + "&version="+version;}
      else result= {localtoken: localtoken, version: version};
      if(typeof(callback)=="function"){callback(result);}
      return result;
    });

}
// Persist optional subscription metadata returned by /api/subscription/status.
// If the backend doesn't send these fields (older API), the popup simply omits them.
function storePlanInfo(data){
  if(typeof data !== "object" || data === null){return;}
  if(typeof data["plan"] !== "undefined"){chrome.storage.local.set({'plan': data["plan"]});}
  if(typeof data["emails_collected"] !== "undefined"){chrome.storage.local.set({'emails_collected': data["emails_collected"]});}
  // Whether the linked account owns the Email Verifier add-on. Independent of the extractor
  // subscription, so it's stored straight from the status response on every refresh (older
  // APIs omit it, leaving the popup to treat verification as unavailable).
  if(typeof data["canVerify"] !== "undefined"){chrome.storage.local.set({'canVerify': !!data["canVerify"]});}
  // Linked Mailsumo account (name/email/image), or null once the backend reports the
  // token is anonymous. The popup shows this in place of the raw token, like the Finder.
  if(typeof data["account"] !== "undefined"){chrome.storage.local.set({'account': data["account"] || null});}
  // The account's custom lead lists, so the popup can offer extra save targets (every save
  // lands in the account's Extractor list regardless). Empty for an anonymous token: there is
  // no account to hold lists.
  if(typeof data["lists"] !== "undefined"){
    var lists = Array.isArray(data["lists"]) ? data["lists"] : [];
    chrome.storage.local.set({'lists': lists});
    // Forget lists that no longer exist (renamed is fine, deleted is not), so the picker can't
    // keep pointing at something the backend would silently ignore.
    chrome.storage.local.get(['savelistids', 'savelistid'], function(cur){
      var ids = savedListIds(cur || {});
      if(!ids.length){return;}
      var live = ids.filter(function(id){
        return lists.some(function(l){return l && l.id === id;});
      });
      if(live.length !== ids.length){chrome.storage.local.set({'savelistids': live});}
    });
  }
  // Saving is unmetered now; drop whatever allowance an older build cached so nothing in the
  // popup can still read one.
  chrome.storage.local.remove('leads');
}
// /api/subscription/status answers with { active: boolean }. postData() hands back a raw
// string whenever the response is not JSON (backend down, HTML error page, a proxy or
// captive portal in the way), so "no usable answer" has to be told apart from a genuine
// "not subscribed": treating the former as the latter silently switches Autosave off for
// paying users every time the service worker restarts.
function knowsPaidState(data){
  return typeof data === "object" && data !== null && typeof data["active"] !== "undefined";
}
// Callback for the autosave POST. Its `active` answers "was this stored", which is a weaker
// question than "is this install subscribed", so it may only ever upgrade the paid state,
// never revoke it. Letting it revoke is what made a single endpoint disagreeing about
// entitlement switch Autosave off on the user mid-session. Genuine downgrades still land:
// /api/subscription/status is re-checked on every service worker start and popup open, and
// the server refuses to store for an unentitled token whatever the extension believes.
function verifyaccount(data)
{
  if(knowsPaidState(data) && data["active"]){
    setpaid(data);
  }
}
function setpaid(data){
  // Unknown state: leave whatever the user already had rather than downgrading them.
  if(!knowsPaidState(data)){return;}
  storePlanInfo(data);
  if(data["active"]){autosavepay=true;chrome.storage.local.set({'autosavepay': true});}
  else{autosavepay=false;chrome.storage.local.set({'autosavepay': false});autosaveenabled=false;chrome.storage.local.set({'autosaveenabled': false});chrome.storage.local.set({'plan': ''});chrome.storage.local.set({'emails_collected': ''});}
  // Push it to any open popup. The popup draws its paid/free chrome from the cached flag in
  // storage the instant it opens, which is before this answer gets back, so without a nudge
  // a subscriber with a stale cache stares at the upgrade button until they reopen it.
  chrome.runtime.sendMessage({"message":"accountData","data":data}, function (response){if (!chrome.runtime.lastError) {} else {}});
}
// Answers the popup's Autosave toggle when the cached paid flag says "free", which is also
// the state a subscriber lands in before the first status refresh has come back. Confirming
// the subscription is not enough: the user asked for Autosave, so turn it on too, otherwise
// the toggle reads as on while the saveautosave handler keeps dropping every page.
function chkpaid(data){
  if(!knowsPaidState(data)){announceAutosaveState();return;}
  storePlanInfo(data);
  var active = !!data["active"];
  autosavepay = active;
  autosaveenabled = active;
  chrome.storage.local.set({'autosavepay': active, 'autosaveenabled': active});
  if(!active){chrome.tabs.create({url: upgradeUrl(localtoken)}, function (tab) {});}
  announceAutosaveState();
}
// Tell the popup where Autosave actually landed. The popup used to infer this from a copy
// of the flags taken when it opened, on a 2 second timer, so a subscription confirmed in
// the meantime was never seen and the toggle snapped back off.
function announceAutosaveState(){
  chrome.runtime.sendMessage({"message":"autosaveState","enabled":autosaveenabled,"pay":autosavepay}, function (response){if (!chrome.runtime.lastError) {} else {}});
}
function changetoken(data, token){
  storePlanInfo(data);
  if(data["active"]){
    chrome.storage.local.set({'localtoken': token});
    chrome.storage.local.set({'autosavepay': true});
    chrome.runtime.reload();
  }
  else{chrome.tabs.create({url: upgradeUrl(localtoken)}, function (tab) {});}
}
function truefalse(input){
  if(input==="false"||input===false){return false;}
  if(input==="true"||input===true){return true;}
}
//getUserInfo();
// Always refresh subscription status on startup: besides paid-state, this is how we learn
// whether the install token has been claimed by a Mailsumo account (so the popup can show
// the connected account and hide the raw token). setpaid() persists both.
getUserInfo(false,function(result){sendData("autosavesubscriber","token=" + result.localtoken + "&version=" + result.version,setpaid);})

//Launch explanation page on extension install
chrome.runtime.onInstalled.addListener(function(details){
    if(details.reason == "install"){
        // This clear races the initializer above and usually wins, which left a brand-new
        // install with no `extensionenabled` at all: the popup opened showing Active as off
        // while the worker still believed it was on. Re-seed once the wipe is done.
        chrome.storage.local.clear(function() {
          var error = chrome.runtime.lastError;
          if (error) {}
          seedDefaults();
        });
        // Post-install welcome on the product's own marketing site (site-extractor), consistent
        // with Mail Finder and Mail Tracker. The legacy /install page (served by the app) stays
        // for older published builds that still hardcode it.
        chrome.tabs.create({url: SITE_BASE + "/welcome"}, function (tab) {});
    }else if(details.reason == "update"){
        var thisVersion = chrome.runtime.getManifest().version;
        LS.setItem('autovisitwindow',-1);
        LS.setItem('autovisittab',-1);
        if(details.previousVersion!=thisVersion){
            getUserInfo(false,function(result){
              sendData("autosavesubscriber","token=" + result.localtoken + "&version=" + result.version,setpaid);
            });
        }
    }
});
