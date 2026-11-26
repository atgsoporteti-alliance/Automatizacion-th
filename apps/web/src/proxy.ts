import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { InternalRole, ROLE_HOME_ROUTES } from '@alliance-hcm/shared';

const PUBLIC_PATHS = ['/login', '/pre-ingreso', '/candidato'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    PUBLIC_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let isAuthenticated = false;

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    const { data } = await supabase.auth.getUser();
    if (data.user) {
      isAuthenticated = true;
    }
  }

  // En modo desarrollo / UAT, también aceptamos la cookie de perfil de pruebas
  const allowDevBypass = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== 'false';
  const isDevBypass =
    allowDevBypass &&
    Boolean(request.cookies.get('alliance_dev_role_email')?.value);

  if (!isAuthenticated && !isDevBypass) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirección automática según rol al entrar a /
  if (pathname === '/') {
    const roleCookie = request.cookies.get('alliance_user_role')?.value as InternalRole | undefined;
    const target = (roleCookie && ROLE_HOME_ROUTES[roleCookie]) || '/dashboard/th';
    return NextResponse.redirect(new URL(target, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
