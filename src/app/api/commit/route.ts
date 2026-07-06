import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      action, 
      repoPath, 
      commits, 
      message, 
      initRepoName, 
      pushToGithub, 
      githubRepoUrl, 
      githubBranch, 
      forcePush 
    } = body;

    if (!repoPath) {
      return NextResponse.json({ error: "O caminho do repositório é obrigatório." }, { status: 400 });
    }

    const resolvedPath = path.resolve(repoPath);

    // Ação de inicialização do repositório
    if (action === "init") {
      const targetDir = initRepoName ? path.join(resolvedPath, initRepoName) : resolvedPath;

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Verifica se já está inicializado
      const isGit = fs.existsSync(path.join(targetDir, ".git"));
      if (!isGit) {
        await execAsync("git init", { cwd: targetDir });
      }

      return NextResponse.json({
        success: true,
        message: `Repositório inicializado com sucesso em: ${targetDir}`,
        path: targetDir,
      });
    }

    // Ação de criação de commits
    if (action === "commit") {
      if (!fs.existsSync(resolvedPath)) {
        return NextResponse.json({ error: "O diretório especificado não existe." }, { status: 400 });
      }

      if (!fs.existsSync(path.join(resolvedPath, ".git"))) {
        return NextResponse.json({ error: "O diretório não é um repositório Git válido. Inicialize-o primeiro." }, { status: 400 });
      }

      if (!commits || !Array.isArray(commits) || commits.length === 0) {
        return NextResponse.json({ error: "Nenhum commit foi especificado." }, { status: 400 });
      }

      const logs: string[] = [];
      let totalCreated = 0;

      // Executa a criação de todos os commits locais
      for (const item of commits) {
        const { date, count } = item;
        const commitMsg = item.message || message || "chore: update history";
        const commitCount = count || 1;

        const formattedDate = new Date(date).toISOString();

        for (let i = 0; i < commitCount; i++) {
          const env = {
            ...process.env,
            GIT_AUTHOR_DATE: formattedDate,
            GIT_COMMITTER_DATE: formattedDate,
          };

          const cmd = `git commit --allow-empty -m "${commitMsg.replace(/"/g, '\\"')}"`;
          await execAsync(cmd, { cwd: resolvedPath, env });
          totalCreated++;
        }
        logs.push(`Criado(s) ${commitCount} commit(s) em ${new Date(date).toLocaleDateString()} ${new Date(date).toLocaleTimeString()}`);
      }

      // Executa o Push automático para o GitHub caso solicitado
      if (pushToGithub && githubRepoUrl) {
        const token = req.cookies.get("github_token")?.value;

        if (!token) {
          return NextResponse.json({ 
            success: true,
            message: `Commits criados localmente (${totalCreated}), mas o Push falhou: Usuário não autenticado.`,
            logs: [...logs, "Erro: Token de acesso do GitHub não encontrado. Conecte sua conta."]
          });
        }

        // Formata a URL do repositório injetando o token de acesso
        let authenticatedUrl = githubRepoUrl;
        if (githubRepoUrl.startsWith("https://github.com/")) {
          authenticatedUrl = githubRepoUrl.replace("https://github.com/", `https://${token}@github.com/`);
        }

        const targetBranch = githubBranch || "main";
        const forceFlag = forcePush ? "--force" : "";
        logs.push(`Iniciando push para ${githubRepoUrl} (branch: ${targetBranch})...`);

        try {
          // Renomeia branch local para bater com a branch de destino se necessário
          // (Garante que HEAD aponte para a branch correta localmente antes do push)
          try {
            await execAsync(`git checkout -b ${targetBranch}`, { cwd: resolvedPath });
          } catch {
            await execAsync(`git checkout ${targetBranch}`, { cwd: resolvedPath });
          }

          const pushCmd = `git push "${authenticatedUrl}" ${targetBranch} ${forceFlag}`;
          await execAsync(pushCmd, { cwd: resolvedPath });
          logs.push(`Push executado com sucesso para a branch ${targetBranch}!`);
        } catch (pushErr: any) {
          console.error("Erro ao fazer push:", pushErr);
          logs.push(`Erro no Push: ${pushErr.message || "Erro desconhecido"}`);
          return NextResponse.json({
            success: true,
            message: `Commits criados localmente (${totalCreated}), mas o push para o GitHub falhou.`,
            logs,
          });
        }
      }

      return NextResponse.json({
        success: true,
        message: pushToGithub 
          ? `Sucesso! ${totalCreated} commits criados e enviados para o GitHub.`
          : `Sucesso! ${totalCreated} commits criados localmente.`,
        logs,
      });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error: any) {
    console.error("Erro na API de commits:", error);
    return NextResponse.json(
      { error: error.message || "Ocorreu um erro interno no servidor." },
      { status: 500 }
    );
  }
}
