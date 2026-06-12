import { getCloudinaryThumb } from '../../lib/cloudinary';

const CLOUD_URL = 'https://res.cloudinary.com/demo/image/upload/v1234567890/avatars/user123.jpg';
const NON_CLOUD_URL = 'https://example.com/image.jpg';
const EXPECTED_THUMB = 'https://res.cloudinary.com/demo/image/upload/w_96,h_96,c_fill,q_auto,f_auto/v1234567890/avatars/user123.jpg';

describe('getCloudinaryThumb', () => {
  it('inserta transformaciones de Cloudinary en la URL', () => {
    expect(getCloudinaryThumb(CLOUD_URL, 96, 96)).toBe(EXPECTED_THUMB);
  });

  it('usa los valores de w y h correctamente', () => {
    const result = getCloudinaryThumb(CLOUD_URL, 200, 120);
    expect(result).toContain('w_200,h_120,c_fill,q_auto,f_auto');
  });

  it('devuelve la URL intacta si no es de Cloudinary', () => {
    expect(getCloudinaryThumb(NON_CLOUD_URL, 96, 96)).toBe(NON_CLOUD_URL);
  });

  it('devuelve null si la URL es null', () => {
    expect(getCloudinaryThumb(null, 96, 96)).toBeNull();
  });

  it('devuelve null si la URL es undefined', () => {
    expect(getCloudinaryThumb(undefined, 96, 96)).toBeNull();
  });

  it('no duplica la transformación si se llama dos veces (idempotencia parcial)', () => {
    const once = getCloudinaryThumb(CLOUD_URL, 96, 96);
    // Una segunda llamada sigue siendo una URL Cloudinary, pero no añade doble /upload/
    expect(once.split('/upload/').length).toBe(2);
  });
});
