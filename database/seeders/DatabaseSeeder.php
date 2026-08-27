<?php

namespace Database\Seeders;

use App\Enums\Dimension;
use App\Enums\Role;
use App\Models\CostCentre;
use App\Models\Department;
use App\Models\Item;
use App\Models\Site;
use App\Models\Unit;
use App\Models\User;
use App\Models\Zone;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        foreach ([['g', 'gramme', Dimension::Mass, 1], ['kg', 'kilogramme', Dimension::Mass, 1000], ['ml', 'millilitre', Dimension::Volume, 1], ['l', 'litre', Dimension::Volume, 1000], ['u', 'unité', Dimension::Count, 1]] as [$code, $label, $dimension, $factor]) {
            Unit::updateOrCreate(['code' => $code], compact('label', 'dimension') + ['factor_to_base' => $factor]);
        }
        $site = Site::updateOrCreate(['code' => 'NTETEMA'], ['name' => "La Ferme D'Tomate — Ntetema", 'legal_entity' => 'SADC Supply Congo SARL', 'timezone' => 'Africa/Lubumbashi', 'address' => 'Route Kinsevere, Haut-Katanga, RDC']);
        $departments = [];
        foreach ([['SER', 'Serre — tomate', 'CC-SER'], ['BAN', 'Bananeraie', 'CC-BAN'], ['AVI', 'Poulailler', 'CC-AVI'], ['MAG', 'Magasin et logistique', 'CC-MAG']] as [$code, $name, $centre]) {
            $departments[$code] = Department::updateOrCreate(['site_id' => $site->id, 'code' => $code], ['name' => $name]);
            CostCentre::updateOrCreate(['code' => $centre], ['department_id' => $departments[$code]->id, 'name' => $name]);
        }
        $direction = User::updateOrCreate(['email' => 'c.losembe@sadcis.co.za'], ['name' => 'Christophe LOSEMBE', 'role' => Role::Direction, 'job_title' => 'Propriétaire — Direction', 'site_id' => $site->id, 'password' => Hash::make((string) config('dtomate.seed_password')), 'email_verified_at' => now(), 'employed_from' => '2026-01-01']);
        $supervisor = User::updateOrCreate(['email' => 'superviseur@dtomate.test'], ['name' => 'MANDE DJUBA, Nowedi', 'role' => Role::Superviseur, 'job_title' => 'Superviseur', 'site_id' => $site->id, 'department_id' => $departments['SER']->id, 'manager_id' => $direction->id, 'daily_rate_cents' => 1591, 'password' => Hash::make('password'), 'email_verified_at' => now(), 'employed_from' => '2026-01-01']);
        foreach ([['agent.serre@dtomate.test', 'SHAMBUYI, Remond', 'SER'], ['agent.banane@dtomate.test', 'LUKWESA, Etienne', 'BAN'], ['magasin@dtomate.test', 'KABONDO MWAMBA, Alphonse', 'MAG']] as [$email, $name, $dept]) {
            User::updateOrCreate(['email' => $email], ['name' => $name, 'role' => $dept === 'MAG' ? Role::Magasinier : Role::Agent, 'site_id' => $site->id, 'department_id' => $departments[$dept]->id, 'manager_id' => $supervisor->id, 'password' => Hash::make('password'), 'email_verified_at' => now(), 'employed_from' => '2026-01-01']);
        }
        foreach ([['SER-M1', 'Module 1', 'greenhouse_module', 'SER', 'CC-SER'], ['SER-M2', 'Module 2', 'greenhouse_module', 'SER', 'CC-SER'], ['BAN-P1', 'Parc 1', 'field_parcel', 'BAN', 'CC-BAN'], ['AVI-B1', 'Poulailler 1', 'poultry_house', 'AVI', 'CC-AVI'], ['MAG-01', 'Magasin', 'store', 'MAG', 'CC-MAG']] as [$code, $name, $type, $dept, $centre]) {
            Zone::updateOrCreate(['site_id' => $site->id, 'code' => $code], ['name' => $name, 'type' => $type, 'department_id' => $departments[$dept]->id, 'cost_centre_id' => CostCentre::where('code', $centre)->value('id'), 'legacy_key' => $name]);
        }
        foreach ([['ENG01', 'Nitrate de calcium', 'Engrais', Dimension::Mass, 'kg', 50000], ['PHY01', 'Mancozèbe Dithane M-45', 'Phyto', Dimension::Mass, 'kg', 10000], ['ALI01', 'Aliment démarrage poussin', 'Aliment', Dimension::Mass, 'kg', 100000], ['EMB01', 'Sac PE perforé bleu', 'Emballage', Dimension::Count, 'u', 200]] as [$code, $name, $category, $dimension, $unit, $threshold]) {
            Item::updateOrCreate(['code' => $code], compact('name', 'category', 'dimension') + ['usage_unit_code' => $unit, 'alert_threshold_base' => $threshold]);
        }
    }
}
