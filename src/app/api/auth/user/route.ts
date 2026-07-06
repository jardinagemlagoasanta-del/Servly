import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("github_token")?.value;
  const clientId = process.env.GITHUB_CLIENT_ID || "";
  const loginUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo`;

  if (!token) {
    return NextResponse.json({ authenticated: false, loginUrl }, { status: 200 }); // Return 200 so we can read the loginUrl
  }

  try {
    // 1. Busca perfil do usuário
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!userRes.ok) {
      const response = NextResponse.json({ authenticated: false, loginUrl }, { status: 200 });
      response.cookies.delete("github_token");
      return response;
    }

    const userData = await userRes.json();

    // 2. Busca repositórios do usuário
    const reposRes = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    let repos = [];
    if (reposRes.ok) {
      repos = await reposRes.json();
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        name: userData.name || userData.login,
        login: userData.login,
        avatarUrl: userData.avatar_url,
      },
      repos: repos.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        cloneUrl: repo.clone_url,
        private: repo.private,
        defaultBranch: repo.default_branch,
      })),
    });
  } catch (error) {
    console.error("Erro ao buscar dados do usuário no GitHub:", error);
    return NextResponse.json({ error: "Falha ao obter dados do GitHub", loginUrl }, { status: 500 });
  }
}
