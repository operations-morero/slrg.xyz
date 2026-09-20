/**
 * SLRG.XYZ // 100% MOBILE-FIRST GOOGLE DRIVE TO GITHUB AUTO-SYNC
 * 
 * Paste this script into https://script.google.com
 * It runs in Google's Cloud every 5 minutes (zero PC required).
 * Whenever you or Gemini save an article in 'My Drive/slrg.xyz',
 * it automatically pushes the file to GitHub, triggering your live site build!
 */

// CONFIGURATION:
var GITHUB_OWNER = "operations-morero";
var GITHUB_REPO = "slrg.xyz";
var GITHUB_BRANCH = "master";
// Store your GitHub Fine-Grained or Classic Personal Access Token in Script Properties as 'GITHUB_TOKEN'
// (or paste it here directly for quick setup):
var GITHUB_TOKEN = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN") || "YOUR_GITHUB_PAT_TOKEN_HERE";

function syncDriveToGitHub() {
  var folders = DriveApp.getFoldersByName("slrg.xyz");
  if (!folders.hasNext()) {
    Logger.log("Folder 'slrg.xyz' not found in Drive.");
    return;
  }
  
  var folder = folders.next();
  var files = folder.getFiles();
  var props = PropertiesService.getScriptProperties();

  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName();
    
    // Process only .md article files (ignore templates/instructions)
    if (name.endsWith(".md") && !name.startsWith("_") && !name.toUpperCase().includes("INSTRUCTION")) {
      var lastUpdated = file.getLastUpdated().getTime().toString();
      var storedLastUpdated = props.getProperty("file_" + name);
      
      // If file is new or modified since last sync
      if (lastUpdated !== storedLastUpdated) {
        Logger.log("Syncing to GitHub: " + name);
        var content = file.getBlob().getDataAsString();
        var success = pushFileToGitHub("articles/" + name, content, "feat(mobile): auto-sync " + name + " from Google Drive");
        
        if (success) {
          props.setProperty("file_" + name, lastUpdated);
          Logger.log("Successfully pushed to GitHub: " + name);
        }
      }
    }
  }
}

function pushFileToGitHub(path, content, message) {
  var url = "https://api.github.com/repos/" + GITHUB_OWNER + "/" + GITHUB_REPO + "/contents/" + path;
  
  // 1. Check if file already exists on GitHub to get its SHA
  var sha = null;
  var getOptions = {
    method: "get",
    headers: {
      "Authorization": "Bearer " + GITHUB_TOKEN,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Google-Apps-Script-Drive-Sync"
    },
    muteHttpExceptions: true
  };
  
  var getResponse = UrlFetchApp.fetch(url + "?ref=" + GITHUB_BRANCH, getOptions);
  if (getResponse.getResponseCode() === 200) {
    var json = JSON.parse(getResponse.getContentText());
    sha = json.sha;
  }
  
  // 2. Commit and push file to GitHub
  var payload = {
    message: message,
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch: GITHUB_BRANCH
  };
  if (sha) {
    payload.sha = sha;
  }
  
  var putOptions = {
    method: "put",
    headers: {
      "Authorization": "Bearer " + GITHUB_TOKEN,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Google-Apps-Script-Drive-Sync"
    },
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  var putResponse = UrlFetchApp.fetch(url, putOptions);
  var code = putResponse.getResponseCode();
  
  if (code === 200 || code === 201) {
    return true;
  } else {
    Logger.log("GitHub API Error (" + code + "): " + putResponse.getContentText());
    return false;
  }
}
