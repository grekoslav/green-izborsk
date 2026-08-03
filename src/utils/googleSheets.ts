import fallbackProducts from '../data/products.json';

export interface Product {
  id: number;
  category: string;
  name: string;
  price: string;
  description: string;
  image: string;
  inStock: boolean;
}

// Simple CSV parser for Google Sheets CSV export
function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse row handling quotes
  const parseRow = (text: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (inQuotes && text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const rawHeaders = parseRow(lines[0]);
  // Normalize header names
  const headers = rawHeaders.map(h => h.toLowerCase().trim().replace(/^"|"$/g, ''));

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    const rowObj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      let val = values[idx] || '';
      // Strip surrounding quotes
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/""/g, '"');
      }
      rowObj[header] = val;
    });
    rows.push(rowObj);
  }

  return rows;
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

const DEFAULT_IMAGE = '/images/default_image_card.png';

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
        if (data.sizes && Array.isArray(data.sizes) && data.sizes.length > 0) {
          const preferredSize = data.sizes.find(
            (s: any) => s.name === 'XXL' || s.name === 'XL' || s.name === 'L' || s.name === 'M'
          ) || data.sizes[data.sizes.length - 1];
          if (preferredSize?.url) {
            return preferredSize.url;
          }
        }
        if (data.file) {
          return data.file;
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
      return `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
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
export async function fetchProductsFromGoogleSheets(sheetUrlOrId?: string): Promise<Product[]> {
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
        
        const stockRaw = getColValue(row, ['instock', 'наличие', 'в наличии', 'статус']).toLowerCase();
        const inStock = stockRaw.includes('да') || stockRaw.includes('true') || stockRaw.includes('1') || stockRaw.includes('в наличии') || stockRaw === 'есть';

        return {
          id: index + 1,
          category,
          name,
          price,
          description,
          image,
          inStock
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

