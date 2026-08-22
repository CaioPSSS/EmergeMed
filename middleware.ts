import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const isAuthPage = request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/signup');
  const isProtectedPage = request.nextUrl.pathname === '/' ||
    request.nextUrl.pathname.startsWith('/dashboard') ||
    request.nextUrl.pathname.startsWith('/capitulos') ||
    request.nextUrl.pathname.startsWith('/testes') ||
    request.nextUrl.pathname.startsWith('/historico') ||
    request.nextUrl.pathname.startsWith('/configuracoes') ||
    request.nextUrl.pathname.startsWith('/plantoes');
  const isProtectedApi = request.nextUrl.pathname.startsWith('/api/');
  const isMaintenancePage = request.nextUrl.pathname === '/maintenance';

  // Fast path: skip Supabase entirely for non-protected, non-auth routes
  if (!isAuthPage && !isProtectedPage && !isProtectedApi && !isMaintenancePage) {
    return supabaseResponse;
  }

  // Allow maintenance page to render without auth
  if (isMaintenancePage) {
    return supabaseResponse;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    // If Supabase is not configured, block protected pages instead of silently allowing access
    if (isProtectedPage) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Attempt auth check with timeout protection
  // If Supabase is paused/down, this prevents the 504 MIDDLEWARE_INVOCATION_TIMEOUT
  let user = null;
  let supabaseDown = false;

  try {
    // AbortController with 4s timeout to prevent middleware from hanging
    // Vercel middleware timeout is ~25s, but we want to fail fast
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const { data, error } = await supabase.auth.getUser();
    clearTimeout(timeoutId);

    if (!error) {
      user = data.user;
    }
  } catch (error: any) {
    console.error('Middleware: Supabase auth check failed:', error?.message || error);
    supabaseDown = true;
  }

  // If Supabase is down and user is trying to access protected content,
  // redirect to maintenance page instead of showing a 504
  if (supabaseDown) {
    if (isProtectedPage || isProtectedApi) {
      const url = request.nextUrl.clone();
      url.pathname = '/maintenance';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  if (!user && isProtectedPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (!user && isProtectedApi) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
