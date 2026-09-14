<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;
use Inertia\Response;

final class AccountController extends Controller
{
    public function show(Request $request): Response
    {
        abort_unless($request->user()->isActive(), 403);

        return Inertia::render('profil', [
            'profile' => $request->user()->only(['name', 'email']),
            'roleLabel' => $request->user()->role->label(),
        ]);
    }

    public function updatePassword(Request $request): RedirectResponse
    {
        abort_unless($request->user()->isActive(), 403);
        $validated = $request->validate([
            'current_password' => ['required', 'string', 'current_password'],
            'password' => ['required', 'string', 'confirmed', 'different:current_password', Password::min(12)->mixedCase()->numbers()->symbols()],
        ], [
            'current_password.required' => 'Saisissez votre mot de passe actuel.',
            'current_password.current_password' => 'Le mot de passe actuel est incorrect.',
            'password.required' => 'Saisissez un nouveau mot de passe.',
            'password.confirmed' => 'Les deux nouveaux mots de passe ne correspondent pas.',
            'password.different' => 'Choisissez un mot de passe différent du mot de passe actuel.',
            'password.min' => 'Utilisez au moins 12 caractères.',
            'password.mixed' => 'Ajoutez une majuscule et une minuscule.',
            'password.numbers' => 'Ajoutez au moins un chiffre.',
            'password.symbols' => 'Ajoutez au moins un symbole.',
        ]);

        $request->user()->forceFill([
            'password' => $validated['password'],
            'remember_token' => Str::random(60),
        ])->save();
        $request->session()->regenerate();

        return to_route('account.profile');
    }
}
