import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const SITE_URL = 'https://grekoslav.github.io';
const BASE_PATH = '/green-izborsk';
const PAGES_DIR = path.join(projectRoot, 'src', 'pages');
const OUTPUT_FILE = path.join(projectRoot, 'public', 'sitemap.xml');

// Helper to convert date to YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Recursively find all page files
function getPageFiles(dir, baseDir = dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat && stat.isDirectory()) {
      results = results.concat(getPageFiles(filePath, baseDir));
    } else {
      // Include .astro, .md, .mdx, .html pages (exclude endpoints like .ts, .js, 404)
      if (
        /\.(astro|md|mdx|html)$/.test(file) &&
        !file.startsWith('_') &&
        !file.startsWith('404')
      ) {
        const relativePath = path.relative(baseDir, filePath);
        results.push({
          filePath,
          relativePath,
          mtime: stat.mtime
        });
      }
    }
  });

  return results;
}

// Convert relative file path to URL path
function filePathToRoute(relativePath) {
  // Normalize windows backslashes
  let route = relativePath.replace(/\\/g, '/');

  // Strip extension
  route = route.replace(/\.(astro|md|mdx|html)$/, '');

  // Handle index pages
  if (route === 'index') {
    route = '';
  } else if (route.endsWith('/index')) {
    route = route.slice(0, -5);
  }

  // Ensure trailing slash for directory routes
  const cleanPath = route ? `/${route}/` : '/';
  
  // Combine with BASE_PATH
  const fullPath = (BASE_PATH.replace(/\/$/, '') + cleanPath).replace(/\/+/g, '/');
  
  return `${SITE_URL}${fullPath}`;
}

// Determine priority & changefreq based on route
function getRouteMetadata(routeUrl) {
  if (routeUrl.endsWith('/green-izborsk/')) {
    return { priority: '1.0', changefreq: 'weekly' };
  }
  if (routeUrl.includes('/privacy')) {
    return { priority: '0.3', changefreq: 'monthly' };
  }
  return { priority: '0.8', changefreq: 'weekly' };
}

function generateSitemap() {
  console.log('🔍 Сканирование страниц в src/pages...');
  const pageFiles = getPageFiles(PAGES_DIR);

  const urls = pageFiles.map(({ filePath, relativePath, mtime }) => {
    const loc = filePathToRoute(relativePath);
    const lastmod = formatDate(mtime);
    const { priority, changefreq } = getRouteMetadata(loc);

    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
  });

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

  fs.writeFileSync(OUTPUT_FILE, xmlContent, 'utf-8');
  console.log(`✅ Sitemap успешно обновлён! Записано страниц: ${urls.length}`);
  console.log(`📄 Путь: ${OUTPUT_FILE}`);
}

generateSitemap();
