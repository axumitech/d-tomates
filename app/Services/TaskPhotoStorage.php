<?php

declare(strict_types=1);

namespace App\Services;

use GdImage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

final class TaskPhotoStorage
{
    public function store(UploadedFile $photo, int $taskId): string
    {
        if (! function_exists('imagewebp') || ! (imagetypes() & IMG_WEBP) || ! function_exists('exif_read_data')) {
            throw new RuntimeException('La conversion photo est indisponible. Le serveur doit activer GD avec WebP et EXIF.');
        }
        $source = $photo->getPathname();
        $info = @getimagesize($source);
        if ($info === false || ! in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) {
            throw new RuntimeException('La photo est illisible ou son format n’est pas pris en charge.');
        }
        $pixels = $info[0] * $info[1];
        $limit = ini_parse_quantity((string) ini_get('memory_limit'));
        // Rotation et décodage peuvent nécessiter deux images en mémoire.
        if ($pixels > 40000000 || ($limit > 0 && memory_get_usage(true) + $pixels * 12 + 24 * 1024 * 1024 > $limit)) {
            throw new RuntimeException('Cette photo est trop grande pour être traitée. Exportez une version moins grande puis réessayez.');
        }
        $image = match ($info[2]) {
            IMAGETYPE_JPEG => @imagecreatefromjpeg($source),
            IMAGETYPE_PNG => @imagecreatefrompng($source),
            IMAGETYPE_WEBP => @imagecreatefromwebp($source),
        };
        if ($image === false) {
            throw new RuntimeException('La photo n’a pas pu être décodée.');
        }
        imagepalettetotruecolor($image);
        imagealphablending($image, false);
        imagesavealpha($image, true);
        if ($info[2] === IMAGETYPE_JPEG) {
            $exif = @exif_read_data($source, 'IFD0');
            $image = $this->orient($image, (int) ($exif['Orientation'] ?? 1));
        }
        $maxEdge = max(640, min(4096, (int) config('dtomate.tasks.photo_max_edge', 2560)));
        $ratio = min(1, $maxEdge / max(imagesx($image), imagesy($image)));
        if ($ratio < 1) {
            $width = max(1, (int) round(imagesx($image) * $ratio));
            $height = max(1, (int) round(imagesy($image) * $ratio));
            $resized = imagecreatetruecolor($width, $height);
            if ($resized === false) {
                throw new RuntimeException('La photo n’a pas pu être redimensionnée.');
            }
            imagealphablending($resized, false);
            imagesavealpha($resized, true);
            if (! imagecopyresampled($resized, $image, 0, 0, 0, 0, $width, $height, imagesx($image), imagesy($image))) {
                throw new RuntimeException('La photo n’a pas pu être redimensionnée.');
            }
            $image = $resized;
            unset($resized);
        }
        $temporary = tempnam(sys_get_temp_dir(), 'task-webp-');
        if ($temporary === false) {
            throw new RuntimeException('La conversion photo n’a pas pu démarrer.');
        }
        try {
            $quality = max(75, min(100, (int) config('dtomate.tasks.photo_quality', 85)));
            if (! imagewebp($image, $temporary, $quality)) {
                throw new RuntimeException('La photo n’a pas pu être convertie en WebP.');
            }
            $contents = file_get_contents($temporary);
            // GD peut annoncer un succès sans produire de fichier : contrôler le résultat.
            $output = @getimagesize($temporary);
            if ($contents === false || $contents === '' || $output === false || $output[2] !== IMAGETYPE_WEBP) {
                throw new RuntimeException('Le fichier WebP produit est invalide. Réessayez.');
            }
            $path = 'task-evidence/'.$taskId.'/'.Str::uuid().'.webp';
            if (! Storage::disk('local')->put($path, $contents)) {
                Storage::disk('local')->delete($path);
                throw new RuntimeException('La photo n’a pas pu être enregistrée. Réessayez.');
            }

            return $path;
        } finally {
            unset($image);
            unlink($temporary);
        }
    }

    private function orient(GdImage $image, int $orientation): GdImage
    {
        if (in_array($orientation, [2, 5, 7], true)) {
            imageflip($image, IMG_FLIP_HORIZONTAL);
        } elseif ($orientation === 4) {
            imageflip($image, IMG_FLIP_VERTICAL);
        }
        $angle = match ($orientation) {
            3 => 180, 5, 8 => 90, 6, 7 => -90, default => 0,
        };
        if ($angle !== 0) {
            $rotated = imagerotate($image, $angle, 0);
            if ($rotated === false) {
                throw new RuntimeException('L’orientation de la photo n’a pas pu être corrigée.');
            }

            return $rotated;
        }

        return $image;
    }
}
