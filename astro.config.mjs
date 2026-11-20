// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://green-izborsk.ru',
  // URL-адреса страниц всегда со слэшем на конце (как в sitemap и canonical),
  // чтобы не было лишних 301-редиректов /about -> /about/
  trailingSlash: 'always',

  // Шрифты скачиваются при сборке и раздаются с нашего домена
  // (вместо блокирующего @import с fonts.googleapis.com)
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Playfair Display',
      cssVariable: '--font-playfair',
      weights: ['400 700'],
      styles: ['normal', 'italic'],
      subsets: ['cyrillic', 'latin'],
      fallbacks: ['Georgia', 'serif'],
    },
    {
      provider: fontProviders.fontsource(),
      name: 'Source Sans 3',
      cssVariable: '--font-source-sans',
      weights: ['300 700'],
      styles: ['normal'],
      subsets: ['cyrillic', 'latin'],
      fallbacks: ['Segoe UI', 'Roboto', 'sans-serif'],
    },
  ],
});
