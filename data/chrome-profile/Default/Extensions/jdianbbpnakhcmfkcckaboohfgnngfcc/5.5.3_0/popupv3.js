/*
    Email Extractor - popup script
*/
// Base URLs come from config.js (MS_URLS), which selects production vs the local
// dev stack at runtime. Fall back to production hosts if config.js failed to load.
const BACKEND_BASE = (typeof MS_URLS !== "undefined" && MS_URLS.backend) || "https://email-extractor.io";
// The Mailsumo dashboard, where saved addresses are listed and verified. The extension
// itself holds only an anonymous install token, so anything that needs an account (the
// Emails view, bulk verification) is a link out rather than a call from here.
const APP_BASE = (typeof MS_URLS !== "undefined" && MS_URLS.app) || "https://app.mailsumo.io";

// Every "this needs a paid plan" button leads to the one Mailsumo Upgrade page, shared by
// all four products: it sells Email Extractor first, since that is what the user is
// holding, but also the Suite and the other tools. The install token rides along so it can
// still be bought in one click, with no account. Managing an existing subscription is a
// different destination (see #subscriptionlink): the account's Mailsumo billing page, which
// lists every plan, invoice and cancel control now that the extension links to an account.
function upgradeUrl(token){
    return APP_BASE + "/upgrade?product=extractor&token=" + encodeURIComponent(token || "");
}

// The Verify button's paywall. Verification is the Email Verifier add-on, a separate plan
// from Extractor Premium, so free users are sent to the page that sells that tool.
function verifierUpgradeUrl(token){
    return APP_BASE + "/upgrade?product=verifier&token=" + encodeURIComponent(token || "");
}

// Point the static header/footer links (rendered in popup.html) at the current
// environment. The script runs at the end of <body>, so these elements exist.
(function applyEnvLinks(){
    if(typeof MS_URLS === "undefined"){ return; }
    var u = MS_URLS;
    var dash = document.getElementById("dashboardBtn");
    if(dash){ dash.href = u.app + "/leads?list=extractor"; }
    var home = document.querySelector(".ms-home");
    if(home){ home.href = u.brand; }
    var tracker = document.getElementById("productTracker");
    if(tracker){ tracker.href = u.tracker; }
    var finder = document.getElementById("productFinder");
    if(finder){ finder.href = u.finder; }
    ["downloadform", "downloadformxls"].forEach(function(id){
        var f = document.getElementById(id);
        if(f){ f.action = u.backend + "/api/emails/export"; }
    });
})();
var bg=null;

// The Mailsumo app itself (e.g. the Leads page) is never scanned: the dashboard lists the
// user's own saved addresses, so extracting there would just loop them back into autosave.
// The content script already stays inert on this host; this mirrors the same check so the
// popup shows an explicit "off here" state instead of stale emails from a previously
// scanned page. App host comes from config.js (MS_URLS), so it follows dev vs prod.
// Set once we know the active tab is the Mailsumo app, so the async extensionInit/onDomReady
// replies (which otherwise repaint the "refresh to capture" prompt) keep the blocked state.
var eeActiveTabBlocked = false;
function eeHostBlocked(urlString){
    if(!urlString){ return false; }
    var host;
    try { host = new URL(urlString).host; } catch(e){ return false; }
    var appHosts = {};
    try {
        if(typeof MS_URLS !== "undefined"){
            ["app","backend"].forEach(function(key){
                if(MS_URLS[key]){ appHosts[new URL(MS_URLS[key]).host] = true; }
            });
        }
    } catch(e){ /* fall through to hardcoded host */ }
    appHosts["app.mailsumo.io"] = true;
    return appHosts[host] === true;
}

// The active tab's URL, captured when the popup opens. Stored emails live in a single
// global key (_saveMailList) that reflects whichever page was scanned last, anywhere.
// On hosts where the auto-scanner is inert (messenger.com, youtube.com, …) storage keeps
// the previous site's emails until a manual scan lands, so without this the popup would
// show another page's addresses. We only render stored emails when they belong to the
// tab you're looking at.
var eeActiveTabUrl = "";
function eeSameHost(a, b){
    if(!a || !b){ return false; }
    try { return new URL(a).host === new URL(b).host; } catch(e){ return false; }
}

// Is the last scan in storage one an automation run produced? A run owns its own window, so
// the host check above can never hold for it, and while it is running (or has just finished,
// before the completion screen is dismissed) its pages are what the user wants to see.
function eeAutomationOwnsScan(vars){
    if(!vars){ return false; }
    if(vars.autovisittab > 0){ return true; }
    return vars.autovisit_completed === true || vars.autovisit_completed === 'true';
}

