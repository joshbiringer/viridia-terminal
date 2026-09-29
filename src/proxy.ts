import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Keeps the Supabase session fresh (rotating the access token into cookies) and protects the
 * account area. Public research pages stay public: signing in adds watchlists and preferences,
 * it is not a wall in front of market data.
 */
const PROTECTED = ["/account", "/onboarding", "/watchlist"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;
  const path = request.nextUrl.pathname;

  if (!signedIn && PROTECTED.some((p) => path === p || path.startsWith(p + "/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  if (signedIn && (path === "/signin" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/terminal";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Skip static assets, images and the public JSON APIs (which never use a session).
  matcher: ["/((?!_next/static|_next/image|icon.svg|api/bars|api/securities|api/backtest|api/sec|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
