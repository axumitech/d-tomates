<?php

declare(strict_types=1);

namespace Tests\Feature\Dtomate;

use App\Services\TaskPhotoStorage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Tests\TestCase;

final class TaskPhotoStorageTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    public function test_large_jpeg_is_reduced_without_crop_and_only_webp_is_stored(): void
    {
        $photo = UploadedFile::fake()->image('photo.jpg', 3200, 400);
        $path = app(TaskPhotoStorage::class)->store($photo, 42);
        $info = getimagesize(Storage::disk('local')->path($path));
        $this->assertStringEndsWith('.webp', $path);
        $this->assertSame([2560, 320], [$info[0], $info[1]]);
        $this->assertSame(IMAGETYPE_WEBP, $info[2]);
        $this->assertLessThan(filesize($photo->getPathname()), Storage::disk('local')->size($path));
        $this->assertCount(1, Storage::disk('local')->allFiles());
    }

    public function test_png_transparency_and_small_image_dimensions_are_preserved(): void
    {
        $image = imagecreatetruecolor(120, 80);
        imagealphablending($image, false);
        imagesavealpha($image, true);
        imagefill($image, 0, 0, imagecolorallocatealpha($image, 0, 0, 0, 127));
        imagefilledrectangle($image, 50, 30, 70, 50, imagecolorallocatealpha($image, 255, 0, 0, 0));
        ob_start();
        imagepng($image);
        $contents = ob_get_clean();
        $photo = UploadedFile::fake()->createWithContent('photo.png', $contents);
        $path = app(TaskPhotoStorage::class)->store($photo, 42);
        $webp = imagecreatefromwebp(Storage::disk('local')->path($path));
        $this->assertSame([120, 80], [imagesx($webp), imagesy($webp)]);
        $this->assertSame(127, imagecolorsforindex($webp, imagecolorat($webp, 0, 0))['alpha']);
        $this->assertSame(0, imagecolorsforindex($webp, imagecolorat($webp, 60, 40))['alpha']);
    }

    public function test_webp_input_is_accepted_and_remains_readable(): void
    {
        $path = app(TaskPhotoStorage::class)->store(UploadedFile::fake()->image('photo.webp', 320, 240), 42);
        $this->assertSame('image/webp', Storage::disk('local')->mimeType($path));
        $this->assertSame(320, getimagesize(Storage::disk('local')->path($path))[0]);
    }

    public function test_phone_exif_rotation_is_applied_before_metadata_is_removed(): void
    {
        $photo = UploadedFile::fake()->image('portrait.jpg', 120, 80);
        $jpeg = file_get_contents($photo->getPathname());
        // APP1 EXIF, TIFF little-endian, orientation=6 (90° clockwise).
        $exif = "Exif\0\0II".pack('vVv', 42, 8, 1).pack('vvVv', 0x0112, 3, 1, 6)."\0\0".pack('V', 0);
        $jpeg = substr($jpeg, 0, 2)."\xFF\xE1".pack('n', strlen($exif) + 2).$exif.substr($jpeg, 2);
        $photo = UploadedFile::fake()->createWithContent('portrait.jpg', $jpeg);
        $path = app(TaskPhotoStorage::class)->store($photo, 42);
        $info = getimagesize(Storage::disk('local')->path($path));
        $this->assertSame([80, 120], [$info[0], $info[1]]);
    }

    public function test_corrupt_image_is_rejected_without_storing_any_file(): void
    {
        try {
            app(TaskPhotoStorage::class)->store(UploadedFile::fake()->createWithContent('photo.jpg', 'not an image'), 42);
            $this->fail('Une image invalide doit être refusée.');
        } catch (RuntimeException $error) {
            $this->assertStringContainsString('illisible', $error->getMessage());
        }
        $this->assertSame([], Storage::disk('local')->allFiles());
    }
}
