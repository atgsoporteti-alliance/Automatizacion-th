/**
 * Corrige nombres de archivos multipart decodificados en Latin1 por Multer/Busboy
 * cuando contenían caracteres UTF-8 multibyte (tildes, ñ, guiones largos, etc.).
 */
export function decodeUploadedFileName(originalname: string): string {
  if (!originalname) return 'documento';
  if (/[^\u0000-\u00FF]/.test(originalname) || !/[\u0080-\u00FF]/.test(originalname)) {
    return originalname;
  }

  try {
    const decoded = Buffer.from(originalname, 'latin1').toString('utf8');
    if (decoded && !decoded.includes('\uFFFD') && decoded !== originalname) {
      return decoded;
    }
  } catch {
    // conservar nombre original si falla la conversión
  }

  return originalname;
}

/**
 * Construye un header Content-Disposition válido según RFC 6266 / RFC 5987
 * evitando ERR_INVALID_CHAR en Node.js ante caracteres no ASCII o de control.
 */
export function buildContentDispositionHeader(
  disposition: 'inline' | 'attachment',
  rawFileName: string,
): string {
  const cleanName = decodeUploadedFileName(rawFileName).replace(/[\r\n\x00-\x1F\x7F]/g, '').trim() || 'documento';
  const asciiFallback =
    cleanName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/["\\;]/g, '_')
      .replace(/_+/g, '_')
      .trim() || 'documento';

  const encodedUtf8 = encodeURIComponent(cleanName)
    .replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodedUtf8}`;
}
