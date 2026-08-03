<?php
/**
 * Script for sending product lead notifications on Timeweb / Shared hosting.
 */

// Disable direct access without POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('HTTP/1.1 405 Method Not Allowed');
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

// ── CONFIGURATION ──
$defaultEmail = 'info@green-izborsk.ru'; // Main admin notification recipient
$senderEmail  = 'info@green-izborsk.ru'; // From email address
$senderName   = 'Зелёный Изборск';       // From name

// Optional SMTP Configuration (if PHP mail() is blocked by host)
$useSmtp   = false;             // Set to true to enable SMTP
$smtpHost  = 'smtp.yandex.ru';  // e.g. smtp.yandex.ru or smtp.timeweb.ru
$smtpPort  = 465;               // 465 (SSL) or 587 (TLS)
$smtpUser  = '';                // SMTP Login
$smtpPass  = '';                // SMTP Password

// 1. Honeypot check (anti-spam)
if (!empty($_POST['botcheck'])) {
    echo json_encode(['success' => true, 'message' => 'Заявка принята']);
    exit;
}

// 2. Extract and sanitize POST parameters
$name = isset($_POST['name']) ? trim(strip_tags($_POST['name'])) : '';
$phone = isset($_POST['phone']) ? trim(strip_tags($_POST['phone'])) : '';
$comment = isset($_POST['comment']) ? trim(strip_tags($_POST['comment'])) : '';
$productName = isset($_POST['productName']) ? trim(strip_tags($_POST['productName'])) : '';
$targetEmail = isset($_POST['targetEmail']) ? trim(strip_tags($_POST['targetEmail'])) : '';

// 3. Validate required fields
if (mb_strlen($name) < 2) {
    echo json_encode(['success' => false, 'error' => 'Укажите корректное имя']);
    exit;
}

$digits = preg_replace('/\D/', '', $phone);
if (strlen($digits) < 11) {
    echo json_encode(['success' => false, 'error' => 'Укажите корректный номер телефона']);
    exit;
}

// 4. Determine recipient email addresses
$recipients = [];
if (!empty($targetEmail) && filter_var($targetEmail, FILTER_VALIDATE_EMAIL)) {
    $recipients[] = trim($targetEmail);
}

if (!in_array($defaultEmail, $recipients)) {
    $recipients[] = $defaultEmail;
}

// 5. Construct Email Subject and HTML Message
$subject = "🌾 Новая заявка с сайта: " . ($productName ? $productName : "Общая заявка") . " от " . $name;
$dateStr = date('d.m.Y H:i');

$message = "
<!DOCTYPE html>
<html>
<head>
    <meta charset=\"utf-8\">
    <title>Новая заявка</title>
</head>
<body style=\"font-family: Arial, sans-serif; background-color: #faf6f0; padding: 20px; color: #2e2a26;\">
    <div style=\"max-width: 600px; margin: 0 auto; background: #ffffff; padding: 25px; border-radius: 12px; border: 1px solid #d4c9b0;\">
        <h2 style=\"color: #5c6b3c; margin-top: 0;\">🌾 Новая заявка с сайта «Зелёный Изборск»</h2>
        <table style=\"width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 15px;\">
            <tr>
                <td style=\"padding: 10px 0; border-bottom: 1px solid #eee; font-weight: bold; width: 130px;\">Имя:</td>
                <td style=\"padding: 10px 0; border-bottom: 1px solid #eee;\">" . htmlspecialchars($name, ENT_QUOTES, 'UTF-8') . "</td>
            </tr>
            <tr>
                <td style=\"padding: 10px 0; border-bottom: 1px solid #eee; font-weight: bold;\">Телефон:</td>
                <td style=\"padding: 10px 0; border-bottom: 1px solid #eee;\">
                    <a href=\"tel:" . htmlspecialchars($phone, ENT_QUOTES, 'UTF-8') . "\" style=\"color: #c0714a; font-weight: bold; text-decoration: none;\">" . htmlspecialchars($phone, ENT_QUOTES, 'UTF-8') . "</a>
                </td>
            </tr>
            " . ($productName ? "
            <tr>
                <td style=\"padding: 10px 0; border-bottom: 1px solid #eee; font-weight: bold;\">Продукт:</td>
                <td style=\"padding: 10px 0; border-bottom: 1px solid #eee; color: #5c6b3c; font-weight: bold;\">" . htmlspecialchars($productName, ENT_QUOTES, 'UTF-8') . "</td>
            </tr>" : "") . "
            " . ($comment ? "
            <tr>
                <td style=\"padding: 10px 0; border-bottom: 1px solid #eee; font-weight: bold;\">Комментарий:</td>
                <td style=\"padding: 10px 0; border-bottom: 1px solid #eee;\">" . nl2br(htmlspecialchars($comment, ENT_QUOTES, 'UTF-8')) . "</td>
            </tr>" : "") . "
            " . ($targetEmail ? "
            <tr>
                <td style=\"padding: 10px 0; border-bottom: 1px solid #eee; font-weight: bold;\">Email товара:</td>
                <td style=\"padding: 10px 0; border-bottom: 1px solid #eee;\">" . htmlspecialchars($targetEmail, ENT_QUOTES, 'UTF-8') . "</td>
            </tr>" : "") . "
        </table>
        <p style=\"font-size: 12px; color: #8a7a69; margin-top: 25px; text-align: right;\">
            Дата отправки: " . $dateStr . "
        </p>
    </div>
