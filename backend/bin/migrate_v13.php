<?php
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use App\Support\PublisherIdentity;

echo "Running Migration v13: Flipex Publisher Identity & Branded URLs (/{companySlug} & /{companySlug}/docs/{publicationSlug})...\n";

PublisherIdentity::ensureSchema();

echo "Migration v13 completed successfully!\n";