// Ask the content script of the active tab to rescan the page, then refresh the list.
chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if(!tabs || !tabs[0]){return;}
    eeActiveTabUrl = tabs[0].url || "";
    if(eeHostBlocked(tabs[0].url)){ eeActiveTabBlocked = true; renderBlockedState(); return; }
    chrome.tabs.sendMessage(tabs[0].id, {message: "capture"}, function (response){
        if (chrome.runtime.lastError) {/* no content script on this page (e.g. chrome://) */}
        chrome.storage.local.get(function (fetch) {
            chrome.runtime.sendMessage({"message":"get_bg_vars","callback":"fetchingEmailsAndCount","variables":{fetch:fetch}}, function (response){if (!chrome.runtime.lastError) {} else {}});
        });
    });
});
function backgroundmanagerfunction(returnfunction){
    chrome.runtime.sendMessage({"message":"get_bg_vars","callback":returnfunction}, function (response){if (!chrome.runtime.lastError) {} else {}});    
}
backgroundmanagerfunction("extensionInit");
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message === 'got_bg_vars' || request.message === 'extensionInit') {
        bg=request.vars;
        // Absent means on: the worker's own default. Storage can be missing the key on a
        // profile that has never written it, and reading that as "off" would show an Active
        // toggle that contradicts what the worker is doing.
        if(typeof bg.extensionenabled === "undefined"){ bg.extensionenabled = true; }
        if(bg.extensionenabled){
            $("#chkextensionenabled").prop('checked', true);
            $('#wrapper').show();
            $('html').css('height',"599px");
            renderRefreshState();
        }else{
            $("#chkextensionenabled").prop('checked', false);
            $('#wrapper').hide();
            $('html').css('height',"54px");
        }
        updateRatingFooter();
        sendResponse(true);
        return true;
    }else if (request.message === 'onDomReady') {
        bg=request.vars;
        if (bg==null){chrome.runtime.reload();}

        if (bg!==null){
            fullToken = bg.localtoken || "";
            $('#subscriptionlink').attr("href", APP_BASE + "/billing");
            $('#upgradeCloud').attr("href", upgradeUrl(bg.localtoken));
            $('#accountCard').attr("href", APP_BASE + "/account");
            $('#currenttoken').text(maskToken(fullToken));
            $('#localtoken').val(fullToken);
            $('#localtokenxls').val(fullToken);
            setPlanStatus(bg);
            setCloudCard(bg);
            setAccountCard(bg);

            applyPaidState(bg.autosavepay);
            if(bg.autosavepay && bg.autosaveenabled){$("#chkautosave").prop('checked', true);enableautovisit(true);}
            updateAutosaveStatus();

            $("#trydemo").off("click").on("click",function(){
                $('#autovisitlinks').val("https://carlosmdh.es/en/contactar/\nhttps://orestbida.com/contact/\nhttps://www.horsetelex.com/horses/pedigree/118887/contact-me\nhttps://www.blackfemaletherapists.com/directory/listing/dr-markie-silverman/\nhttp://altkie.com/\nhttps://www.avc.edu/administration/marketing/contact\nhttps://www.stanbridge.edu/contact\nhttps://www.stowers.org/scientists/jennifer-gerton");
                isdemo=true;
                window.setTimeout(function(){$('#autovisitbutton').click();},500);
            });
            if(bg.slowenabled){$("#chkslow").prop('checked', true);}
        }
        sendResponse(true);
        return true;
    }else if (request.message === 'autosaveState') {
        // The background finished checking the subscription behind the Autosave toggle.
        // This is the authoritative answer, so mirror it onto the toggle and refresh the
        // cached copy the rest of the popup reads.
        if(bg){bg.autosaveenabled=request.enabled;}
        $("#chkautosave").prop('checked', !!request.enabled);
        applyPaidState(request.pay);
        if(request.pay){setPlanStatus(bg);}
        else{$('#viewtokenchange').show();}
        enableautovisit(!!request.enabled);
        if(request.enabled){recaptureActiveTab();}
        updateAutosaveStatus();
        sendResponse(true);
        return true;
    }else if (request.message === 'fetchingEmailsAndCount') {
        bg=request.vars;
        var showEmails = request.variables.fetch._saveMailList;
        var showEmailCount = request.variables.fetch._emailsFound;
        var currentUrl = request.variables.fetch._currentUrl;

        // The stored emails belong to whatever page was scanned last. If that isn't the tab
        // you're on (e.g. you moved to a page the content script can't reach and no fresh
        // scan has overwritten storage yet), don't surface the other page's addresses.
        //
        // An automation run is the exception: it scans in a window of its own, so its pages
        // never match the tab this popup opened over and the check blanked every address the
        // run had just found, along with the Save and copy actions that read the list.
        if(!eeAutomationOwnsScan(bg) && !eeSameHost(currentUrl, eeActiveTabUrl)) {
            showEmails = "None Found";
            showEmailCount = "0";
            currentUrl = eeActiveTabUrl;
        }

        if(showEmails == undefined || showEmails=="") {
            showEmails = "None Found"
        }

        if(showEmailCount == undefined) {
            showEmailCount = "0";
        }

       if(bg.extensionenabled){
            $("#popuptitle").html(countHeaderHtml(showEmailCount));
            $("#showCurrentUrl").html(currentUrl);
            renderEmailList(showEmails);
        }

        sendResponse(true);
        return true;
    }else if (request.message === 'autovisitrefresh'){
        bg=request.vars;
        if(bg.localtoken){ fullToken = fullToken || bg.localtoken; }
        var urls=bg.autovisitlinks;
        var total = bg.autovisit_total || 0;
        var processed = bg.autovisit_processed || 0;
        var current = bg.autovisit_current || '';
        var emailsOnPage = bg.autovisit_current_emails || 0;

        $('#autovisitlinks').val(urls.join("\n"));
        var showautovisittext="<span>Automate";
        if(urls.length>0){showautovisittext+= " (" + urls.length + ")";}
        showautovisittext+="</span>";
        $('#automationlabel').html(showautovisittext);
        if(bg.autovisitwindow!=-1){
            $('#autovisitlinks').attr("disabled","disabled"); 
            $('#autovisitdisabled').hide();
            $('#autovisitlaunch').hide();
            $('#autovisitstop').show();
            // Show blocking overlay with progress
            $('#automationOverlay').show();
            if(current && typeof current === 'string'){
                try {
                    var hostname = (new URL(current.indexOf('://')===-1 ? ('http://' + current) : current)).hostname;
                    $('#acAnalyzingValue').text(hostname);
                } catch(e) {
                    $('#acAnalyzingValue').text(current);
                }
            } else {
                $('#acAnalyzingValue').text('\u2014');
            }
            $('#acProgressValue').text(processed + ' / ' + total);
            // Update circular progress percent
            try{
                var pct = total>0 ? Math.floor((processed/total)*100) : 0;
                $('#progressPercent').text(pct + '%');
                var circumference = 326.72; // 2 * PI * r (r=52)
                var offset = circumference - (pct/100)*circumference;
                $('#progressCircle').attr('stroke-dashoffset', offset);
            }catch(e){}
            var totalEmails = (bg.autovisit_emails_total || 0);
            $('#acEmailsValue').text(totalEmails);
            // Pending queue textarea
            try {
                // 'urls' coming from bg.autovisitlinks already contains the remaining queue.
                var queue = Array.isArray(urls) ? urls : [];
                $('#automationQueue').val(queue.join('\n'));
                $('#automationQueueCount').text(queue.length);
            } catch(e) { $('#automationQueue').val(''); $('#automationQueueCount').text('0'); }
            autovisitrefreshtimer=window.setTimeout(autovisitrefresh,1000);
        }else{
            $('#autovisitlinks').removeAttr("disabled"); 
            $('#autovisitlaunch').show();
            $('#autovisitstop').hide();
            $('#autovisitdisabled').hide();
            // Hide the scanning overlay when not running
            $('#automationOverlay').hide();
            $('#automationQueue').val('');
            window.clearTimeout(autovisitrefreshtimer);
            // If a run just finished, show the completion screen instead of
            // snapping straight back to the empty URL form.
            var completed = (bg.autovisit_completed === true || bg.autovisit_completed === 'true');
            if(completed){
                var runRows = Array.isArray(bg.autovisit_run_rows) ? bg.autovisit_run_rows : [];
                $('#acEmailsFound').text(runRows.length);
                $('#acWebsitesScanned').text(bg.autovisit_total || 0);
                $('#automationComplete').show();
            }else{
                $('#automationComplete').hide();
            }
        }
        sendResponse(true);
        return true;
    }else if (request.message === 'showsubscriptiondata'){
        bg=request.vars;
        // Straight from the manifest, not from the storage copy the background keeps: that copy
        // is wiped by the fresh-install storage clear and only rewritten when the service worker
        // next starts, which showed "Version undefined" for the whole first session.
        var version=chrome.runtime.getManifest().version;
        fullToken = bg.localtoken || fullToken;
        $('#accountCard').attr("href", APP_BASE + "/account");
        $('#currenttoken').text(maskToken(fullToken));
        $('#localtoken').val(fullToken);
        $('#localtokenxls').val(fullToken);
        setPlanStatus(bg);
        setCloudCard(bg);
        setAccountCard(bg);
        $('#versionnumber').text("Version " + version);
        $("#subscriptiondata").fadeIn(400);
        sendResponse(true);
        return true;
    }else if (request.message === 'accountData'){
        // Fresh subscription/account status from the server (see showSettings' refresh).
        if(request.data && typeof request.data === 'object'){
            bg = bg || {};
            if(typeof request.data.plan !== 'undefined'){ bg.plan = request.data.plan; }
            if(typeof request.data.emails_collected !== 'undefined'){ bg.emails_collected = request.data.emails_collected; }
            if(typeof request.data.account !== 'undefined'){ bg.account = request.data.account; }
            if(typeof request.data.canVerify !== 'undefined'){ bg.canVerify = !!request.data.canVerify; }
            // The lists ride along on the same status answer. Without this, the first open
            // after connecting shows the picker (the account just arrived) but with the stale
            // pre-login lists, and the user's own lists only turn up on the next open.
            if(Array.isArray(request.data.lists)){ bg.lists = request.data.lists; }
            // Authoritative, so re-apply the whole paid/free UI and not just the settings
            // cards. Anything drawn from the cached flag when the popup opened (the upgrade
            // button, the rating strip, the Autosave toggle's handler) is corrected here.
            applyPaidState(request.data.active);
            setPlanStatus(bg);
            setCloudCard(bg);
            setAccountCard(bg);
        }
        sendResponse(true);
        return true;
    }else if (request.message === 'enableautovisit'){
        bg=request.vars;
        enableautovisitafter(request.variables.status,bg);
        sendResponse(true);
        return true;
    }else if (request.message === 'executecopy'){
        bg=request.vars;
        var text=request.variables.text;
        var input = document.createElement('textarea');
        document.body.appendChild(input);
        if(!bg.autosavepay){text += "\n\nUpgrade the extension to autosave and automate your emails ID capture.";}
        input.value = text;
        input.focus();
        input.select();
        document.execCommand('Copy');
        input.remove();
        var data={"url": $('#showCurrentUrl').html()}
        chrome.runtime.sendMessage(chrome.runtime.id,{options: "stats", "event": "copy", "data": data}, function(response) {if (!chrome.runtime.lastError) {} else {}});

        sendResponse(true);
        return true;
    }else if (request.message === 'autovisitbutton'){
        bg=request.vars;
        //If client did not pay, open the upgrade page directly and do not start scraping.
        if(!bg.autosavepay&&!isdemo){
            chrome.tabs.create({url: upgradeUrl(bg.localtoken)}, function (tab) {});
            sendResponse(true);
            return true;
        }

        var urls=$('#autovisitlinks').val().split('\n').map(function(s){return s.trim();}).filter(function(s){return s.length>0;});
        if(urls.length<1){ sendResponse(true); return true; }
        chrome.windows.create({"width":800,"height":600,"type":"popup","focused":true},function(autovisitwindow){
            chrome.runtime.sendMessage(chrome.runtime.id,{options: "autovisitnavigate", urls:urls, autovisitwindow:autovisitwindow.id, isdemo:isdemo}, function(response) {autovisitrefresh();});
            isdemo=false;
        });
        if(urls.length>=1){
            $('#autovisitlinks').attr("disabled","disabled"); 
            $('#autovisitdisabled').hide();
            $('#autovisitlaunch').hide();
            $('#autovisitstop').show();
        }else{
            $('#autovisitlinks').removeAttr("disabled"); 
            $('#autovisitlaunch').show();
            $('#autovisitdisabled').hide();
            $('#autovisitstop').hide();
        }
        sendResponse(true);
        return true;
    }else if (request.message === 'autovisitbuttonstop'){
        bg=request.vars;
        chrome.windows.get(bg.autovisitwindow,function(w){if (!chrome.runtime.lastError) {chrome.windows.remove(w.id,function(){});} else {}});
        $('#autovisitlinks').removeAttr("disabled"); 
        $('#autovisitlaunch').show();
        $('#autovisitdisabled').hide();
        $('#autovisitstop').hide();
            $('#autovisitdisabled').hide();
            // Hide overlay when not running
            $('#automationOverlay').hide();
            $('#automationQueue').val('');
        window.clearTimeout(autovisitrefreshtimer);
        sendResponse(true);
        return true;
    }else if (request.message === 'autovisitbuttondisabled'){
        bg=request.vars;
        if(!bg.autosavepay){
            chrome.tabs.create({url: upgradeUrl(bg.localtoken)}, function (tab) {});
        }
        sendResponse(true);
        return true;
    }else if (request.message === 'extensiononoff'){
        bg=request.vars;
        var enable = !bg.extensionenabled;
        chrome.runtime.sendMessage(chrome.runtime.id,{options: "extensionenable", enable: enable}, function(response) {if (!chrome.runtime.lastError) {} else {}});
        bg.extensionenabled = enable;
        if(enable){
            $("#chkextensionenabled").prop('checked', true);
            $('#wrapper').show();
            $('html').css('height',"599px");
            renderRefreshState();
            updateRatingFooter();
        }else{
            $("#chkextensionenabled").prop('checked', false);
            $('#wrapper').hide();
            $('html').css('height',"54px");
            $('body').addClass('no-footer');
        }
        sendResponse(true);
        return true;
    }else if (request.message === 'showEmailscopy'){
        bg=request.vars;
        var data={"url": $('#showCurrentUrl').html()}
        chrome.runtime.sendMessage(chrome.runtime.id,{options: "stats", "event": "copy-keys", "data": data}, function(response) {if (!chrome.runtime.lastError) {} else {}});

        if(!bg.autosavepay){
            event.preventDefault();
            executeCopy(window.getSelection());
        }
        sendResponse(true);
        return true;
    }
    return;

});
var autovisitrefreshtimer;
$('.ratestar').on('mouseover',function(e){
    e.preventDefault();
    e.stopPropagation()
    var stars=document.querySelectorAll(".ratestar");
    var selectedstar=0;
    for(i=0;i<stars.length;i++){
        if (stars[i]===this){selectedstar=i;}
    }
    for(i=0;i<stars.length;i++){
        stars[i].className="ratestar";
        if(i<=selectedstar){stars[i].className+=" on";}
    }
});
$('.ratestar').on('click',function(e){
    e.preventDefault();
    e.stopPropagation()
    var stars=document.querySelectorAll(".ratestar");
    var selectedstar=0;
    for(i=0;i<stars.length;i++){if (stars[i]===this){selectedstar=i;}}
    selectedstar=selectedstar+1;
    // Collapse the footer so its space is reclaimed (no empty grey strip).
    $('body').addClass('no-footer');
    chrome.runtime.sendMessage(chrome.runtime.id,{options: "rated"}, function(response) {
        if(selectedstar>=4){
            window.open("https://chrome.google.com/webstore/detail/jdianbbpnakhcmfkcckaboohfgnngfcc/reviews","_blank");
        }
    });
});
$('.ratestars').on('mouseover',function(e){
    e.preventDefault();
    e.stopPropagation()
    var stars=document.querySelectorAll(".ratestar");
    var selectedstar=0;
    for(i=0;i<stars.length;i++){
        stars[i].className="ratestar";
    }
});
var isdemo;
if(!isdemo){isdemo=false;}

