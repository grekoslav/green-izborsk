import nodemailer from 'nodemailer';

// Email recipients
const RECIPIENTS = [
  'info@green-izborsk.ru',
  'anatoliy.kurchikov@gmail.com',
  'grekoslav@gmail.com'
];

// Simple in-memory Rate Limiting (IP-based)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS_PER_WINDOW = 5;

function isRateLimited(ip) {
  const now = Date.now();
  const userRequests = rateLimitMap.get(ip) || [];
  
  const recentRequests = userRequests.filter(time => now - time < RATE_LIMIT_WINDOW_MS);
  
  if (recentRequests.length >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  
  recentRequests.push(now);
  rateLimitMap.set(ip, recentRequests);
  return false;
}

// Input Sanitization to prevent Email Injection & HTML Injection
function sanitizeInput(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\r+|\n+/g, ' ')
    .trim();
}

export async function handleSendLead(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
    return;
  }

  // Rate limiting check
  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Слишком много запросов. Попробуйте позже.' }));
    return;
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
    if (body.length > 50000) {
      req.destroy();
    }
  });

  req.on('end', async () => {
    try {
      const data = JSON.parse(body);

      // 1. Honeypot check (anti-spam)
      if (data._gotcha || data.website) {
        console.log('🤖 Спам-бот заблокирован через honeypot.');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Заявка принята' }));
        return;
      }

      // 2. Validate & Sanitize fields
      const name = sanitizeInput(data.name);
      const phone = sanitizeInput(data.phone);
      const comment = sanitizeInput(data.comment || 'Не указан');
      const productName = sanitizeInput(data.productName || 'Общая заявка');

      if (!name || name.length < 2) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Укажите корректное имя' }));
        return;
      }

      const digits = phone.replace(/\D/g, '');
      if (!digits || digits.length < 11) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Укажите корректный номер телефона' }));
        return;
      }

      // 3. Configure Transporter via Environment Variables
      const smtpHost = process.env.SMTP_HOST || 'smtp.yandex.ru';
      const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;

      if (!smtpUser || !smtpPass) {
        console.warn('⚠️ SMTP логин/пароль не заданы в переменных окружения (SMTP_USER, SMTP_PASS).');
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      // 4. Construct Email Template
      const mailOptions = {
        from: `"Зелёный Изборск" <${smtpUser || 'info@green-izborsk.ru'}>`,
        to: RECIPIENTS.join(', '),
        subject: `🌾 Новая заявка с сайта: ${name} (${productName})`,
        text: `
Новая заявка с сайта «Зелёный Изборск»

Имя: ${name}
Телефон: ${phone}
Продукт: ${productName}
Комментарий: ${comment}

Дата заявки: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
        `.trim(),
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #2e2a26; background-color: #faf6f0;">
            <div style="max-width: 600px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 12px; border: 1px solid #d4c9b0;">
              <h2 style="color: #5c6b3c; margin-top: 0;">🌾 Новая заявка с сайта</h2>
              <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; width: 120px;">Имя:</td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${name}</td></tr>
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Телефон:</td><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><a href="tel:${phone}" style="color: #c0714a; font-weight: bold;">${phone}</a></td></tr>
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Продукт:</td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${productName}</td></tr>
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Комментарий:</td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${comment}</td></tr>
              </table>
              <p style="font-size: 12px; color: #8a7a69; margin-top: 20px; text-align: right;">
                Отправлено: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
              </p>
            </div>
          </div>
        `
      };

      if (smtpUser && smtpPass) {
        await transporter.sendMail(mailOptions);
        console.log(`✉️ Письмо отправлено на адреса: ${RECIPIENTS.join(', ')}`);
      } else {
        console.log('ℹ️ Режим отладки (без отправки SMTP):', mailOptions);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Заявка успешно отправлена' }));

    } catch (err) {
      console.error('❌ Ошибка обработки заявки:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Ошибка отправки заявки' }));
    }
  });
}
