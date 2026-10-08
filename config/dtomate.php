<?php

declare(strict_types=1);

return [
    'entity' => env('DTOMATE_ENTITY', "La Ferme D'Tomate — SADC Supply Congo SARL"),
    'site' => env('DTOMATE_SITE', 'Ntetema, Route Kinsevere, Haut-Katanga'),
    'timezone' => env('DTOMATE_TZ', 'Africa/Lubumbashi'),
    'tasks' => [
        'photo_quality' => (int) env('DTOMATE_TASK_PHOTO_QUALITY', 85),
        'photo_max_edge' => (int) env('DTOMATE_TASK_PHOTO_MAX_EDGE', 2560),
        'site_code' => env('DTOMATE_TASK_SITE_CODE', 'NTETEMA'),
        'deadline' => env('DTOMATE_TASK_DEADLINE', '17:00'),
        'morning' => env('DTOMATE_TASK_MORNING', '06:00'),
        'afternoon' => env('DTOMATE_TASK_AFTERNOON', '14:00'),
        'review' => env('DTOMATE_TASK_REVIEW', '17:30'),
        'report' => env('DTOMATE_TASK_REPORT', '18:00'),
    ],
    'currency' => env('DTOMATE_CURRENCY', 'USD'),
    'backdate_tolerance_hours' => 24,
    'max_client_drift_seconds' => 300,
    'seed_password' => env('DTOMATE_SEED_PASSWORD', 'password'),
    'site_access_code' => env('DTOMATE_SITE_ACCESS_CODE', '2026'),
    'legacy' => ['expected_format' => 'CARNET-DTOMATE', 'initial_stock_reason' => "reprise de l'existant"],
];
