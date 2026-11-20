import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import fallbackProducts from '../data/products.json';

export interface Product {
  id: number;
  category: string;
  name: string;
  price: string;
  description: string;
  image: string;
  inStock: boolean;
  email?: string;
}

export const DEFAULT_IMAGE = '/images/default_image_card.webp';

// Максимальная ширина фото товара: карточка на сайте не шире ~400px, x2 для Retina
const PRODUCT_IMAGE_WIDTH = 800;

/**
 * CSV parser for Google Sheets CSV export.
 * Корректно обрабатывает кавычки, запятые и переносы строк внутри ячеек
 * (например, многострочное описание товара).
 */
function parseCSV(csvText: string): Record<string, string>[] {
  const records: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    if (inQuotes) {
      if (char === '"') {
        if (csvText[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cur.trim());
      cur = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && csvText[i + 1] === '\n') i++;
      row.push(cur.trim());
      records.push(row);
      row = [];
      cur = '';
    } else {
      cur += char;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur.trim());
    records.push(row);
  }

  const nonEmpty = records.filter(r => r.some(v => v.length > 0));
  if (nonEmpty.length < 2) return [];

  const headers = nonEmpty[0].map(h => h.toLowerCase().trim());

  return nonEmpty.slice(1).map(values => {
    const rowObj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      rowObj[header] = values[idx] || '';
    });
    return rowObj;
  });
}

/** Разбирает значение колонки «Наличие». «Нет в наличии» не должно считаться «в наличии». */
function parseInStock(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (!v) return false;
  if (/(^|\s)(нет|не|false|0)(\s|$)|отсутств|законч|под заказ/.test(v)) return false;
  return /^(да|есть|true|1|\+|yes)$/.test(v) || v.includes('в наличии');
}

// Helper to normalize column values matching English or Russian headers
function getColValue(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const found = Object.keys(row).find(k => k === key || k.includes(key));
    if (found && row[found] !== undefined) {
      return row[found];
    }
  }
  return '';
}

/**
 * Formats any Google Sheet URL (edit, pubhtml, pub, share) into a clean CSV export URL
 */
