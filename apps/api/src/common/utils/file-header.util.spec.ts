import {
  buildContentDispositionHeader,
  decodeUploadedFileName,
} from './file-header.util';

describe('file-header.util', () => {
  it('decodifica nombres UTF-8 mal interpretados como Latin1 por Multer', () => {
    const latin1Mangled = Buffer.from('Alliance HCM – Core TH & IT (José).pdf', 'utf8').toString(
      'latin1',
    );
    expect(decodeUploadedFileName(latin1Mangled)).toBe('Alliance HCM – Core TH & IT (José).pdf');
  });

  it('construye header Content-Disposition solo con ASCII seguro en filename y UTF-8 en filename*', () => {
    const header = buildContentDispositionHeader(
      'inline',
      Buffer.from('Alliance HCM – Core TH (Fase 1).pdf', 'utf8').toString('latin1'),
    );

    expect(header.startsWith('inline; filename="Alliance HCM _ Core TH (Fase 1).pdf"; filename*=UTF-8\'\'')).toBe(
      true,
    );
    // Garantiza que ningún byte fuera de ASCII imprimible aparezca en el header
    expect(/^[\x20-\x7E]+$/.test(header)).toBe(true);
  });
});
