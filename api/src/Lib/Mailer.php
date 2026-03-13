<?php

namespace JamWork\Lib;

use PHPMailer\PHPMailer\PHPMailer;

class Mailer
{
    private PHPMailer $mail;

    public function __construct()
    {
        $this->mail = new PHPMailer(true);
        $this->mail->isSMTP();
        $this->mail->Host = $_ENV['SMTP_HOST'];
        $port = (int) ($_ENV['SMTP_PORT'] ?? 465);
        $this->mail->Port = $port;
        $this->mail->SMTPAuth = true;
        $this->mail->Username = $_ENV['SMTP_USER'];
        $this->mail->Password = $_ENV['SMTP_PASS'];

        if ($port === 587) {
            $this->mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        } else {
            $this->mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        }

        $this->mail->setFrom(
            $_ENV['SMTP_FROM_EMAIL'],
            $_ENV['SMTP_FROM_NAME'] ?? 'JamWork'
        );
        $this->mail->isHTML(true);
        $this->mail->CharSet = 'UTF-8';
    }

    public static function isConfigured(): bool
    {
        return !empty($_ENV['SMTP_HOST'])
            && !empty($_ENV['SMTP_USER'])
            && !empty($_ENV['SMTP_PASS'])
            && !empty($_ENV['SMTP_FROM_EMAIL']);
    }

    public function sendInviteEmail(
        string $toEmail,
        string $displayName,
        string $temporaryPassword,
        string $workspaceName,
        string $loginUrl
    ): array {
        try {
            $this->mail->addAddress($toEmail, $displayName);
            $this->mail->Subject = "You've been invited to {$workspaceName}";

            $templatePath = __DIR__ . '/../Mail/templates/invite.html';
            $html = file_get_contents($templatePath);

            $html = str_replace(
                ['{{WORKSPACE_NAME}}', '{{DISPLAY_NAME}}', '{{EMAIL}}', '{{TEMPORARY_PASSWORD}}', '{{LOGIN_URL}}'],
                [$workspaceName, htmlspecialchars($displayName), htmlspecialchars($toEmail), htmlspecialchars($temporaryPassword), htmlspecialchars($loginUrl)],
                $html
            );

            $this->mail->Body = $html;
            $this->mail->AltBody = "Hi {$displayName},\n\n"
                . "You've been invited to {$workspaceName}.\n\n"
                . "Email: {$toEmail}\n"
                . "Temporary Password: {$temporaryPassword}\n\n"
                . "Log in at: {$loginUrl}\n\n"
                . "You'll be asked to change your password when you first log in.";

            $this->mail->send();

            return ['sent' => true, 'error' => null];
        } catch (\Exception $e) {
            error_log('Mailer error: ' . $this->mail->ErrorInfo);
            return ['sent' => false, 'error' => $this->mail->ErrorInfo];
        } finally {
            $this->mail->clearAddresses();
        }
    }
}
