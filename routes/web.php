<?php

use App\Http\Controllers\AccountController;
use App\Http\Controllers\AdministrationController;
use App\Http\Controllers\Auth\SessionController;
use App\Http\Controllers\PilotageController;
use App\Http\Controllers\WorkOrderController;
use Illuminate\Support\Facades\Route;

Route::middleware('guest')->group(function (): void {
    Route::inertia('/login', 'auth/login')->name('login');
    Route::post('/login', [SessionController::class, 'store'])->middleware('throttle:5,1');
});
Route::post('/logout', [SessionController::class, 'destroy'])->middleware('auth')->name('logout');

Route::middleware('auth')->group(function (): void {
    Route::get('/profil', [AccountController::class, 'show'])->name('account.profile');
    Route::put('/profil/mot-de-passe', [AccountController::class, 'updatePassword'])->middleware('throttle:6,1')->name('account.password');
    Route::get('/', [PilotageController::class, 'index'])->name('home');
    Route::post('/pilotage/pointage', [PilotageController::class, 'storeAttendance'])->name('pilotage.attendance');
    Route::post('/pilotage/incidents', [PilotageController::class, 'storeIncident'])->name('pilotage.incidents');
    Route::get('/maintenance', [WorkOrderController::class, 'index'])->name('maintenance.index');
    Route::post('/maintenance', [WorkOrderController::class, 'store'])->name('maintenance.store');
    Route::post('/maintenance/{workOrder}/assign', [WorkOrderController::class, 'assign'])->name('maintenance.assign');
    Route::post('/maintenance/{workOrder}/start', [WorkOrderController::class, 'start'])->name('maintenance.start');
    Route::post('/maintenance/{workOrder}/await-parts', [WorkOrderController::class, 'awaitParts'])->name('maintenance.await-parts');
    Route::post('/maintenance/{workOrder}/parts', [WorkOrderController::class, 'addPart'])->name('maintenance.parts');
    Route::post('/maintenance/{workOrder}/labour', [WorkOrderController::class, 'addLabour'])->name('maintenance.labour');
    Route::post('/maintenance/{workOrder}/complete', [WorkOrderController::class, 'complete'])->name('maintenance.complete');
    Route::post('/maintenance/{workOrder}/cancel', [WorkOrderController::class, 'cancel'])->name('maintenance.cancel');
    Route::get('/administration', [AdministrationController::class, 'index'])->name('administration.index');
    Route::post('/administration/equipe', [AdministrationController::class, 'storeUser'])->name('administration.users.store');
    Route::patch('/administration/equipe/{user}', [AdministrationController::class, 'updateUser'])->name('administration.users.update');
    Route::post('/administration/equipements', [AdministrationController::class, 'storeAsset'])->name('administration.assets.store');
    Route::patch('/administration/equipements/{asset}', [AdministrationController::class, 'updateAsset'])->name('administration.assets.update');
    Route::inertia('carnet', 'carnet')->name('carnet');
    Route::inertia('registres', 'registres')->name('registres');
});