//Function To Replace <br> Or <br /> to \r\n
function br2nl(str) {
    return str.replace(/<br\s*\/?>/mg,"\r\n");
}

// Full (unmasked) token, kept in memory for copy + cloud export.
var fullToken = "";

function escapeHtml(str){
    return String(str)
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#39;");
}

// Build the Extract-tab header: an accent count badge + a pluralized label.
function countHeaderHtml(count){
    var n=parseInt(count,10);
    if(isNaN(n)||n<0){n=0;}
    var zeroClass=(n===0)?" is-zero":"";
    var label=(n===1)?"email found on this page":"emails found on this page";
    return '<span class="ee-count-num'+zeroClass+'">'+n+'</span>'
         + '<span class="ee-count-label">'+label+'</span>';
}

// Turn the stored "<br>"-joined email blob into a clean array.
function parseEmails(html){
    if(!html){return [];}
    return String(html)
        .split(/<br\s*\/?>/i)
        .map(function(s){return s.replace(/&nbsp;/gi," ").trim();})
        .filter(function(s){return s.length>0 && s!=="None Found";});
}

function maskToken(token){
    if(!token){return "";}
    if(token.length<=14){return token;}
    return token.slice(0,6) + "…" + token.slice(-5);
}

// Build the single checkbox list. Every email is checked by default.
function renderEmailList(html){
    var emails=parseEmails(html);
    if(emails.length===0){renderEmptyState();return;}
    var rows="";
    for(var i=0;i<emails.length;i++){
        var esc=escapeHtml(emails[i]);
        rows+='<label class="email-row"><input type="checkbox" class="mailselectchk" checked value="'+esc+'"><span class="email-addr" title="'+esc+'">'+esc+'</span><span class="email-badge" aria-live="polite"></span>'
            +'<span class="email-save" role="button" tabindex="0" title="Save this email to your cloud" aria-label="Save this email to your cloud">'
            +'<svg class="es-icon es-save" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>'
            +'<svg class="es-icon es-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            +'</span></label>';
    }
    $('#emailEmpty').hide().text("");
    $('#emailList').html(rows).show();
    $('#listHeader').css('display','flex');
    $('#selectAllChk').prop('checked',true).prop('indeterminate',false);
    syncSelection();
    // Fresh rows: let the backend tell us which are already in the user's leads so those show
    // an "already saved" marker rather than a Save button.
    savedStatusSignature = "";
    markSavedEmails();
}

function renderEmptyState(){
    $('#emailList').html("").hide();
    $('#listHeader').hide();
    $('#showEmails').html("");
    $('#emailEmpty').text("No emails found on this page. Refresh the page to scan it again.").show();
    setExportEnabled(0);
}

function renderRefreshState(){
    if(eeActiveTabBlocked){ renderBlockedState(); return; }
    $('#emailList').html("").hide();
    $('#listHeader').hide();
    $('#showEmails').html("");
    $('#emailEmpty').text("Refresh the page to capture email IDs.").show();
    setExportEnabled(0);
}

// Shown when the popup is opened on the Mailsumo app itself: the extractor is intentionally
// off there, so make that explicit rather than surfacing whatever was last scanned.
function renderBlockedState(){
    $("#popuptitle").html(countHeaderHtml(0));
    $('#showCurrentUrl').html("");
    $('#emailList').html("").hide();
    $('#listHeader').hide();
    $('#showEmails').html("");
    $('#emailEmpty').text("Email Extractor is turned off on the Mailsumo dashboard.").show();
    setExportEnabled(0);
}

// Keep the hidden #showEmails mirror, the header count, the select-all
// state and the export buttons in sync with the current checkboxes.
function syncSelection(){
    var $chks=$('.mailselectchk');
    var $checked=$chks.filter(':checked');
    var total=$chks.length;
    var n=$checked.length;
    var mirror="";
    $checked.each(function(){mirror+=$(this).val()+"<br>";});
    $('#showEmails').html(mirror);
    $('#selectionCount').text(n+" of "+total+" selected");
    var $all=$('#selectAllChk');
    if(n===0){$all.prop('checked',false).prop('indeterminate',false);}
    else if(n===total){$all.prop('checked',true).prop('indeterminate',false);}
    else{$all.prop('checked',false).prop('indeterminate',true);}
    setExportEnabled(n);
}

