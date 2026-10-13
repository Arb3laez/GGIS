/**
 * Detecta el tipo real del archivo por sus primeros bytes ("magic numbers"), sin confiar en la
 * extensión ni en el Content-Type que envía el navegador.
 */
export type DocumentMime = 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp';

export function sniffDocumentType(buf: Buffer): DocumentMime | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'image/webp';
  return null;
}

/** Hojas de cálculo aceptadas para importar ítems (xlsx = zip, xls = OLE2, csv = texto). */
export function isSpreadsheet(buf: Buffer, fileName: string): boolean {
  const isZip = buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  const isOle =
    buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  const isCsv = /\.csv$/i.test(fileName) && !buf.subarray(0, 1024).includes(0);
  return isZip || isOle || isCsv;
}

/** Nombre de archivo seguro para guardar y para Content-Disposition. */
export function cleanFileName(name: string): string {
  // eslint-disable-next-line no-control-regex -- se eliminan a propósito los caracteres de control
  const base = name.replace(/[/\\]/g, '_').replace(/[\x00-\x1f"<>:|?*]/g, '').trim();
  return (base || 'archivo').slice(0, 200);
}