export function formatCsvUrl(sheetUrlOrId: string): string {
  let url = sheetUrlOrId.trim();
  if (!url) return '';

  // Handle published web links (.../pubhtml or .../pub or /d/e/...)
  if (url.includes('/pub')) {
    if (url.includes('/pubhtml')) {
      return url.replace('/pubhtml', '/pub?output=csv');
    }
    if (url.includes('/pub?') && !url.includes('output=csv')) {
      return url + '&output=csv';
    }
    if (url.endsWith('/pub')) {
      return url + '?output=csv';
    }
    return url;
  }

  // Handle standard edit/share links (/d/SPREADSHEET_ID/edit or /d/SPREADSHEET_ID)
  // Skip '/d/e/' which indicates a published web app
  const match = url.match(/\/d\/(?!e\/)([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv`;
  }

  if (!url.startsWith('http')) {
    return `https://docs.google.com/spreadsheets/d/${url}/gviz/tq?tqx=out:csv`;
  }

  return url;
}

/**
 * Downloads a remote image and saves it to public/images/ so that temporary cloud links never expire.
 */
async function downloadAndCacheImage(imgUrl: string, cacheKey: string): Promise<string> {
  try {
    const hash = crypto.createHash('md5').update(cacheKey).digest('hex').slice(0, 12);
    const imagesDir = path.resolve(process.cwd(), 'public/images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    const localFileName = `img_${hash}.webp`;
    const localFilePath = path.join(imagesDir, localFileName);
    const publicPath = `/images/${localFileName}`;
    if (!fs.existsSync(localFilePath) || fs.statSync(localFilePath).size === 0) {
      const response = await fetch(imgUrl);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) {
        throw new Error('Downloaded image buffer is empty');
      }

      // Уменьшаем до разумного размера и конвертируем в WebP (в 5–10 раз легче оригинала)
      const optimized = await sharp(buffer)
        .rotate()
        .resize({ width: PRODUCT_IMAGE_WIDTH, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();

      fs.writeFileSync(localFilePath, optimized);
      console.log(`📸 Закешировано фото товара: ${publicPath} (${Math.round(buffer.length / 1024)} KB → ${Math.round(optimized.length / 1024)} KB)`);
    }

    // Copy to dist directory if dist/ exists during static build
    const distImagesDir = path.resolve(process.cwd(), 'dist/images');
    if (fs.existsSync(path.resolve(process.cwd(), 'dist'))) {
      if (!fs.existsSync(distImagesDir)) {
        fs.mkdirSync(distImagesDir, { recursive: true });
      }
      fs.copyFileSync(localFilePath, path.join(distImagesDir, localFileName));
    }

    return publicPath;
  } catch (err) {
    console.error('⚠️ Ошибка кэширования изображения:', err);
    return imgUrl;
  }
}

/**
 * Formats and resolves image URLs (handles Yandex Disk, Google Drive, and empty fallbacks)
 */
export async function formatImageUrl(urlStr?: string): Promise<string> {
  if (!urlStr || !urlStr.trim()) {
    return DEFAULT_IMAGE;
  }

  let url = urlStr.trim();

  // Handle Yandex Disk links (e.g. https://disk.yandex.ru/i/... or https://yadi.sk/i/...)
  if (url.includes('disk.yandex.ru') || url.includes('yadi.sk')) {
    try {
      const apiUrl = `https://cloud-api.yandex.net/v1/disk/public/resources?public_key=${encodeURIComponent(url)}`;
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = await res.json();
        const rawUrl = data.file || (data.sizes && data.sizes.find(
          (s: any) => s.name === 'ORIGINAL' || s.name === 'XXL' || s.name === 'XL' || s.name === 'L' || s.name === 'M'
        )?.url);
        if (rawUrl) {
          return await downloadAndCacheImage(rawUrl, url);
        }
      }
    } catch (e) {
      console.error('Ошибка разрешения Yandex.Disk URL:', e);
    }
  }

  // Handle Google Drive file links (e.g. https://drive.google.com/file/d/ID/view)
  if (url.includes('drive.google.com')) {
    const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
      const driveDirectUrl = `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
      return await downloadAndCacheImage(driveDirectUrl, url);
    }
  }

  return url;
}

/**
 * Returns a fallback photo if missing in Google Sheets
 */
function getProductFallbackImage(): string {
  return DEFAULT_IMAGE;
}

/**
 * Fetch products from a published Google Sheet CSV URL or Spreadsheet ID
 */
const productsCache = new Map<string, Promise<Product[]>>();

/** Загружает товары один раз за сборку (используется и страницей, и lead-recipients.php) */
export function fetchProductsFromGoogleSheets(sheetUrlOrId?: string): Promise<Product[]> {
  const key = sheetUrlOrId?.trim() || '';
  let cached = productsCache.get(key);
  if (!cached) {
    cached = loadProducts(sheetUrlOrId);
    productsCache.set(key, cached);
  }
  return cached;
}

async function loadProducts(sheetUrlOrId?: string): Promise<Product[]> {
  const getFallback = async () => {
    return await Promise.all(
      fallbackProducts.map(async (p) => ({
        ...p,
        image: await formatImageUrl(p.image)
      }))
    );
  };

  if (!sheetUrlOrId || !sheetUrlOrId.trim()) {
    console.log('ℹ️ Google Sheet URL не указан. Используются локальные данные (products.json).');
    return getFallback();
  }

  try {
    const csvUrl = formatCsvUrl(sheetUrlOrId);
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const csvText = await response.text();
    const rawRows = parseCSV(csvText);

    // Filter out rows that have no product name
    const validRows = rawRows.filter(row => {
      const name = getColValue(row, ['name', 'название', 'наименование', 'продукт']);
      return name && name.trim().length > 0;
    });

    if (validRows.length === 0) {
      console.warn('⚠️ Google Таблица пустая или доступ ограничен.');
      return getFallback();
    }

    const products: Product[] = await Promise.all(
      validRows.map(async (row, index) => {
        const category = getColValue(row, ['category', 'категория']) || 'Разное';
        const name = getColValue(row, ['name', 'название', 'наименование', 'продукт']) || `Товар #${index + 1}`;
        const price = getColValue(row, ['price', 'цена', 'стоимость']) || 'По запросу';
        const description = getColValue(row, ['description', 'описание']) || '';
        
        const rawImage = getColValue(row, ['image', 'картинка', 'изображение', 'фото']);
        const image = await formatImageUrl(rawImage);
        
        const inStock = parseInStock(getColValue(row, ['instock', 'наличие', 'в наличии', 'статус']));
        const email = getColValue(row, ['email', 'почта', 'емайл', 'e-mail']);

        return {
          id: index + 1,
          category,
          name,
          price,
          description,
          image,
          inStock,
          email: email ? email.trim() : ''
        };
      })
    );

    console.log(`✅ Загружено товаров из Google Таблицы: ${products.length}`);
    return products;

  } catch (error) {
    console.error('❌ Ошибка загрузки данных из Google Таблицы:', error);
    console.log('🔄 Откат на локальный файл продуктов (products.json)...');
    return getFallback();
  }
}

