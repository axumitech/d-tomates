<?php

declare(strict_types=1);

return [
    'entity' => env('DTOMATE_ENTITY', "La Ferme D'Tomate — SADC Supply Congo SARL"),
    'site' => env('DTOMATE_SITE', 'Ntetema, Route Kinsevere, Haut-Katanga'),
    'timezone' => env('DTOMATE_TZ', 'Africa/Lubumbashi'),
    'currency' => env('DTOMATE_CURRENCY', 'USD'),
    'backdate_tolerance_hours' => 24,
    'max_client_drift_seconds' => 300,
    'seed_password' => env('DTOMATE_SEED_PASSWORD', 'password'),
    'site_access_code' => env('DTOMATE_SITE_ACCESS_CODE', '2026'),
    'legacy' => ['expected_format' => 'CARNET-DTOMATE', 'initial_stock_reason' => "reprise de l'existant"],
];
