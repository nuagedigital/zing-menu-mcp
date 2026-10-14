/*
    Email Extractor - content script
*/

// Never scan the Mailsumo app itself (e.g. the Leads page). The dashboard renders
// every saved lead's address on screen, so extracting here would loop the user's
// own leads straight back into saveautosave, re-saving them over and over. The app
// host comes from config.js (MS_URLS) so this follows dev vs prod automatically.
var eeBlockedOnThisHost = (function () {
    var appHosts = {};
    try {
        if (typeof MS_URLS !== "undefined") {
            ["app", "backend"].forEach(function (key) {
                if (MS_URLS[key]) { appHosts[new URL(MS_URLS[key]).host] = true; }
            });
        }
    } catch (e) { /* fall back to the hardcoded host below */ }
    // Belt and suspenders: always block the public app host even if config.js
    // failed to load into this content-script world for some reason.
    appHosts["app.mailsumo.io"] = true;
    return appHosts[window.location.host] === true;
})();

// Heavy single-page apps (video, social, chat) churn the DOM constantly, which made the
// observer re-scan the whole page every ~500ms and pinned the CPU. On those hosts (from
// config.js) the repeat scanning is off: no MutationObserver, no focus rescan. The single
// scan on load still runs, because that is what autosave and the automation queue depend
// on, and one pass per page load costs nothing.
var eeInertHost = (function () {
    try {
        if (typeof msIsInertHost === "function") { return msIsInertHost(window.location.host); }
    } catch (e) { /* if config.js didn't load, fall through and behave normally */ }
    return false;
})();

//On Tab Switch Trigger Reloader
if (!eeInertHost) {
    window.addEventListener('focus', function() {
        reloader();
    });
}

var isextensionenabled=!eeBlockedOnThisHost;
//Check the focus state 
//Thanks to @dystroy
var activeTab = (function(){
    var stateKey, eventKey, keys = {
        hidden: "visibilitychange",
        webkitHidden: "webkitvisibilitychange"
    };

    for (stateKey in keys) {
        if (stateKey in document) {
            eventKey = keys[stateKey];
            break;
        }
    }

    return function(c) {
        if (c) document.addEventListener(eventKey, c);
        return !document[stateKey];
    }
})();

function reloader() {
	if(isextensionenabled){
		var getChunk = $("body").html(); //Fetching Entire Body
		var getChunkMails = $("body a"); //Fetching All Anchors Elements in Body

		//Extracting Emails From Chunk
		function extractEmails(chunk) {
			//alert(JSON.stringify(mcUtils.extractEmails(chunk)));
			return mcUtils.extractEmails(chunk);
		    //return chunk.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,6}\b/ig);
		}

		//Extracting Links From Chunk
		function extractLinks(chunk) {
			//alert(JSON.stringify(mcUtils.extractLinks(chunk)));
			return mcUtils.extractLinks(chunk);
		}	

		//Filtering Out The Emails By Removing The Duplicates
		function unique(list) {
			// De-dupe with a Set (O(n)). The old $.inArray scan was O(n²), which got
			// pathological on pages that surface hundreds of addresses.
			return list ? Array.from(new Set(list)) : [];
		}

		//Object To Normal Text
		function objectToString(object) {
			var stringify = "";
			for (var property in object) {
				stringify += object[property] + '<br>';
			}
			return stringify;
		}

		// Scan the page once and reuse the result. The old code re-ran the regex
		// extraction (and re-deduped) four or five times per pass, so every mutation
		// meant scanning the whole serialized DOM several times over.
		var foundMails = extractEmails(getChunk);
		//Check If Found Any Emails, IF NOT
		if(foundMails == null) {
			chrome.runtime.sendMessage({
			    from:    "content",
			    subject: "sendMailCount",
			    mailCount: 0
			});

			chrome.runtime.sendMessage({
			    from:    "content",
			    subject: "sendEmails",
			    mails:   'None Found',
			    mailsFound: '0',
			    url: window.location.href
			});
		} else { //IF FOUND
	        try{
				var uniqueMails = unique(foundMails);
				var mailCount = uniqueMails.length;
				chrome.runtime.sendMessage({
				    from:    "content",
				    subject: "sendMailCount",
				    mailCount: mailCount
				});

				chrome.runtime.sendMessage({
				    from: "content",
				    subject: "sendEmails",
				    mails: objectToString(uniqueMails),
				    mailsFound: mailCount,
				    url: window.location.href
				});
				chrome.runtime.sendMessage({
					options: "saveautosave",
					mails: uniqueMails,
					url: window.location.href
				});
			}catch(err){}
		}
		//Check If Found Any Links, IF NOT
		var foundLinks = extractLinks(getChunkMails);
		if(foundLinks == null) {
			chrome.runtime.sendMessage({
			    from:    "content",
			    subject: "sendLinks",
			    links:   []
			});
		} else { //IF FOUND
	        try{
				chrome.runtime.sendMessage({
				    from: "content",
				    subject: "sendLinks",
				    links: objectToString(foundLinks)
				});
			}catch(err){}
		}
	}
}


