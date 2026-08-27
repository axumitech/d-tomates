<?php

use Illuminate\Support\Facades\Route;

Route::inertia('/', 'carnet')->name('home');
Route::inertia('carnet', 'carnet')->name('carnet');
