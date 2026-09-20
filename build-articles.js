/**
 * SLRG.XYZ // ARTICLE SYNC & COMPILER ENGINE
 * 
 * 1. Scans 'G:\My Drive\Personal\SLRG Articles' for new/modified markdown files
 * 2. Mirrors them into local 'articles/' directory
 * 3. Compiles YAML frontmatter & paragraphs into 'index.html' (both Archive list & DB)
 * 4. Automatically increments stylesheet cache buster
 */

const fs = require('fs');
const path = require('path');

const GDRIVE_SEARCH_PATHS = [
    'G:\\My Drive\\slrg.xyz',
    'G:\\My Drive\\slrg.xyz\\articles',
    'G:\\My Drive\\slrg'
];
const LOCAL_ARTICLES_PATH = path.join(__dirname, 'articles');
const INDEX_HTML_PATH = path.join(__dirname, 'index.html');

function fileIsInstructions(f) {
    const upper = f.toUpperCase();
    return upper.includes('INSTRUCTION') || upper.startsWith('GEMINI');
}

function parseMarkdownFile(filePath) {
    const rawContent = fs.readFileSync(filePath, 'utf8');
    const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

    const meta = {};
    let bodyRaw = rawContent.trim();

    if (match) {
        const frontmatterRaw = match[1];
        bodyRaw = match[2].trim();

        // Parse simple frontmatter
        const lines = frontmatterRaw.split(/\r?\n/);
        let currentKey = null;

        for (const line of lines) {
            const tagMatch = line.match(/^\s*-\s*["']?([^"']+)["']?/);
            if (tagMatch && currentKey) {
                if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
                meta[currentKey].push(tagMatch[1]);
                continue;
            }

            const kvMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
            if (kvMatch) {
                currentKey = kvMatch[1];
                let val = kvMatch[2].trim();
                if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
                if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
                meta[currentKey] = val;
            }
        }
    } else {
        // Fallback: extract title from first line or header
        const lines = bodyRaw.split(/\r?\n/);
        const titleLine = lines.find(l => l.startsWith('# ')) || lines[0] || 'UNTITLED';
        meta.title = titleLine.replace(/^#+\s*/, '').trim();
        bodyRaw = lines.filter(l => l !== titleLine).join('\n').trim();
    }

    // Process body paragraphs
    const rawParagraphs = bodyRaw
        .split(/\r?\n\r?\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0 && !p.startsWith('#') && !p.startsWith('---'));

    const htmlParagraphs = [];
    let detectedSourceLink = meta.source_url || meta.source_link || null;
    let detectedSourceTitle = meta.source_title || null;

    for (const p of rawParagraphs) {
        const linkMatch = p.match(/^\[(.*?)\]\((https?:\/\/[^\s)]+)\)$/);
        if (linkMatch) {
            detectedSourceTitle = linkMatch[1].replace(/^\[\s*|\s*\]$/g, '');
            detectedSourceLink = linkMatch[2];
        } else {
            let formatted = p.replace(/\r?\n/g, ' ')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>');
            htmlParagraphs.push(`                    <p>${formatted}</p>`);
        }
    }

    let htmlContent = htmlParagraphs.join('\n\n');

    if (detectedSourceLink) {
        const title = detectedSourceTitle || 'READ ORIGINAL SOURCE ↗';
        const displayTitle = title.startsWith('[') ? title : `[ ${title} ]`;
        htmlContent += `\n\n                    <div class="article-source-bar">\n                        <a href="${detectedSourceLink}" target="_blank" rel="noopener noreferrer" class="article-source-link">${displayTitle}</a>\n                    </div>`;
    }

    const filenameBase = path.basename(filePath, '.md');
    return {
        id: meta.id || filenameBase.match(/^\d+/)?.[0] || filenameBase,
        title: meta.title || filenameBase.replace(/[-_]/g, ' ').toUpperCase(),
        date: meta.date || new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
        timestamp: meta.timestamp || new Date().toISOString(),
        tags: Array.isArray(meta.tags) ? meta.tags.slice(0, 2) : [],
        summary: meta.summary || rawParagraphs[0]?.slice(0, 160) || '',
        status: meta.status ? meta.status.toLowerCase() : (meta.draft === true || meta.draft === 'true' ? 'draft' : 'published'),
        content: htmlContent
    };
}