// Export actions stay visible at all times; only their enabled state and
// counts change. This fixes the old "buttons disappear" behaviour.
function setExportEnabled(n){
    var enabled=n>0;
    var suffix=enabled?("("+n+")"):"";
    $('#clipboardcopy').removeClass('copied').find('.ea-label').text('Copy');
    $('#clipboardcopy .ea-count').text(suffix);
    $('#exportBtn .ea-count').text(suffix);
    if(!verifyInFlight){ $('#verifyBtn .ea-count').text(suffix); }
    if(!cloudSaveInFlight){ $('#cloudSaveBtn .ea-count').text(suffix); }
    $('.mainfunctionsmenu a.export-action').toggleClass('disabled',!enabled);
}

// Is this install connected to a Mailsumo account? Saving is per-account: a free user needs
// somewhere to save to, and premium tokens still work unclaimed.
function isConnected(){
    return !!(bg && bg.account && bg.account.email);
}

/*
 * What the Save controls do right now:
 *
 *   "save"     premium with Autosave off (with it on, every scan is already stored), or any
 *              connected account. Manual saving is unmetered; the upgrade buys the unattended
 *              kind (Autosave and automation).
 *   "connect"  a fresh install with no account yet. The button is still offered, because
 *              hiding it hides the feature: someone who never opens Settings has no way of
 *              knowing captured emails can go to a dashboard at all. The click asks them to
 *              sign in, which is the one thing standing between them and a save.
 *   ""         nothing to offer: Autosave is already storing every scan.
 */
function saveMode(){
    var premium = !!(bg && bg.autosavepay);
    if(premium){ return $('#chkautosave').prop('checked') ? "" : "save"; }
    return isConnected() ? "save" : "connect";
}

function updateCloudSaveVisibility(){
    var mode = saveMode();

    $('#cloudSaveBtn').toggleClass('is-hidden', mode === "").attr('title', mode === "connect"
        ? "Save these emails to your dashboard: sign in to set it up"
        : "Save the selected emails to your cloud dashboard");
    // Same gate drives the per-row save control; a class on the list keeps renderEmailList
    // agnostic of plan/autosave state (it can repaint at any time).
    $('#emailList').toggleClass('cloud-save-on', mode !== "");
    updateSaveListPicker();
    // Premium may only be confirmed after the list was first painted (stale cache on open),
    // so re-check the already-saved rows once the gate turns on.
    if(mode === "save"){ markSavedEmails(); }
}

// The "Save to" picker next to the tabs: which extra lists captured leads are filed into
// (they always land in the account's Extractor list). It governs every path into the cloud:
// the Save button, the per-row saves, Autosave and automation alike, so it shows whenever the
// install is connected to an account, not just while a manual save is on offer. An anonymous
// install has no lists to pick from and hides it.
function updateSaveListPicker(){
    var connected = isConnected();
    $('#saveListPicker').toggleClass('is-hidden', !connected);
    if(connected){ populateSaveList(); }
}

/*
 * The "Save to" picker: tick any number of your own lists, or create one without leaving the
 * menu. Every save lands in the account's Extractor list regardless (the backend guarantees
 * it), so the picker only offers custom lists: the system lists (Extractor, Finder) aren't a
 * choice to make.
 *
 * Deliberately the same widget as the Mail Finder's (apps/ext-finder/src/lib/list-picker.ts):
 * same markup, same class names, same behaviour, because a lead list means the same thing in
 * both extensions and picking one shouldn't feel like two different products. It's written out
 * again here rather than imported because this extension ships plain files with no bundler.
 */
var HOME_LIST_NAME = "Extractor";
var pickerLists = [];
var pickerSelected = [];
var pickerNaming = false;
var pickerCreating = false;

// The backend already sends custom lists only; the filter also catches a stale cache from an
// older build, and an older backend whose create-list response still includes the system lists.
function onlyCustomLists(lists){
    return (Array.isArray(lists) ? lists : []).filter(function(l){
        return l && (!l.kind || l.kind === "custom");
    });
}

function currentLists(){
    return onlyCustomLists(bg ? bg.lists : []);
}

// Ids in list order, so what gets stored reads the same as what the menu showed.
function pickerSelection(){
    return pickerLists.filter(function(l){ return pickerSelected.indexOf(l.id) !== -1; })
                      .map(function(l){ return l.id; });
}

function buildSaveListPicker(){
    var $root = $('#saveListPicker');
    if($root.children().length){ return; }
    $root.html(
        '<span class="ms-lp-label">Save to</span>' +
        '<button class="ms-lp-trigger" type="button" aria-haspopup="true" aria-expanded="false" title="Saved leads always go to your Extractor list; tick your own lists to add them there too">' +
          '<span class="ms-lp-summary"></span>' +
          '<svg class="ms-lp-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
        '</button>' +
        '<div class="ms-lp-menu" role="dialog" aria-label="Choose lists" hidden>' +
          '<div class="ms-lp-options"></div>' +
          '<div class="ms-lp-hint"></div>' +
          '<div class="ms-lp-sep"></div>' +
          '<button class="ms-lp-new" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg><span>New list</span></button>' +
          '<div class="ms-lp-form" hidden>' +
            '<input class="ms-lp-input" type="text" maxlength="60" placeholder="List name" aria-label="New list name" />' +
            '<div class="ms-lp-actions">' +
              '<button class="ms-lp-btn ms-lp-cancel" type="button">Cancel</button>' +
              '<button class="ms-lp-btn ms-lp-btn-primary ms-lp-save" type="button">Save</button>' +
            '</div>' +
            '<div class="ms-lp-error" hidden></div>' +
          '</div>' +
        '</div>'
    );

    $root.find('.ms-lp-trigger').on("click", function(e){
        e.preventDefault();
        e.stopPropagation();
        setPickerOpen($root.attr('data-open') !== "true");
    });
    // Clicks inside the menu must not reach the document handler that closes it.
    $root.find('.ms-lp-menu').on("click", function(e){ e.stopPropagation(); });
    $root.find('.ms-lp-new').on("click", function(){ setPickerNaming(true); });
    $root.find('.ms-lp-cancel').on("click", function(){ setPickerNaming(false); });
    $root.find('.ms-lp-save').on("click", function(){ submitNewList(); });
    $root.find('.ms-lp-input').on("keydown", function(e){
        if(e.key === "Enter"){ e.preventDefault(); submitNewList(); }
        if(e.key === "Escape"){ e.preventDefault(); setPickerNaming(false); }
    });
}

function setPickerOpen(open){
    var $root = $('#saveListPicker');
    $root.attr('data-open', open ? "true" : "false");
    $root.find('.ms-lp-menu').prop('hidden', !open);
    $root.find('.ms-lp-trigger').attr('aria-expanded', open ? "true" : "false");
    if(!open){ setPickerNaming(false); }
}

function setPickerNaming(naming){
    pickerNaming = naming;
    var $root = $('#saveListPicker');
    $root.find('.ms-lp-form').prop('hidden', !naming);
    $root.find('.ms-lp-new').prop('hidden', naming);
    $root.find('.ms-lp-error').prop('hidden', true);
    if(naming){ $root.find('.ms-lp-input').val("").trigger('focus'); }
}

var LIST_CREATE_ERRORS = {
    too_many: "You have too many lists already.",
    too_long: "That name is too long.",
    empty: "Give the list a name.",
    connect: "Connect your Mailsumo account first."
};

function submitNewList(){
    var $root = $('#saveListPicker');
    var name = ($root.find('.ms-lp-input').val() || "").replace(/\s+/g, " ").trim();
    if(!name || pickerCreating){ return; }
    pickerCreating = true;
    var $save = $root.find('.ms-lp-save').prop('disabled', true).text("Saving…");

    chrome.runtime.sendMessage(chrome.runtime.id, {options:"createlist", name:name}, function(res){
        pickerCreating = false;
        $save.prop('disabled', false).text("Save");
        if(chrome.runtime.lastError || !res){ return showPickerError("Could not create that list."); }
        if(Array.isArray(res.lists)){
            if(bg){ bg.lists = res.lists; }
            pickerLists = onlyCustomLists(res.lists);
        }
        if(!res.ok || !res.list){
            renderPicker();
            return showPickerError(LIST_CREATE_ERRORS[res.error] || "Could not create that list.");
        }
        // Tick the new list rather than switching to it: creating one mid-save adds a grouping,
        // it doesn't undo the ones already chosen.
        if(pickerSelected.indexOf(res.list.id) === -1){ pickerSelected.push(res.list.id); }
        setPickerNaming(false);
        renderPicker();
        persistPickerSelection();
    });
}

function showPickerError(message){
    $('#saveListPicker').find('.ms-lp-error').text(message).prop('hidden', false);
}

