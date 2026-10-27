<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureModuleAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $segment = $request->segment(1);
        $module = match ($segment) {
            null, 'pilotage' => 'pilotage',
            'taches', 'carnet', 'maintenance', 'administration', 'registres' => $segment,
            'api' => $request->segment(2) === 'carnet-storage' ? 'carnet' : null,
            default => null,
        };
        if ($user && $module && ! $user->hasModule($module)) {
            if ($request->isMethod('GET') && $request->path() === '/') {
                return redirect($user->landingPage());
            }
            abort(403, 'Vous n’avez pas accès à ce module.');
        }

        return $next($request);
    }
}