</body>
</html>
";

// 6. Multi-attempt Email Sending Function
function sendSingleMail($to, $subject, $message, $fromEmail, $fromName) {
    $subjectEncoded = "=?UTF-8?B?" . base64_encode($subject) . "?=";
    $fromNameEncoded = "=?UTF-8?B?" . base64_encode($fromName) . "?=";

    // Attempt 1: Standard PHP mail with -f parameter (Timeweb standard)
    $headers1 = [
        'MIME-Version: 1.0',
        'Content-type: text/html; charset=utf-8',
        'From: ' . $fromNameEncoded . ' <' . $fromEmail . '>',
        'Reply-To: ' . $fromEmail,
        'X-Mailer: PHP/' . phpversion()
    ];
    if (@mail($to, $subjectEncoded, $message, implode("\r\n", $headers1), "-f " . $fromEmail)) {
        return true;
    }

    // Attempt 2: Standard PHP mail without -f parameter
    if (@mail($to, $subjectEncoded, $message, implode("\r\n", $headers1))) {
        return true;
    }

    // Attempt 3: Simple From header
    $headers2 = [
        'MIME-Version: 1.0',
        'Content-type: text/html; charset=utf-8',
        'From: ' . $fromEmail,
        'Reply-To: ' . $fromEmail
    ];
    if (@mail($to, $subjectEncoded, $message, implode("\r\n", $headers2))) {
        return true;
    }

    return false;
}

// 7. Socket-based SMTP Sending Function (Fallback)
function sendSmtpMail($to, $subject, $message, $fromEmail, $fromName, $host, $port, $user, $pass) {
    $socket = @fsockopen(($port === 465 ? 'ssl://' : '') . $host, $port, $errno, $errstr, 15);
    if (!$socket) return false;

    $read = function() use ($socket) {
        $res = '';
        while ($str = fgets($socket, 512)) {
            $res .= $str;
            if (substr($str, 3, 1) === ' ') break;
        }
        return $res;
    };

    $write = function($cmd) use ($socket) {
        fputs($socket, $cmd . "\r\n");
    };

    $read();
    $write('EHLO ' . gethostname());
    $read();

    if ($port === 587) {
        $write('STARTTLS');
        $read();
        stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
        $write('EHLO ' . gethostname());
        $read();
    }

    $write('AUTH LOGIN');
    $read();
    $write(base64_encode($user));
    $read();
    $write(base64_encode($pass));
    $authRes = $read();
    if (substr($authRes, 0, 3) !== '235') {
        fclose($socket);
        return false;
    }

    $write("MAIL FROM: <$fromEmail>");
    $read();
    $write("RCPT TO: <$to>");
    $read();
    $write("DATA");
    $read();

    $headers = [
        'MIME-Version: 1.0',
        'Content-type: text/html; charset=utf-8',
        'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
        'From: =?UTF-8?B?' . base64_encode($fromName) . "?= <$fromEmail>",
        'To: <' . $to . '>',
        'Date: ' . date('r')
    ];

    $content = implode("\r\n", $headers) . "\r\n\r\n" . $message . "\r\n.";
    $write($content);
    $sendRes = $read();
    $write("QUIT");
    fclose($socket);

    return substr($sendRes, 0, 3) === '250';
}

// 8. Execute sending
$successCount = 0;
$lastError = '';

foreach ($recipients as $recipient) {
    $sent = false;

    if ($useSmtp && !empty($smtpUser) && !empty($smtpPass)) {
        $sent = sendSmtpMail($recipient, $subject, $message, $senderEmail, $senderName, $smtpHost, $smtpPort, $smtpUser, $smtpPass);
    }

    if (!$sent) {
        $sent = sendSingleMail($recipient, $subject, $message, $senderEmail, $senderName);
    }

    if ($sent) {
        $successCount++;
    }
}

if ($successCount > 0) {
    echo json_encode(['success' => true, 'message' => 'Заявка успешно отправлена']);
} else {
    $lastErrArr = error_get_last();
    $diagMsg = isset($lastErrArr['message']) ? $lastErrArr['message'] : 'Настройки mail() на сервере заблокированы или требуют настройки SMTP.';
    echo json_encode([
        'success' => false,
        'error' => 'Ошибка отправки почты через сервер. ' . $diagMsg
    ]);
}
