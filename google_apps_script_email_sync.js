/**
 * SLRG.XYZ // GMAIL TO GOOGLE DRIVE AUTO-PUBLISHER (Google Apps Script)
 * 
 * Paste this script into https://script.google.com
 * It runs in Google Cloud and automatically checks for emails from Gemini
 * containing 'SLRG' in the subject, saves them into 'slrg.xyz' folder as .md,
 * which auto-publishes to your website!
 */

function processSLRGEmails() {
  // 1. Search for unread emails with 'SLRG' in subject
  var threads = GmailApp.search('subject:"SLRG" is:unread');
  
  if (threads.length === 0) {
    Logger.log("No new SLRG emails found.");
    return;
  }
  
  // 2. Locate the 'slrg.xyz' Google Drive folder
  var folders = DriveApp.getFoldersByName("slrg.xyz");
  if (!folders.hasNext()) {
    Logger.log("Folder 'slrg.xyz' not found in Drive!");
    return;
  }
  var targetFolder = folders.next();
  
  // 3. Process each incoming email
  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();
    for (var j = 0; j < messages.length; j++) {
      var msg = messages[j];
      if (msg.isUnread()) {
        var subject = msg.getSubject();
        var body = msg.getPlainBody().trim();
        
        // Clean filename from subject (e.g., "SLRG // 03 New Height Trauma" -> "03-new-height-trauma.md")
        var cleanName = subject.replace(/\[.*?\]/g, '')
                               .replace(/SLRG\s*\/\/\s*/gi, '')
                               .replace(/[^a-zA-Z0-9-_ ]/g, '')
                               .trim()
                               .replace(/\s+/g, '-')
                               .toLowerCase();
        if (!cleanName.endsWith('.md')) {
          cleanName += '.md';
        }
        
        // Overwrite or create file
        var existingFiles = targetFolder.getFilesByName(cleanName);
        if (existingFiles.hasNext()) {
          var file = existingFiles.next();
          file.setContent(body);
          Logger.log("Updated existing file: " + cleanName);
        } else {
          targetFolder.createFile(cleanName, body);
          Logger.log("Created new file: " + cleanName);
        }
        
        // Mark email as read so it won't re-process
        msg.markRead();
      }
    }
  }
}
