import JSZip from 'jszip';
/**
 * Parse an EPUB file into chapters.
 */
export async function parseEpub(file) {
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    // 1. Read container.xml to find the OPF path
    const containerXml = await readZipText(zip, 'META-INF/container.xml');
    const opfPath = parseContainerXml(containerXml);
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
    // 2. Read and parse the OPF file
    const opfXml = await readZipText(zip, opfPath);
    const { metadata, manifest, spine } = parseOpf(opfXml);
    // 3. Try to read NCX/Nav for proper chapter titles
    const tocTitles = await parseToc(zip, manifest, opfDir);
    // 4. Build chapter list from spine
    const chapters = [];
    for (let i = 0; i < spine.length; i++) {
        const spineItem = spine[i];
        const manifestItem = manifest.get(spineItem.idref);
        if (!manifestItem)
            continue;
        const href = resolveHref(opfDir, manifestItem.href);
        const title = tocTitles.get(manifestItem.href)
            ?? tocTitles.get(href)
            ?? spineItem.title
            ?? `第${i + 1}章`;
        chapters.push({
            index: chapters.length,
            title,
            href,
        });
    }
    // 5. Extract metadata
    const id = generateId();
    const coverUrl = await extractCover(zip, manifest, opfDir, metadata.coverId);
    const meta = {
        id,
        name: metadata.title || file.name.replace(/\.epub$/i, ''),
        author: metadata.creator || '',
        format: 'epub',
        totalChapters: chapters.length,
        currentChapter: 0,
        currentProgress: 0,
        lastReadTime: Date.now(),
        coverUrl,
        durChapterTitle: chapters[0]?.title || '',
        latestChapterTitle: chapters[chapters.length - 1]?.title || '',
    };
    return { meta, chapters };
}
/**
 * Get chapter content from stored EPUB data.
 * Returns sanitized HTML string and created blob URLs.
 */
export async function getEpubChapterContent(fileData, chapter) {
    const zip = await JSZip.loadAsync(fileData);
    const href = chapter.href;
    if (!href)
        return { html: '', blobUrls: [] };
    const html = await readZipText(zip, href);
    return extractBodyContent(html, zip, href);
}
// --- Internal helpers ---
async function readZipText(zip, path) {
    // Try exact path first, then try case-insensitive
    let file = zip.file(path);
    if (!file) {
        // Try without leading slash
        const cleanPath = path.replace(/^\//, '');
        file = zip.file(cleanPath);
    }
    if (!file) {
        // Case-insensitive search
        const lowerPath = path.toLowerCase();
        zip.forEach((relativePath, zipEntry) => {
            if (relativePath.toLowerCase() === lowerPath) {
                file = zipEntry;
            }
        });
    }
    if (!file) {
        throw new Error(`File not found in EPUB: ${path}`);
    }
    return file.async('text');
}
function parseContainerXml(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const rootfile = doc.querySelector('rootfile');
    const fullPath = rootfile?.getAttribute('full-path');
    if (!fullPath) {
        throw new Error('Invalid EPUB: no rootfile found in container.xml');
    }
    return fullPath;
}
function parseOpf(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    // Metadata
    const titleEl = doc.querySelector('metadata title, metadata dc\\:title');
    const creatorEl = doc.querySelector('metadata creator, metadata dc\\:creator');
    const title = titleEl?.textContent?.trim() ?? '';
    const creator = creatorEl?.textContent?.trim() ?? '';
    // Cover ID from metadata meta
    let coverId;
    const metaEls = doc.querySelectorAll('metadata meta');
    metaEls.forEach(meta => {
        if (meta.getAttribute('name') === 'cover') {
            coverId = meta.getAttribute('content') ?? undefined;
        }
    });
    // Manifest
    const manifest = new Map();
    const manifestItems = doc.querySelectorAll('manifest item');
    manifestItems.forEach(item => {
        const id = item.getAttribute('id') ?? '';
        const href = item.getAttribute('href') ?? '';
        const mediaType = item.getAttribute('media-type') ?? '';
        const properties = item.getAttribute('properties') ?? undefined;
        manifest.set(id, { id, href, mediaType, properties });
    });
    // Spine
    const spine = [];
    const spineItems = doc.querySelectorAll('spine itemref');
    spineItems.forEach(item => {
        const idref = item.getAttribute('idref') ?? '';
        const manifestItem = manifest.get(idref);
        spine.push({
            idref,
            href: manifestItem?.href ?? '',
        });
    });
    return { metadata: { title, creator, coverId }, manifest, spine };
}
async function parseToc(zip, manifest, opfDir) {
    const titles = new Map();
    // Try NCX first (EPUB 2)
    let ncxItem;
    manifest.forEach(item => {
        if (item.mediaType === 'application/x-dtbncx+xml') {
            ncxItem = item;
        }
    });
    if (ncxItem) {
        try {
            const ncxPath = resolveHref(opfDir, ncxItem.href);
            const ncxXml = await readZipText(zip, ncxPath);
            parseNcx(ncxXml, titles);
        }
        catch { /* ignore */ }
    }
    // Try Nav (EPUB 3)
    let navItem;
    manifest.forEach(item => {
        const isNav = item.properties?.split(/\s+/).includes('nav');
        if (isNav || item.href.toLowerCase().includes('nav')) {
            navItem = item;
        }
    });
    if (navItem && titles.size === 0) {
        try {
            const navPath = resolveHref(opfDir, navItem.href);
            const navHtml = await readZipText(zip, navPath);
            parseNav(navHtml, titles);
        }
        catch { /* ignore */ }
    }
    return titles;
}
function parseNcx(xml, titles) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const navPoints = doc.querySelectorAll('navPoint');
    navPoints.forEach(np => {
        const text = np.querySelector('navLabel text')?.textContent?.trim();
        const src = np.querySelector('content')?.getAttribute('src');
        if (text && src) {
            // Remove fragment identifier for matching
            const baseSrc = src.split('#')[0];
            titles.set(baseSrc, text);
            titles.set(src, text);
        }
    });
}
function parseNav(html, titles) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'application/xhtml+xml');
    const links = doc.querySelectorAll('nav a, nav[epub\\:type="toc"] a');
    links.forEach(a => {
        const text = a.textContent?.trim();
        const href = a.getAttribute('href');
        if (text && href) {
            const baseSrc = href.split('#')[0];
            titles.set(baseSrc, text);
            titles.set(href, text);
        }
    });
}
async function extractCover(zip, manifest, opfDir, coverId) {
    // Find cover image
    let coverItem;
    if (coverId && manifest.has(coverId)) {
        coverItem = manifest.get(coverId);
    }
    if (!coverItem) {
        manifest.forEach(item => {
            if (item.properties?.split(/\s+/).includes('cover-image') ||
                (item.id.toLowerCase().includes('cover') && item.mediaType.startsWith('image/'))) {
                coverItem = item;
            }
        });
    }
    if (!coverItem)
        return undefined;
    try {
        const coverPath = resolveHref(opfDir, coverItem.href);
        const file = zip.file(coverPath);
        if (!file)
            return undefined;
        const base64 = await file.async('base64');
        const mimeType = coverItem.mediaType || 'image/jpeg';
        return `data:${mimeType};base64,${base64}`;
    }
    catch {
        return undefined;
    }
}
/**
 * Extract the <body> content from an XHTML chapter file.
 * Converts internal image references to blob URLs.
 */
