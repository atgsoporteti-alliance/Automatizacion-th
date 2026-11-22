import {
  DEFAULT_VERCEL_WEB_URL,
  isAllowedFrontendOrigin,
  resolveFrontendOrigin,
} from './web-url.util';

describe('web-url.util', () => {
  it('descarta dominios de Netlify y prioriza el origen Vercel de la petición', () => {
    const resolved = resolveFrontendOrigin({
      configuredWebUrl: 'https://automatizacion-th-web.netlify.app',
      requestOrigin: 'https://automatizacion-th-web.vercel.app',
      nodeEnv: 'production',
    });
    expect(resolved).toBe(DEFAULT_VERCEL_WEB_URL);
  });

  it('usa Vercel por defecto en producción aunque WEB_URL aún apunte a Netlify', () => {
    const resolved = resolveFrontendOrigin({
      configuredWebUrl: 'https://automatizacion-th-web.netlify.app',
      nodeEnv: 'production',
    });
    expect(resolved).toBe(DEFAULT_VERCEL_WEB_URL);
  });

  it('rechaza orígenes Netlify en CORS y acepta Vercel o localhost', () => {
    expect(isAllowedFrontendOrigin('https://automatizacion-th-web.netlify.app')).toBe(false);
    expect(isAllowedFrontendOrigin('https://automatizacion-th-web.vercel.app')).toBe(true);
    expect(isAllowedFrontendOrigin('http://localhost:3000')).toBe(true);
  });
});
