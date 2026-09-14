<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

final class SetUserPassword extends Command
{
    protected $signature = 'dtomate:set-password {email : Adresse e-mail du compte existant}';

    protected $description = 'Définir un mot de passe personnel sans afficher le secret';

    public function handle(): int
    {
        $user = User::where('email', $this->argument('email'))->first();
        if (! $user) {
            $this->error('Compte introuvable.');

            return self::FAILURE;
        }
        $password = $this->secret('Nouveau mot de passe (12 caractères minimum, lettres, chiffres et symboles)');
        $confirmation = $this->secret('Confirmez le mot de passe');
        $validator = Validator::make(['password' => $password, 'password_confirmation' => $confirmation], [
            'password' => ['required', 'confirmed', Password::min(12)->mixedCase()->numbers()->symbols()],
        ]);
        if ($validator->fails()) {
            $this->error($validator->errors()->first());

            return self::FAILURE;
        }
        $user->forceFill(['password' => Hash::make($password), 'remember_token' => Str::random(60)])->save();
        $this->info('Mot de passe mis à jour.');

        return self::SUCCESS;
    }
}
