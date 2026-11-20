import type { APIRoute } from 'astro';
import companyData from '../data/company.json';
import { fetchProductsFromGoogleSheets } from '../utils/googleSheets';

/**
 * Генерирует при сборке dist/lead-recipients.php: соответствие «название товара → email».
 * send.php берёт адрес получателя только отсюда, а не из данных формы,
 * поэтому форму нельзя использовать для рассылки писем на произвольные адреса.
 * При HTTP-запросе PHP просто выполнит файл и ничего не отдаст.
 */
export const GET: APIRoute = async () => {
  const products = await fetchProductsFromGoogleSheets(companyData.googleSheetUrl);
  const map: Record<string, string> = {};
  for (const p of products) {
    const email = (p.email || '').trim();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      map[p.name.trim()] = email;
    }
  }
  const body = `<?php\n// Сгенерировано при сборке сайта (src/pages/lead-recipients.php.ts). Не редактировать.\nreturn json_decode(${phpString(JSON.stringify(map))}, true);\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};

function phpString(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
