import { NextRequest, NextResponse } from "next/server";

interface CommitDetail {
  sha: string;
  message: string;
  repoFullName: string;
  date: string;
  url: string;
  authorName: string;
  authorLogin: string;
  authorAvatarUrl: string;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get("github_token")?.value;

  if (!token) {
    return NextResponse.json(
      { error: "Usuário não autenticado." },
      { status: 401 }
    );
  }

  try {
    // 1. Busca o login do usuário
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "GitChronos-App",
      },
    });

    if (!userRes.ok) {
      return NextResponse.json(
        { error: "Falha ao obter dados do usuário." },
        { status: 401 }
      );
    }

    const userData = await userRes.json();
    const login = userData.login;

    // 2. Verifica se há filtro por repositório específico
    const repoFilter = req.nextUrl.searchParams.get("repo");

    // 3. Busca repositórios
    let allRepos: any[] = [];

    if (repoFilter) {
      // Busca apenas o repositório específico
      const repoRes = await fetch(
        `https://api.github.com/repos/${repoFilter}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "User-Agent": "GitChronos-App",
          },
        }
      );

      if (repoRes.ok) {
        const repo = await repoRes.json();
        allRepos = [repo];
      } else {
        return NextResponse.json(
          { error: `Repositório ${repoFilter} não encontrado ou sem acesso.` },
          { status: 404 }
        );
      }
    } else {
      // Busca todos os repositórios do usuário (com paginação)
      let repoPage = 1;
      let hasMoreRepos = true;

      while (hasMoreRepos) {
        const reposRes = await fetch(
          `https://api.github.com/user/repos?per_page=100&page=${repoPage}&sort=updated&affiliation=owner,collaborator,organization_member`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
              "User-Agent": "GitChronos-App",
            },
          }
        );

        if (!reposRes.ok) break;

        const repos = await reposRes.json();
        if (repos.length === 0) {
          hasMoreRepos = false;
        } else {
          allRepos.push(...repos);
          repoPage++;
          if (repos.length < 100) hasMoreRepos = false;
        }
      }
    }

    // 4. Para cada repositório, busca os commits do usuário
    const yearParam = req.nextUrl.searchParams.get("year");
    const currentYear = new Date().getFullYear();
    
    let sinceISO: string;
    let untilISO: string | undefined;

    if (yearParam && parseInt(yearParam) < currentYear) {
      const targetYear = parseInt(yearParam);
      sinceISO = `${targetYear}-01-01T00:00:00Z`;
      untilISO = `${targetYear}-12-31T23:59:59Z`;
    } else {
      // Default to trailing 12 months
      const sinceDate = new Date();
      sinceDate.setFullYear(sinceDate.getFullYear() - 1);
      sinceISO = sinceDate.toISOString();
    }

    const commitsByDate: { [date: string]: CommitDetail[] } = {};

    // Processa repositórios em lotes paralelos de 5 para performance
    const batchSize = 5;
    for (let i = 0; i < allRepos.length; i += batchSize) {
      const batch = allRepos.slice(i, i + batchSize);

      const batchPromises = batch.map(async (repo: any) => {
        const repoCommits: CommitDetail[] = [];
        let commitPage = 1;
        let hasMoreCommits = true;

        while (hasMoreCommits) {
          try {
            let commitUrl = `https://api.github.com/repos/${repo.full_name}/commits?since=${sinceISO}&per_page=100&page=${commitPage}`;
            if (untilISO) {
              commitUrl += `&until=${untilISO}`;
            }

            const commitsRes = await fetch(
              commitUrl,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: "application/json",
                  "User-Agent": "GitChronos-App",
                },
              }
            );

            if (!commitsRes.ok) {
              hasMoreCommits = false;
              break;
            }

            const commits = await commitsRes.json();
            if (commits.length === 0) {
              hasMoreCommits = false;
            } else {
              for (const commit of commits) {
                const commitDate =
                  commit.commit?.author?.date ||
                  commit.commit?.committer?.date;
                if (commitDate) {
                  repoCommits.push({
                    sha: commit.sha,
                    message:
                      commit.commit?.message?.split("\n")[0] || "No message",
                    repoFullName: repo.full_name,
                    date: commitDate,
                    url: commit.html_url || "",
                    authorName: commit.commit?.author?.name || commit.author?.login || "Unknown",
                    authorLogin: commit.author?.login || commit.commit?.author?.name || "unknown",
                    authorAvatarUrl: commit.author?.avatar_url || "",
                  });
                }
              }
              commitPage++;
              if (commits.length < 100) hasMoreCommits = false;
            }
          } catch {
            hasMoreCommits = false;
          }
        }

        return repoCommits;
      });

      const batchResults = await Promise.all(batchPromises);

      for (const repoCommits of batchResults) {
        for (const commit of repoCommits) {
          const dateStr = commit.date.split("T")[0];
          if (!commitsByDate[dateStr]) {
            commitsByDate[dateStr] = [];
          }
          commitsByDate[dateStr].push(commit);
        }
      }
    }

    // Ordena commits dentro de cada dia por horário (mais recente primeiro)
    for (const date of Object.keys(commitsByDate)) {
      commitsByDate[date].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    }

    return NextResponse.json({
      success: true,
      commitsByDate,
      totalRepos: allRepos.length,
      filteredRepo: repoFilter || null,
    });
  } catch (error: any) {
    console.error("Erro ao buscar commits do GitHub:", error);
    return NextResponse.json(
      { error: error.message || "Erro interno ao buscar commits." },
      { status: 500 }
    );
  }
}