function persistPickerSelection(){
    var ids = pickerSelection();
    if(bg){ bg.savelistids = ids; }
    chrome.runtime.sendMessage(chrome.runtime.id, {options:"setsavelist", lists:ids}, function(){
        if(chrome.runtime.lastError){}
    });
}

function renderPicker(){
    var $root = $('#saveListPicker');
    var chosen = pickerLists.filter(function(l){ return pickerSelected.indexOf(l.id) !== -1; });
    var names = chosen.map(function(l){ return l.name; });

    // The summary always starts from the home list, because that's where every save goes;
    // ticked lists read as additions to it.
    var $summary = $root.find('.ms-lp-summary');
    if(names.length === 0){
        $summary.attr('data-default', "true").text(HOME_LIST_NAME)
                .attr('title', HOME_LIST_NAME);
    }else{
        $summary.attr('data-default', "false")
                .text(names.length === 1 ? HOME_LIST_NAME + " + " + names[0] : HOME_LIST_NAME + " +" + names.length)
                .attr('title', [HOME_LIST_NAME].concat(names).join(", "));
    }

    var $options = $root.find('.ms-lp-options').empty();
    pickerLists.forEach(function(l){
        var $box = $('<input>').attr('type', 'checkbox').prop('checked', pickerSelected.indexOf(l.id) !== -1);
        $box.on("change", function(){
            if(this.checked){
                if(pickerSelected.indexOf(l.id) === -1){ pickerSelected.push(l.id); }
            }else{
                pickerSelected = pickerSelected.filter(function(id){ return id !== l.id; });
            }
            renderPicker();
            persistPickerSelection();
        });
        $options.append(
            $('<label>').addClass('ms-lp-option')
                        .append($box, $('<span>').addClass('ms-lp-option-name').text(l.name))
        );
    });

    $root.find('.ms-lp-hint').text(
        names.length === 0 ? "Leads always go to your " + HOME_LIST_NAME + " list. Tick a list to add them there too." :
        names.length === 1 ? "Leads go to " + HOME_LIST_NAME + " and the ticked list." :
        "Leads go to " + HOME_LIST_NAME + " and all " + names.length + " ticked lists."
    );
}

// Refill the picker from the account's lists. Called on every repaint, and drops ticks whose
// list has since been deleted so the summary can't claim a save is going somewhere it isn't.
function populateSaveList(){
    buildSaveListPicker();
    pickerLists = currentLists();
    var remembered = (bg && Array.isArray(bg.savelistids)) ? bg.savelistids
                   : (bg && bg.savelistid) ? [bg.savelistid] : [];
    pickerSelected = remembered.filter(function(id){
        return pickerLists.some(function(l){ return l.id === id; });
    });
    renderPicker();
}

// Anywhere else in the popup, and Escape, dismisses the menu; Escape backs out of the name
// form first so a half-typed list name isn't lost to a stray key.
$(document).on("click", function(){
    if($('#saveListPicker').attr('data-open') === "true"){ setPickerOpen(false); }
});
$(document).on("keydown", function(e){
    if(e.key !== "Escape" || $('#saveListPicker').attr('data-open') !== "true"){ return; }
    if(pickerNaming){ setPickerNaming(false); }else{ setPickerOpen(false); }
});

function updateAutosaveStatus(){
    if($('#chkautosave').prop('checked')){$('#autosaveStatus').css('display','block');}
    else{$('#autosaveStatus').hide();}
    updateCloudSaveVisibility();
}

// The Autosave toggle once the install is known to be paid: there is nothing to check, so
// it just persists the choice in the background. Bound both when the popup opens for a
// subscriber and the moment a subscription is confirmed mid-session, hence the off()/on().
function bindPaidAutosaveToggle(){
    $("#chkautosave").off("change").on("change",function(){
        chrome.runtime.sendMessage(chrome.runtime.id,{options: "setautosave", enabled:this.checked, pay:true}, function(response) {if (chrome.runtime.lastError) {}});
        if(this.checked){$('#viewsubscription').show();$('#viewtokenchange').hide();enableautovisit(true);recaptureActiveTab();}else{enableautovisit(false);}
        updateAutosaveStatus();
    });
}

// The Autosave toggle while the cached flag still says free. That flag may simply be stale
// (a plan bought, or an account claimed, since the last status check), so switching it on
// asks the background to confirm with the backend; the answer arrives as 'autosaveState'
// and is what settles the toggle.
function bindFreeAutosaveToggle(){
    $("#chkautosave").off("change").on("change",function(){
        if(this.checked){
            chrome.runtime.sendMessage(chrome.runtime.id,{options: "chkautosave", information:1, useremail:""}, function(response) {if (chrome.runtime.lastError) {}});
        }else{enableautovisit(false);}
        updateAutosaveStatus();
    });
}

// Every piece of popup chrome that depends on the subscription, in one place, so it can be
// re-applied whenever a fresher answer arrives. This used to be written inline when the
// popup opened and never revisited: the popup reads the cached `autosavepay` out of storage
// while the real status is still in flight, so a subscriber whose cache had drifted kept
// looking at the free-plan chrome (the demo link, the rating strip) for the whole session.
function applyPaidState(paid){
    paid = !!paid;
    if(bg){bg.autosavepay = paid;}
    if(paid){
        $('.opennetwork').hide(); //Clear advertisement
        $('#fetchlinks').show();
        $('#trydemo').hide();
        $('#viewsubscription').show();
        $('#viewtokenchange').hide();
        bindPaidAutosaveToggle();
    }else{
        $('#fetchlinks').hide();
        $('#trydemo').show();
        bindFreeAutosaveToggle();
    }
    updateRatingFooter();
    updateCloudSaveVisibility();
}

// The rating strip is for free users who have not rated yet. For anyone else collapse it,
// so no empty grey band is left at the bottom.
function updateRatingFooter(){
    if(bg && bg.extensionenabled && bg.needtorate && !bg.autosavepay){$('body').removeClass('no-footer');}
    else{$('body').addClass('no-footer');}
}

// Emails are only sent to the cloud as a page is scanned, and the current page was scanned
// before the toggle went on. Rescan it so switching Autosave on saves what is on screen
// right now, which is what the status strip promises.
function recaptureActiveTab(){
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if(!tabs || !tabs[0]){return;}
        if(eeHostBlocked(tabs[0].url)){ return; }
        chrome.tabs.sendMessage(tabs[0].id, {message: "capture"}, function (response){if (chrome.runtime.lastError) {}});
    });
}

function setPlanStatus(bg){
    if(bg && bg.plan){$('#planStatus').text(bg.plan);}
    else{$('#planStatus').text((bg && bg.autosavepay)?"Premium plan":"Free plan");}
}

// Connected-account card: when the install token has been claimed by a Mailsumo account,
// the backend returns { account: { name, email, image } } and we show it in place of the
// raw token — mirroring the Mail Finder popup. Otherwise we fall back to the token card.
function setAccountCard(bg){
    var acct = bg ? bg.account : null;
    var email = (acct && acct.email) ? String(acct.email).trim() : "";
    var name = (acct && acct.name) ? String(acct.name).trim() : "";
    if(acct && email){
        var $img = $('#accountAvatarImg');
        var $ph = $('#accountAvatar');
        var initial = (name || email || "?").charAt(0).toUpperCase();

        if(name){ $('#accountName').text(name).show(); }
        else{ $('#accountName').text("").hide(); }
        $('#accountEmail').text(email);

        // Show the initial immediately, then swap in the real photo only once it has
        // loaded successfully — so a slow or broken avatar URL never flashes as a broken
        // image, and we simply keep the initial when no photo is available.
        $ph.text(initial).show();
        $img.hide().removeAttr('src');
        if(acct.image){
            var url = String(acct.image);
            var pre = new Image();
            pre.onload = function(){ $img.attr('src', url).show(); $ph.hide(); };
            pre.onerror = function(){ /* keep the initial fallback */ };
            pre.src = url;
        }
        $('#accountCard').show();
        $('#connectCard').hide();
        $('#tokenCard').hide();
    }else{
        $('#accountCard').hide();
        $('#connectCard').show();
        $('#tokenCard').show();
        setConnectInvite(bg);
    }
}

// Paying customers who never claimed their install token are the ones we most want on a real
// account: the token is their single point of failure, and it's also how they land back here
// after pasting a recovered token (changetoken reloads the extension). Speak to what they
// already paid for and give the card visual weight so it doesn't read as optional.
function setConnectInvite(bg){
    var premium = !!(bg && bg.autosavepay);
    $('#connectCard').toggleClass('settings-card-invite', premium);
    $('#connectTitlePremium').toggle(premium);
    $('#connectTitleFree').toggle(!premium);
    // "It's free" is the free card's reassurance; a subscriber signing in to keep Premium
    // already paid, so the line would only muddy that message.
    $('#connectSubFree').toggle(!premium);
}

