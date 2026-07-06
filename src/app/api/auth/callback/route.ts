import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/?error=missing_code", req.url));
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("GITHUB_CLIENT_ID ou GITHUB_CLIENT_SECRET não definidos no .env.local");
    return NextResponse.redirect(new URL("/?error=missing_credentials", req.url));
  }

  try {
    // Troca o código pelo token de acesso
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("Erro na troca de token do GitHub:", tokenData.error_description);
      return NextResponse.redirect(new URL(`/?error=${tokenData.error}`, req.url));
    }

    const accessToken = tokenData.access_token;

    // Salva o token de acesso em um cookie seguro HTTP-only
    const response = NextResponse.redirect(new URL("/", req.url));
    
    response.cookies.set("github_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 1 semana
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Erro no callback OAuth:", error);
    return NextResponse.redirect(new URL("/?error=auth_failed", req.url));
  }
}
