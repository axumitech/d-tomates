<?php

declare(strict_types=1);

namespace App\Enums;

enum WorkOrderType: string
{
    case Corrective = 'corrective';
    case Preventive = 'preventive';
    case Inspection = 'inspection';
    case Improvement = 'improvement';

    public function label(): string
    {
        return match ($this) {
            self::Corrective => 'Curatif — une panne à réparer',
            self::Preventive => 'Préventif — entretien programmé',
            self::Inspection => 'Inspection',
            self::Improvement => 'Amélioration',
        };
    }
}