// Cloud card: paid users see their monthly count + downloads, free users
// see an explanation and an upgrade CTA.
function setCloudCard(bg){
    if(bg && bg.autosavepay){
        $('#cloudFree').hide();
        $('#cloudPaid').show();
        var c=bg?bg.emails_collected:undefined;
        if(typeof c!=="undefined" && c!==null && c!==""){
            $('#cloudCount').text("Emails collected this month: "+c);
        }else{
            $('#cloudCount').text("Download all the emails saved to your cloud.");
        }
    }else{
        $('#cloudPaid').hide();
        $('#cloudFree').show();
        // Free but connected: manual saving already works, so lead with what they have rather
        // than with the paywall. Unattended saving is what the upgrade buys.
        if(isConnected()){
            $('#cloudFreeDesc').text(
                "Use Save in the popup to send emails to your dashboard. Upgrade for Autosave and automation, which save every page for you."
            );
        }
    }
}
function enableautovisit(status){
    chrome.runtime.sendMessage({"message":"get_bg_vars","callback":"enableautovisit","variables":{status:status}}, function (response){if (!chrome.runtime.lastError) {} else {}});
}

function enableautovisitafter(status,bg){
    if(bg.autosavepay && $("#chkautosave").prop('checked')){
        if(status){
            $('#autovisitlaunch').show();
            $('#autovisitstop').hide();
            $('#autovisitdisabled').hide();
        }else{
            $('#autovisitlaunch').hide();
            $('#autovisitstop').hide();
            $('#autovisitdisabled').show();
        }
    }else{
        $('#autovisitlaunch').show();
        $('#autovisitstop').hide();
        $('#autovisitdisabled').hide();
    }
}

$("#fetchlinks").on("click", function() {
    chrome.storage.local.get(function (fetch) {
        var showLinks = fetch._saveLinkList;
        $('#autovisitlinks').val(br2nl(showLinks));
    });
});
$("#clipboardcopy").on("click",function(){
    if($(this).hasClass('disabled')){return;}
    var n=$('.mailselectchk:checked').length;
    executeCopy(br2nl($("#showEmails").html()));
    $('#clipboardcopy').addClass('copied').find('.ea-label').text('Copied!');
    $('#clipboardcopy .ea-count').text('');
    window.setTimeout(function(){setExportEnabled($('.mailselectchk:checked').length);},1200);
});
// Selection: single checkbox list, all checked by default.
$(document).on("change", ".mailselectchk", function(){ syncSelection(); });
$(document).on("change", "#selectAllChk", function(){
    var checked=this.checked;
    $('.mailselectchk').prop('checked', checked);
    syncSelection();
});
$('#viewCloudLink').on("click", function(e){
    e.preventDefault();
    chrome.tabs.create({url: APP_BASE + "/leads?list=extractor"});
});
// Verify button. Free users (no Email Verifier add-on) are sent to the upgrade page that
// sells verification; owners verify the selected addresses in place, with a per-row badge
// and a loading state, spending their verifier credits via the backend.
var verifyInFlight = false;
$('#verifyBtn').on("click", function(e){
    e.preventDefault();
    if($(this).hasClass('disabled') || verifyInFlight){ return; }

    // Not entitled → straight to the Verifier upgrade page (no wasted round-trip). The
    // backend re-checks this too, so a stale flag can never hand out free verifications.
    if(!bg || !bg.canVerify){
        chrome.tabs.create({url: verifierUpgradeUrl(bg ? bg.localtoken : "")});
        return;
    }

    var emails=$('.mailselectchk:checked').map(function(){return $(this).val();}).get();
    if(emails.length===0){ return; }

    setVerifyLoading(true, emails);
    chrome.runtime.sendMessage(chrome.runtime.id, {options:"verifyemails", emails: emails}, function(res){
        setVerifyLoading(false, emails);
        if(chrome.runtime.lastError || !res){ setVerifyError(emails); return; }
        if(res.upgrade){ chrome.tabs.create({url: verifierUpgradeUrl(bg ? bg.localtoken : "")}); return; }
        if(res.outOfCredits){ chrome.tabs.create({url: APP_BASE + "/billing"}); return; }
        if(res.ok && Array.isArray(res.results)){ applyVerificationResults(res.results); }
        else{ setVerifyError(emails); }
    });
});

// Map a backend verification status to the badge's label and state class. Mirrors the
// dashboard's VerificationBadge, including treating catch-all as a plain "Deliverable".
var VERIFY_LABELS = {
    valid: {label:"Deliverable", cls:"is-valid"},
    catch_all: {label:"Deliverable", cls:"is-valid"},
    invalid: {label:"Undeliverable", cls:"is-invalid"},
    disposable: {label:"Disposable", cls:"is-warn"},
    unknown: {label:"Unknown", cls:"is-unknown"}
};

// The badge for a given row, matched to its address case-insensitively (the backend
// lowercases everything it verifies).
function badgeForEmail(email){
    var target=String(email||"").trim().toLowerCase();
    var $badge=$();
    $('.email-row .mailselectchk').each(function(){
        if(String($(this).val()||"").trim().toLowerCase()===target){
            $badge=$(this).closest('.email-row').find('.email-badge');
            return false;
        }
    });
    return $badge;
}

function setBadge($badge, cls, text){
    if(!$badge || !$badge.length){ return; }
    $badge.removeClass('is-loading is-valid is-invalid is-warn is-unknown is-error')
          .addClass(cls)
          .text(text)
          .attr('title', text);
}

// Toggle the button + row badges into (or out of) the verifying state. Turning the state off
// clears the submitted rows back to a blank badge, so the caller can then paint the final
// verdicts — and any address the backend skipped (over its allowance) doesn't spin forever.
function setVerifyLoading(on, emails){
    verifyInFlight=!!on;
    var $btn=$('#verifyBtn');
    if(on){
        $btn.addClass('is-verifying').find('.ea-label').text('Verifying…');
        $btn.find('.ea-count').text('');
    }else{
        $btn.removeClass('is-verifying').find('.ea-label').text('Verify');
        setExportEnabled($('.mailselectchk:checked').length);
    }
    (emails||[]).forEach(function(email){
        var $b=badgeForEmail(email);
        if(on){ setBadge($b, 'is-loading', ''); }
        else{ setBadge($b, '', ''); }
    });
}

function applyVerificationResults(results){
    for(var i=0;i<results.length;i++){
        var r=results[i]||{};
        var info=VERIFY_LABELS[r.status] || VERIFY_LABELS.unknown;
        setBadge(badgeForEmail(r.email), info.cls, info.label);
    }
}

// Verification couldn't complete (network/backend). Flag the rows so the user knows the
// result is missing rather than clean; clicking Verify again re-runs the whole selection.
function setVerifyError(emails){
    (emails||[]).forEach(function(email){
        setBadge(badgeForEmail(email), 'is-error', 'Error');
    });
}
function executeCopy(text) {
    chrome.runtime.sendMessage({"message":"get_bg_vars","callback":"executecopy","variables":{text:text}}, function (response){if (!chrome.runtime.lastError) {} else {}});
}

// Manual "Save to cloud". Premium users who leave Autosave off push the emails on screen to
// their dashboard on demand; free users with a connected account do the same. The install
// token never leaves the service worker, so the actual POST happens there
// (options:"savemailsmanual"); here we only handle the button's selection, loading and result
// states.
var cloudSaveInFlight = false;