async function extractBodyContent(html, zip, chapterHref) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'application/xhtml+xml');
    const body = doc.querySelector('body');
    const blobUrls = [];
    if (!body)
        return { html, blobUrls };
    // Resolve image sources to blob URLs
    const images = body.querySelectorAll('img, image');
    const chapterDir = chapterHref.includes('/')
        ? chapterHref.substring(0, chapterHref.lastIndexOf('/') + 1)
        : '';
    for (const img of images) {
        const src = img.getAttribute('src') || img.getAttribute('xlink:href') || img.getAttribute('href');
        if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('blob:')) {
            try {
                const imgPath = resolveHref(chapterDir, src);
                const file = zip.file(imgPath);
                if (file) {
                    const blob = await file.async('blob');
                    const url = URL.createObjectURL(blob);
                    blobUrls.push(url);
                    if (img.hasAttribute('xlink:href')) {
                        img.setAttribute('xlink:href', url);
                    }
                    else {
                        img.setAttribute('src', url);
                    }
                }
            }
            catch { /* ignore broken images */ }
        }
    }
    // Extract inline styles from <head> if any
    let styleContent = '';
    const headDoc = parser.parseFromString(html, 'application/xhtml+xml');
    const styles = headDoc.querySelectorAll('head style');
    styles.forEach(style => {
        styleContent += style.textContent ?? '';
    });
    const bodyHtml = body.innerHTML;
    const finalHtml = styleContent ? `<style>${styleContent}</style>${bodyHtml}` : bodyHtml;
    return { html: finalHtml, blobUrls };
}
function resolveHref(base, href) {
    if (href.startsWith('/'))
        return href.slice(1);
    if (!base)
        return href;
    // Simple relative path resolution
    const parts = (base + href).split('/');
    const resolved = [];
    for (const part of parts) {
        if (part === '..') {
            resolved.pop();
        }
        else if (part !== '.' && part !== '') {
            resolved.push(part);
        }
    }
    return resolved.join('/');
}
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
