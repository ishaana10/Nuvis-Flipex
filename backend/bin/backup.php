<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Infrastructure\Backup\BackupManager;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

$action = $argv[1] ?? 'create';

if ($action === 'verify' && !empty($argv[2])) {
    $res = BackupManager::verifyAndTestRecovery((int) $argv[2]);
    echo "Verified Backup #{$res['id']} ({$res['backupCode']}): {$res['recoveryNotes']}\n";
    exit(0);
}

$snap = BackupManager::createSnapshot(null, null, 'full_snapshot');
$verified = BackupManager::verifyAndTestRecovery((int) $snap['id']);
echo "Created & Verified Snapshot {$verified['backupCode']} ({$verified['sizeKb']} KB, SHA-256: {$verified['checksumSha256']})\n";
echo "Recovery Drill: {$verified['recoveryNotes']}\n";