$('#cloudSaveBtn').on("click", function(e){
    e.preventDefault();
    var $btn = $(this);
    if($btn.hasClass('disabled') || cloudSaveInFlight){ return; }
    // Nothing to save into yet: the click becomes the sign-in it was always going to need.
    if(saveMode() === "connect"){ promptConnect(); return; }
    var emails = $('.mailselectchk:checked').map(function(){return $(this).val();}).get();
    if(emails.length === 0){ return; }

    cloudSaveInFlight = true;
    $btn.addClass('is-saving').removeClass('saved');
    $btn.find('.ea-label').text('Saving…');
    $btn.find('.ea-count').text('');

    var url = $('#showCurrentUrl').html() || "";
    chrome.runtime.sendMessage(chrome.runtime.id, {options:"savemailsmanual", mails: emails, url: url, lists: pickerSelection()}, function(res){
        cloudSaveInFlight = false;
        $btn.removeClass('is-saving');
        if(chrome.runtime.lastError || !res || !res.ok){
            // Not entitled to save unattended → the upgrade page. Needing an account is a
            // different fix, and the connect card in Settings is where that lives. Anything
            // else is transient: let them retry.
            if(res && res.upgrade){
                chrome.tabs.create({url: upgradeUrl(bg ? bg.localtoken : "")});
            }else if(res && res.needsAccount){
                promptConnect();
            }
            $btn.find('.ea-label').text('Save');
            setExportEnabled($('.mailselectchk:checked').length);
            return;
        }
        // Flip the saved rows to their green check right away: the save landed, and waiting
        // for the next savedstatus refresh made the button say "Saved!" while the rows
        // looked untouched.
        markRowsSaved(emails);
        $btn.addClass('saved').find('.ea-label').text('Saved!');
        $btn.find('.ea-count').text('');
        window.setTimeout(function(){
            $btn.removeClass('saved').find('.ea-label').text('Save');
            setExportEnabled($('.mailselectchk:checked').length);
        }, 1500);
    });
});

// Put the given addresses into the row-level saved state: the same green check a per-row save
// shows, which also turns the row into a shortcut to the lead in the dashboard (see
// rowIsSaved / openLeadInDashboard). Shared by the toolbar Save and the per-row save.
function markRowsSaved(emails){
    var savedSet = {};
    (emails || []).forEach(function(m){ savedSet[String(m).toLowerCase()] = true; });
    $('.email-row').each(function(){
        var $row = $(this);
        var email = String($row.find('.mailselectchk').val() || "").toLowerCase();
        if(!savedSet[email]){ return; }
        $row.find('.email-save')
            .removeClass('is-saving')
            .addClass('is-saved')
            .attr('title', 'Saved: click to open in your leads')
            .attr('aria-label', 'Saved: click to open in your leads');
    });
}

// Per-row save: the small cloud button on each email row saves just that one address to the
// cloud. It lives inside the row's <label>, so preventDefault stops the click from toggling
// the row's checkbox. Once saved the button locks into a green check (this page's list is
// short-lived; a rescan repaints fresh rows anyway).
// The last set of addresses we asked the backend about, so repeated visibility refreshes
// don't fire the same lookup again. Reset whenever the list is repainted.
var savedStatusSignature = "";

// Ask the backend which displayed addresses are already in the user's leads and mark those
// rows as already-saved. Only meaningful when the per-row Save button is on offer, which is the
// same gate as the toolbar Save; it self-guards so it's safe to call from anywhere.
function markSavedEmails(){
    if(saveMode() !== "save"){ return; }
    var emails = $('.email-row .mailselectchk').map(function(){return String($(this).val()||"");}).get();
    if(emails.length === 0){ return; }
    var sig = emails.join("|");
    if(sig === savedStatusSignature){ return; }
    savedStatusSignature = sig;
    chrome.runtime.sendMessage(chrome.runtime.id, {options:"savedstatus", mails: emails}, function(res){
        if(chrome.runtime.lastError || !res || !res.ok || !Array.isArray(res.saved)){
            // Let a later refresh retry rather than getting stuck on a transient failure.
            savedStatusSignature = "";
            return;
        }
        var savedSet = {};
        for(var i=0;i<res.saved.length;i++){ savedSet[String(res.saved[i]).toLowerCase()] = true; }
        $('.email-row').each(function(){
            var $row = $(this);
            var email = String($row.find('.mailselectchk').val()||"").toLowerCase();
            if(savedSet[email]){
                $row.find('.email-save')
                    .addClass('is-existing')
                    .removeClass('is-saving')
                    .attr('title','Already in your leads — click to open')
                    .attr('aria-label','Already in your leads — click to open');
            }
        });
    });
}

function saveSingleEmailRow($btn){
    if($btn.hasClass('is-saving') || $btn.hasClass('is-saved') || $btn.hasClass('is-existing')){ return; }
    if(saveMode() === "connect"){ promptConnect(); return; }
    var email = $btn.closest('.email-row').find('.mailselectchk').val();
    if(!email){ return; }
    $btn.addClass('is-saving');
    var url = $('#showCurrentUrl').html() || "";
    chrome.runtime.sendMessage(chrome.runtime.id, {options:"savemailsmanual", mails:[email], url:url}, function(res){
        $btn.removeClass('is-saving');
        if(chrome.runtime.lastError || !res || !res.ok){
            if(res && res.upgrade){ chrome.tabs.create({url: upgradeUrl(bg ? bg.localtoken : "")}); }
            return;
        }
        markRowsSaved([email]);
    });
}

// A row is "in the user's leads" once it carries either marker: is-saved (just saved from
// here) or is-existing (already there when the list loaded). Both make the row a shortcut
// into the dashboard.
function rowIsSaved($row){
    var $s = $row.find('.email-save');
    return $s.hasClass('is-saved') || $s.hasClass('is-existing');
}

// Open a saved address in the dashboard's Leads view. Rather than filtering the list, use the
// `open=<email>` deep link the Leads table understands (same one the Finder extension uses):
// it leaves the full list in place and pops the lead's detail panel open.
function openLeadInDashboard($row){
    var email = $row.find('.mailselectchk').val();
    if(!email){ return; }
    chrome.tabs.create({url: APP_BASE + "/leads?open=" + encodeURIComponent(email)});
}

$(document).on('click', '.email-save', function(e){
    e.preventDefault();
    e.stopPropagation();
    var $btn = $(this);
    // Already in leads → the marker is a link into the dashboard, not a save action.
    if($btn.hasClass('is-existing') || $btn.hasClass('is-saved')){
        openLeadInDashboard($btn.closest('.email-row'));
        return;
    }
    saveSingleEmailRow($btn);
});
$(document).on('keydown', '.email-save', function(e){
    if(e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32){
        e.preventDefault();
        e.stopPropagation();
        var $btn = $(this);
        if($btn.hasClass('is-existing') || $btn.hasClass('is-saved')){
            openLeadInDashboard($btn.closest('.email-row'));
            return;
        }
        saveSingleEmailRow($btn);
    }
});

