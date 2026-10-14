// Results page shown inside the automation window when a run finishes.
// Reads the run counters + the emails scraped *during this run* from storage,
// so the download only contains this run's emails (not the whole cloud).
(function(){
  var runRows = [];

  function clearCompleted(){
    try{
      chrome.runtime.sendMessage(chrome.runtime.id, {options: "autovisitclearcompleted"}, function(){
        if(chrome.runtime.lastError){}
      });
    }catch(e){}
  }

  // Match the backend export format: "Email","Source URL", CRLF separated.
  function csvCell(value){
    return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
  }
  function buildCsv(rows){
    var lines = ['"Email","Source URL"'];
    for(var i=0;i<rows.length;i++){
      lines.push(csvCell(rows[i].email) + "," + csvCell(rows[i].url));
    }
    return lines.join("\r\n");
  }

  chrome.storage.local.get(["autovisit_total", "autovisit_run_rows"], function(v){
    v = v || {};
    runRows = Array.isArray(v.autovisit_run_rows) ? v.autovisit_run_rows : [];
    document.getElementById("emails").textContent = runRows.length;
    document.getElementById("sites").textContent = v.autovisit_total || 0;
    var btn = document.getElementById("download");
    if(runRows.length === 0){
      btn.textContent = "No emails to download";
      btn.setAttribute("disabled", "disabled");
      btn.style.opacity = "0.5";
      btn.style.cursor = "default";
    }
  });

  document.getElementById("download").addEventListener("click", function(){
    if(!runRows.length){return;}
    var csv = buildCsv(runRows);
    var blob = new Blob(["\ufeff" + csv], {type: "text/csv;charset=utf-8"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "emails.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  });

  document.getElementById("close").addEventListener("click", function(){
    clearCompleted();
    chrome.tabs.getCurrent(function(tab){
      if(tab && typeof tab.windowId !== "undefined"){
        chrome.windows.remove(tab.windowId, function(){if(chrome.runtime.lastError){ try{window.close();}catch(e){} }});
      }else{
        try{window.close();}catch(e){}
      }
    });
  });
})();
