@echo off
echo ==========================================
echo  SLRG.XYZ // SYNCING ARTICLES TO GITHUB
echo ==========================================
node build-articles.js
git add .
git commit -m "sync(articles): update articles from drive"
git push origin master
echo ==========================================
echo  DONE! Articles updated and live.
echo ==========================================
pause
