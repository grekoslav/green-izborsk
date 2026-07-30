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

  // Handle published web links (.../pubhtml or .../pub)
  if (url.includes('/pubhtml')) {
    return url.replace('/pubhtml', '/pub?output=csv');
  }
  if (url.includes('/pub?') && !url.includes('output=csv')) {
    return url + '&output=csv';
  }
  if (url.endsWith('/pub')) {
    return url + '?output=csv';
  }

  // Handle standard edit/share links (/d/SPREADSHEET_ID/edit)
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv`;
  }

  if (!url.startsWith('http')) {
    return `https://docs.google.com/spreadsheets/d/${url}/gviz/tq?tqx=out:csv`;
  }

  return url;
}

/**
 * Fetch products from a published Google Sheet CSV URL or Spreadsheet ID
 */
export async function fetchProductsFromGoogleSheets(sheetUrlOrId?: string): Promise<Product[]> {
  if (!sheetUrlOrId || !sheetUrlOrId.trim()) {
    console.log('ℹ️ Google Sheet URL не указан. Используются локальные данные (products.json).');
    return fallbackProducts;
  }

  try {
    const csvUrl = formatCsvUrl(sheetUrlOrId);
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const csvText = await response.text();
    const rawRows = parseCSV(csvText);

    if (rawRows.length === 0) {
      console.warn('⚠️ Google Таблица пустая или доступ ограничен.');
      return fallbackProducts;
    }

    const products: Product[] = rawRows.map((row, index) => {
      const category = getColValue(row, ['category', 'категория']) || 'Разное';
      const name = getColValue(row, ['name', 'название', 'наименование', 'продукт']) || `Товар #${index + 1}`;
      const price = getColValue(row, ['price', 'цена', 'стоимость']) || 'По запросу';
      const description = getColValue(row, ['description', 'описание']) || '';
      const image = getColValue(row, ['image', 'картинка', 'изображение', 'фото']) || 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=800&auto=format&fit=crop&q=80';
      
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
    });

    console.log(`✅ Загружено товаров из Google Таблицы: ${products.length}`);
    return products;

  } catch (error) {
    console.error('❌ Ошибка загрузки данных из Google Таблицы:', error);
    console.log('🔄 Откат на локальный фал продуктов (products.json)...');
    return fallbackProducts;
  }
}