//On DOM Update
var ee_running=false;
var ee_observer = new MutationObserver(function(mutations) {
  mutations.forEach(function(mutation) {
    if(!ee_running){
        if(activeTab() == true) {
            ee_running=true;
            reloader();
            setTimeout(function(){ee_running=false;}, 500);
        }
    }
    });
  });
// On the Mailsumo app host, don't observe the DOM or ask the background for the
// enabled state (which would flip isextensionenabled back on): stay fully inert.
//
// An inert host skips the observer but still scans once. Skipping the scan too meant the
// automation queue collected nothing at all from tiktok.com, instagram.com or youtube.com:
// it navigates the tab through the list, and with no scan on load there was nothing to
// autosave, with no popup to open per page.
if(!eeBlockedOnThisHost){
    if(!eeInertHost){ ee_observer.observe(document.body, { childList: true, subtree:true }); }
    chrome.runtime.sendMessage({options:"extensionenable"},function(extensionstatus){isextensionenabled=extensionstatus.status;reloader();});
}

chrome.runtime.onMessage.addListener( // this is the message listener
    function(request, sender, sendResponse) {
        if (request.message === "copyText"){
            copyToTheClipboard(request.textToCopy,request.elements);
        }else if (request.message === "capture"){
            reloader();
        }
	    sendResponse(true);
	    return true;
    }
);

async function copyToTheClipboard(textToCopy,elements){
    var text=textToCopy.replace(/<br\s*\/?>/mg,"\r\n");
    var divresult = document.createElement('div');
    divresult.style.display='none';
    divresult.style.textAlign='center';
    divresult.id='emailExtractorAlert';
    divresult.style.backgroundColor='#ffffff';
    divresult.style.color='#000000';
    divresult.style.position='fixed';
    divresult.style.right='5px';
    divresult.style.top='5px';
    divresult.style.width='300px';
    divresult.style.zIndex='99999';
    divresult.style.border='1px solid #000000';
    divresult.style.borderRadius='5px';
    divresult.style.padding='5px';
    document.body.appendChild(divresult);
    navigator.clipboard
      .writeText(text)
      .then(() => {
      	divresult.style.color='#008800';
      	divresult.style.display='block';
        divresult.innerHTML="<img src='data:image/png;base64, iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAR1JREFUeNpiYKAQMBJSsHDhQgEg1Q/ECVChD0DcGB8fP4GgAVDN+4HYAIt0IcgQJgIOQNZ8AYgnQF0AAvUgAqcBap7zFFpX/C3cdvpfIFSjI9DGQiC9AKoE5DoGFiwaQRLzgTgAxD9/9z8Q/z2A5CUHZPUsWDRj87OAnQ4TSG49ktwCFC9g0QzysyNIIVBzoK0O43o0uUJ4LODSXB3BXACkD0CjEUUOGB4fkA2YjxTPMM3Icc+ATTOyF9A1g9gKaJoPoGvGFgsbb21P+tDKAPbSBS9TpomGyowgDQ+AGh/gTMpAL7yHxitI8UQg9kfy8wagoYG40gvMCxOREkc9WoAl4kuqYM++vbPxgLCqPyNUIwdSPEeCvMRASwAQYADVrGCJVSOIewAAAABJRU5ErkJggg=='/> COPIED " +elements +" EMAIL IDs TO CLIPBOARD";
      })
      .catch((e) => {
        divresult.style.color='#ff0000';
        divresult.style.display='block';
        divresult.innerHTML="<img src='data:image/png;base64, iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAR1JREFUeNpiYKAQMBJSsHDhQgEg1Q/ECVChD0DcGB8fP4GgAVDN+4HYAIt0IcgQJgIOQNZ8AYgnQF0AAvUgAqcBap7zFFpX/C3cdvpfIFSjI9DGQiC9AKoE5DoGFiwaQRLzgTgAxD9/9z8Q/z2A5CUHZPUsWDRj87OAnQ4TSG49ktwCFC9g0QzysyNIIVBzoK0O43o0uUJ4LODSXB3BXACkD0CjEUUOGB4fkA2YjxTPMM3Icc+ATTOyF9A1g9gKaJoPoGvGFgsbb21P+tDKAPbSBS9TpomGyowgDQ+AGh/gTMpAL7yHxitI8UQg9kfy8wagoYG40gvMCxOREkc9WoAl4kuqYM++vbPxgLCqPyNUIwdSPEeCvMRASwAQYADVrGCJVSOIewAAAABJRU5ErkJggg=='/> NOT COPIED TO CLIPBOARD!<br/> Please try again!";
      });
    setTimeout(function(){divresult.remove();},2000);
}