function syncAndBuild() {
    console.log('🔄 Checking Google Drive drafts in G:\\My Drive\\slrg ...');

    // 1. Sync from Google Drive locations if accessible
    let syncedCount = 0;
    for (const gpath of GDRIVE_SEARCH_PATHS) {
        if (fs.existsSync(gpath)) {
            const gdriveFiles = fs.readdirSync(gpath);
            for (const file of gdriveFiles) {
                if (file.endsWith('.gdoc')) {
                    console.warn(`  ⚠️ Note: ${file} is a Google Doc link. Please export or save as a .md file.`);
                } else if (file.endsWith('.md') && !file.startsWith('_') && !fileIsInstructions(file)) {
                    const src = path.join(gpath, file);
                    const dest = path.join(LOCAL_ARTICLES_PATH, file);
                    try {
                        const srcStat = fs.statSync(src);
                        if (!fs.existsSync(dest) || srcStat.mtimeMs > fs.statSync(dest).mtimeMs) {
                            fs.copyFileSync(src, dest);
                            console.log(`  ✓ Synced from ${gpath}: ${file}`);
                            syncedCount++;
                        }
                    } catch (e) {
                        // ignore file locks
                    }
                }
            }
        }
    }

    // 2. Read all local markdown articles
    const files = fs.readdirSync(LOCAL_ARTICLES_PATH)
        .filter(f => f.endsWith('.md') && !f.startsWith('_') && !fileIsInstructions(f))
        .sort();

    const articles = [];
    for (const file of files) {
        const parsed = parseMarkdownFile(path.join(LOCAL_ARTICLES_PATH, file));
        if (parsed) articles.push(parsed);
    }

    console.log(`📄 Compiled ${articles.length} article(s).`);

    // 3. Generate HTML Archive list
    const lockSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="icon-lucide icon-lock"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

    const listHtml = articles.map(art => {
        const isDraft = art.status === 'draft';
        if (isDraft) {
            return `                    <!-- ARTICLE ${art.id} (LOCKED DRAFT) -->
                    <article class="article-item is-draft" data-article-id="${art.id}">
                        <div class="article-title-row">
                            <h2 class="article-title">${art.title}</h2>
                            <span class="article-date draft-lock">${lockSvg}</span>
                        </div>
                        <p class="article-desc">${art.summary}</p>
                    </article>`;
        }
        return `                    <!-- ARTICLE ${art.id} -->
                    <article class="article-item selectable" data-article-id="${art.id}">
                        <div class="article-title-row">
                            <h2 class="article-title">${art.title}</h2>
                            <span class="article-date">${art.date}</span>
                        </div>
                        <p class="article-desc">${art.summary}</p>
                    </article>`;
    }).join('\n\n                    <div class="article-divider"></div>\n\n');

    // 4. Generate JavaScript DB
    const dbEntries = articles.map(art => {
        return `            "${art.id}": {\n                title: "${art.title.replace(/"/g, '\\"')}",\n                date: "${art.date}",\n                timestamp: "${art.timestamp}",\n                tags: ${JSON.stringify(art.tags)},\n                content: \`\n${art.content}\n                \`\n            }`;
    }).join(',\n');

    const dbJs = `const articlesDB = {\n${dbEntries}\n        };`;

    // 5. Update index.html
    let html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');

    // Replace Article Layout section
    html = html.replace(
        /(<div class="article-layout">\r?\n)[\s\S]*?(\r?\n\s*<\/div>\r?\n\s*<\/div>\r?\n\s*<!-- VIEW 2)/,
        `$1${listHtml}\n                </div>\n            </div>\n\n            <!-- VIEW 2`
    );

    // Replace Articles DB in JS
    html = html.replace(
        /const articlesDB = \{[\s\S]*?\n\s*\};/,
        dbJs
    );

    // Increment cache-buster
    html = html.replace(/styles\.css\?v=(\d+)/, (m, v) => `styles.css?v=${parseInt(v, 10) + 1}`);

    fs.writeFileSync(INDEX_HTML_PATH, html, 'utf8');
    console.log('✅ index.html updated successfully with compiled articles!');
}

syncAndBuild();
