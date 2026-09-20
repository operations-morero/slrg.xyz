/**
 * SLRG.XYZ // REAL-TIME AUTO SYNC & DEPLOY WATCHER
 * 
 * Watches 'G:\My Drive\slrg' for any markdown edits, auto-compiles index.html,
 * and pushes updates to GitHub within seconds.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WATCH_DIR = 'G:\\My Drive\\slrg';
const REPO_DIR = __dirname;

console.log('📡 SLRG Auto-Sync Watcher Started...');
console.log(`👀 Watching: ${WATCH_DIR}`);
console.log('✨ Any changes saved in Google Drive will automatically build and push to GitHub.\n');

let debounceTimer = null;

function triggerBuildAndPush(changedFile) {
    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
        console.log(`\n📝 Change detected in: ${changedFile}`);
        try {
            console.log('🔨 Compiling articles...');
            execSync('node build-articles.js', { cwd: REPO_DIR, stdio: 'inherit' });

            const status = execSync('git status --porcelain', { cwd: REPO_DIR, encoding: 'utf8' }).trim();
            if (status.length > 0) {
                console.log('🚀 Pushing to GitHub...');
                execSync('git add -A', { cwd: REPO_DIR, stdio: 'inherit' });
                const commitMsg = `auto(sync): update articles from Google Drive [${new Date().toLocaleTimeString()}]`;
                execSync(`git commit -m "${commitMsg}"`, { cwd: REPO_DIR, stdio: 'inherit' });
                execSync('git push', { cwd: REPO_DIR, stdio: 'inherit' });
                console.log('✅ Live on GitHub!\n');
            } else {
                console.log('ℹ No changes to commit.\n');
            }
        } catch (err) {
            console.error('❌ Error during auto-sync:', err.message);
        }
    }, 4000);
}

if (fs.existsSync(WATCH_DIR)) {
    fs.watch(WATCH_DIR, { recursive: true }, (eventType, filename) => {
        if (filename && filename.endsWith('.md') && !filename.startsWith('_')) {
            triggerBuildAndPush(filename);
        }
    });
} else {
    console.warn(`⚠️ Warning: ${WATCH_DIR} not accessible yet.`);
}