// Clicking a saved row's line (anywhere but its checkbox) opens it in the dashboard instead
// of toggling selection. Unsaved rows keep the default label behaviour, and the checkbox
// always stays a selection toggle so these addresses can still be copied/exported/verified.
$(document).on('click', '.email-row', function(e){
    if(!rowIsSaved($(this))){ return; }
    if($(e.target).closest('.mailselectchk').length){ return; }
    if($(e.target).closest('.email-save').length){ return; } // handled above
    e.preventDefault();
    openLeadInDashboard($(this));
});
$('#autovisitbutton').on("click", function(e){
    e.preventDefault();
    backgroundmanagerfunction("autovisitbutton");
});
$('#autovisitbuttonstop').on("click", function(){
    backgroundmanagerfunction("autovisitbuttonstop");
});
// Mirror stop button inside overlay
$(document).on('click', '#autovisitbuttonstopOverlay', function(){
    backgroundmanagerfunction("autovisitbuttonstop");
});
// Completion screen: download ONLY the emails scraped during this run.
$(document).on('click', '#acDownload', function(){
    chrome.storage.local.get(['autovisit_run_rows'], function(v){
        var rows = (v && Array.isArray(v.autovisit_run_rows)) ? v.autovisit_run_rows : [];
        if(!rows.length){return;}
        var csvCell = function(val){ return '"' + String(val==null?'':val).replace(/"/g,'""') + '"'; };
        var lines = ['"Email","Source URL"'];
        for(var i=0;i<rows.length;i++){ lines.push(csvCell(rows[i].email) + "," + csvCell(rows[i].url)); }
        var blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = "emails.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    });
});
// Completion screen: dismiss and clear the finished-run state.
$(document).on('click', '#acDone', function(){
    $('#automationComplete').hide();
    chrome.runtime.sendMessage(chrome.runtime.id,{options: "autovisitclearcompleted"}, function(response) {if (!chrome.runtime.lastError) {} else {}});
});
$('#autovisitbuttondisabled').on("click", function(){
    backgroundmanagerfunction("autovisitbuttondisabled");
    return false;
});
var autovisitrefresh = function(){
    backgroundmanagerfunction("autovisitrefresh");
}

// Build a file from the current selection and trigger a download.
function downloadEmails(ext, mime) {
    try{
        var htmlContent = $("#showEmails").html() || "";
        var body = br2nl(htmlContent);
        var blob = new Blob([body], { type: mime });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = "emails." + ext;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function(){ URL.revokeObjectURL(url); }, 500);
    }catch(err){}
}
// Export split-button: the button opens a menu offering CSV or TXT.
(function initExportMenu(){
    var $btn = $("#exportBtn");
    var $menu = $("#exportMenu");
    if(!$btn.length || !$menu.length){ return; }
    function closeMenu(){ $menu.prop("hidden", true); $btn.attr("aria-expanded", "false"); }
    function openMenu(){ $menu.prop("hidden", false); $btn.attr("aria-expanded", "true"); }
    $btn.on("click", function(e){
        e.preventDefault();
        if($btn.hasClass('disabled')){ return; }
        if($menu.prop("hidden")){ openMenu(); } else { closeMenu(); }
    });
    $("#exportCsv").on("click", function(e){ e.preventDefault(); downloadEmails("csv", "text/csv;charset=utf-8"); closeMenu(); });
    $("#exportTxt").on("click", function(e){ e.preventDefault(); downloadEmails("txt", "text/plain;charset=utf-8"); closeMenu(); });
    $(document).on("click", function(e){ if(!$(e.target).closest(".export-menu-wrap").length){ closeMenu(); } });
    $(document).on("keydown", function(e){ if(e.key === "Escape" || e.keyCode === 27){ closeMenu(); } });
})();

(function() {
backgroundmanagerfunction("onDomReady");
// onDomReady paints the paid/free UI from the flag cached in storage, which can lag behind
// reality. Re-check with the backend on every open so a stale cache corrects itself within a
// moment rather than only when the user happens to visit settings. The reply is 'accountData'.
chrome.runtime.sendMessage(chrome.runtime.id, {options: "refreshaccount"}, function(response){if (chrome.runtime.lastError) {}});

    // Tabs behavior
    function showManual(){
        $('#subscriptiondata').hide();
        $('#autovisit').hide();
        $('#tab-normal').css('display','flex');
    }
    function showAutomation(){
        $('#subscriptiondata').hide();
        $('#tab-normal').hide();
        $('#autovisit').show();
        backgroundmanagerfunction("autovisitrefresh");
    }
    function showSettings(){
        $('#autovisit').hide();
        $('#tab-normal').hide();
        $('#subscriptiondata').show();
        backgroundmanagerfunction("showsubscriptiondata");
        // Refresh the account link/plan from the server so a just-completed sign-in shows
        // without waiting for the service worker to restart.
        chrome.runtime.sendMessage(chrome.runtime.id, {options: "refreshaccount"}, function(response){if (!chrome.runtime.lastError) {} else {}});
    }
    $(document).on('click', '.tab-btn', function(){
        $('.tab-btn').removeClass('active');
        $(this).addClass('active');
        $('#showsubscriptiondata').removeClass('active');
        var tab = $(this).data('tab');
        if(tab==='tab-normal'){ showManual(); }
        else if(tab==='tab-automation'){ showAutomation(); }
    });
    // Settings now lives behind the header gear instead of a tab.
    $('#showsubscriptiondata').on('click', function(e){
        e.preventDefault();
        if($('#subscriptiondata').is(':visible')){
            // Toggle off: return to the Extract tab.
            $('.tab-btn[data-tab="tab-normal"]').trigger('click');
        }else{
            $('.tab-btn').removeClass('active');
            $('#showsubscriptiondata').addClass('active');
            showSettings();
        }
    });
    // Default to Manual on load
    showManual();
})();

$('#chkextensionenabled').on("change",function() {
    backgroundmanagerfunction('extensiononoff');
});

$("#showEmails").bind('copy', function() {
    backgroundmanagerfunction("showEmailscopy");
}); 


$("#changetoken").on("click", function() {
    var newtoken=$('#newtoken').val();
    chrome.runtime.sendMessage(chrome.runtime.id,{options: "changetoken", token: newtoken}, function(response) {if (!chrome.runtime.lastError) {} else {}});
});

// Settings: cloud downloads reuse the existing POST forms (open in a new tab).
$("#cloudDownloadCsv").on("click", function(e){
    e.preventDefault();
    if(!fullToken){return;}
    $('#localtoken').val(fullToken);
    document.getElementById('downloadform').submit();
});
$("#cloudDownloadXlsx").on("click", function(e){
    e.preventDefault();
    if(!fullToken){return;}
    $('#localtokenxls').val(fullToken);
    document.getElementById('downloadformxls').submit();
});
$("#copyToken").on("click", function(e){
    e.preventDefault();
    if(!fullToken){return;}
    var done=function(){var $b=$('#copyToken');$b.text("Copied");window.setTimeout(function(){$b.text("Copy");},1200);};
    try{
        navigator.clipboard.writeText(fullToken).then(done, function(){});
    }catch(err){
        var input=document.createElement('textarea');
        document.body.appendChild(input);
        input.value=fullToken;input.focus();input.select();
        try{document.execCommand('Copy');done();}catch(e2){}
        input.remove();
    }
});
// Open the Mailsumo /connect page with this install token. Creating an account and signing in
// are the same destination: if the user already has a session it links instantly (auto-detect),
// otherwise they sign up / sign in and it links on return. Reopening the popup then shows the
// connected account.
function openConnect(e){
    if(e){e.preventDefault();}
    if(!fullToken){return;}
    var url = APP_BASE + "/connect?product=extractor&claim=" + encodeURIComponent(fullToken);
    chrome.tabs.create({url: url}, function (tab) {});
}

$("#signInBtn").on("click", openConnect);
$("#signInExisting").on("click", openConnect);

// Someone pressed Save on an install that has no account behind it. Sending them straight to a
// /connect tab would answer a question they never asked, so bring up the account card instead:
// it already says "sign in to save emails in your dashboard" and offers both buttons. The ring
// is what stops the pane switch from reading as "the button did nothing", and it's its own
// class because setConnectInvite owns settings-card-invite and would clear it on the next
// account refresh.
function promptConnect(){
    $('#connectCard').addClass('settings-card-cue');
    if(!$('#subscriptiondata').is(':visible')){ $('#showsubscriptiondata').trigger('click'); }
    var card = document.getElementById('connectCard');
    if(card && card.scrollIntoView){ card.scrollIntoView({block: 'nearest'}); }
}

$("#toggleTokenChange").on("click", function(e){
    e.preventDefault();
    $('#viewtokenchange').toggle();
});

$("#toggleTokenRecover").on("click", function(e){
    e.preventDefault();
    $('#viewtokenrecover').toggle();
});

$("#recovertoken").on("click", function(){
    var email = ($('#recoveremail').val() || "").trim();
    if(email.indexOf('@') === -1 || email.indexOf('.') === -1){
        $('#recoveremail').focus();
        return;
    }
    var pathToken = fullToken || "recover";
    var form = document.getElementById('recoverform');
    form.action = BACKEND_BASE + "/subscription/" + encodeURIComponent(pathToken) + "/recover";
    form.submit();
    $('#recoverSent').show();
    // Someone recovering a token has just proven they're a paying customer, and they're about
    // to paste a token by hand — the best possible moment to offer the account that makes this
    // the last time. Signing up with the billing email auto-claims the subscription.
    $('#recoverAccountInvite').show();
});

$("#recoverCreateAccount").on("click", openConnect);

$("#chkslow").on("change",function(){chrome.runtime.sendMessage(chrome.runtime.id,{options: "setslow", enabled:this.checked}, function(response) {if (!chrome.runtime.lastError) {} else {}});});

// Header product switcher: the "Email Extractor" crumb opens a dropdown that links
// out to the sibling Mailsumo products. Toggle it, and close on outside click / Esc.
(function initProductSwitch(){
    var $btn = $("#productSwitchBtn");
    var $menu = $("#productMenu");
    if(!$btn.length || !$menu.length){ return; }
    function openMenu(){
        $menu.prop("hidden", false);
        $btn.attr("aria-expanded", "true");
    }
    function closeMenu(){
        $menu.prop("hidden", true);
        $btn.attr("aria-expanded", "false");
    }
    $btn.on("click", function(e){
        e.preventDefault();
        e.stopPropagation();
        if($menu.prop("hidden")){ openMenu(); } else { closeMenu(); }
    });
    // Let the product links open in a new tab, then collapse the menu.
    $menu.find("a").on("click", function(){ closeMenu(); });
    $(document).on("click", function(e){
        if(!$(e.target).closest(".product-switch").length){ closeMenu(); }
    });
    $(document).on("keydown", function(e){
        if(e.key === "Escape" || e.keyCode === 27){ closeMenu(); }
    });
})();

autovisitrefresh();

