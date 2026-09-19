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

const GDRIVE_PATH = 'G:\\My Drive\\Personal\\SLRG Articles';
const LOCAL_ARTICLES_PATH = path.join(__dirname, 'articles');
const INDEX_HTML_PATH = path.join(__dirname, 'index.html');

function fileIsInstructions(f) {
    return f.toUpperCase().includes('INSTRUCTION');
}

function parseMarkdownFile(filePath) {
    const rawContent = fs.readFileSync(filePath, 'utf8');
    const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

    if (!match) {
        console.warn(`[WARN] Skipping ${path.basename(filePath)}: Missing YAML frontmatter.`);
        return null;
    }

    const frontmatterRaw = match[1];
    const bodyRaw = match[2].trim();

    // Parse simple frontmatter
    const meta = {};
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

    return {
        id: meta.id || path.basename(filePath, '.md'),
        title: meta.title || 'UNTITLED',
        date: meta.date || '2026.09.18',
        timestamp: meta.timestamp || new Date().toISOString(),
        tags: Array.isArray(meta.tags) ? meta.tags.slice(0, 2) : [],
        summary: meta.summary || '',
        status: meta.status ? meta.status.toLowerCase() : (meta.draft === true || meta.draft === 'true' ? 'draft' : 'published'),
        content: htmlContent
    };
}

function syncAndBuild() {
    console.log('🔄 Checking Google Drive drafts...');

    // 1. Sync from Google Drive if accessible
    if (fs.existsSync(GDRIVE_PATH)) {
        const gdriveFiles = fs.readdirSync(GDRIVE_PATH);
        for (const file of gdriveFiles) {
            if (file.endsWith('.gdoc')) {
                console.warn(`  ⚠️ Note: ${file} is a Google Doc link. To include it, download or export it as a .md file.`);
            } else if (file.endsWith('.md') && !file.startsWith('_') && !file.includes('INSTRUCTIONS')) {
                const src = path.join(GDRIVE_PATH, file);
                const dest = path.join(LOCAL_ARTICLES_PATH, file);
                fs.copyFileSync(src, dest);
                console.log(`  ✓ Synced from Google Drive: ${file}`);
            }
        }
    } else {
        console.log('  ℹ Google Drive not mounted at default path. Using local articles/ folder.');
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
    const listHtml = articles.map(art => {
        const isDraft = art.status === 'draft';
        if (isDraft) {
            return `                    <!-- ARTICLE ${art.id} (LOCKED DRAFT) -->
                    <article class="article-item is-draft" data-article-id="${art.id}">
                        <div class="article-title-row">
                            <h2 class="article-title">${art.title}</h2>
                            <span class="article-date draft-lock"><i data-lucide="lock" class="icon-lucide icon-lock"></i></span>
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
