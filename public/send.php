<?php
/**
 * Script for sending product lead notifications on Timeweb hosting.
 */

// Disable direct access without POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('HTTP/1.1 405 Method Not Allowed');
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

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

$defaultEmail = 'info@green-izborsk.ru';

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

// 4. Determine recipient email address
$recipients = [];
if (!empty($targetEmail) && filter_var($targetEmail, FILTER_VALIDATE_EMAIL)) {
    $recipients[] = $targetEmail;
}

// Always ensure default admin email receives a copy
if (!in_array($defaultEmail, $recipients)) {
    $recipients[] = $defaultEmail;
}

$to = implode(', ', $recipients);

// 5. Construct Email Subject and Body
$subject = "🌾 Новая заявка с сайта: " . ($productName ? $productName : "Общая заявка") . " от " . $name;
// Encode subject for UTF-8 mail headers
$subjectEncoded = "=?UTF-8?B?" . base64_encode($subject) . "?=";

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

// 6. Headers
$headers = [];
$headers[] = 'MIME-Version: 1.0';
$headers[] = 'Content-type: text/html; charset=utf-8';
$headers[] = 'From: "Зелёный Изборск" <info@green-izborsk.ru>';
$headers[] = 'Reply-To: info@green-izborsk.ru';

$mailSent = @mail($to, $subjectEncoded, $message, implode("\r\n", $headers));

if ($mailSent) {
    echo json_encode(['success' => true, 'message' => 'Заявка успешно отправлена']);
} else {
    echo json_encode(['success' => false, 'error' => 'Ошибка отправки почты через сервер']);
}
