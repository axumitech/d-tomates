<?php

use App\Http\Controllers\CarnetStorageController;
use Illuminate\Support\Facades\Route;

Route::middleware('throttle:240,1')->group(function (): void {
    Route::get('carnet-storage', [CarnetStorageController::class, 'index']);
    Route::get('carnet-storage/value', [CarnetStorageController::class, 'show']);
    Route::put('carnet-storage', [CarnetStorageController::class, 'store']);
});
