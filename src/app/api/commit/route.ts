import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  const token = req.cookies.get("github_token")?.value;

  if (!token) {
    return NextResponse.json(
      { error: "Usuário não autenticado. Faça login com o GitHub." },
      { status: 401 }
    );
  }

  let tmpDir = "";
  const logs: string[] = [];

  try {
    // Buscar dados do usuário logado no GitHub
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "GitChronos-App",
      },
    });

    if (!userRes.ok) {
      return NextResponse.json(
        { error: "Falha ao obter dados do usuário no GitHub." },
        { status: 401 }
      );
    }

    const userData = await userRes.json();
    const authorName = userData.name || userData.login;
    const authorEmail = userData.email || `${userData.id}+${userData.login}@users.noreply.github.com`;

    const body = await req.json();
    const { repoFullName, branch, commits, forcePush } = body;

    if (!repoFullName) {
      return NextResponse.json(
        { error: "Selecione um repositório de destino." },
        { status: 400 }
      );
    }

    if (!commits || !Array.isArray(commits) || commits.length === 0) {
      return NextResponse.json(
        { error: "Nenhum commit foi especificado. Selecione pelo menos um dia no gráfico." },
        { status: 400 }
      );
    }

    const targetBranch = branch || "main";

    // 1. Criar pasta temporária
    tmpDir = path.join(os.tmpdir(), `gitchronos-commit-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    logs.push(`Pasta temporária criada no servidor.`);

    // 2. Clonar o repositório usando o token de acesso
    const cloneUrl = `https://${token}@github.com/${repoFullName}.git`;
    logs.push(`Clonando repositório ${repoFullName}...`);

    await execAsync(`git clone "${cloneUrl}" repo`, {
      cwd: tmpDir,
      timeout: 120000, // 2 minutos de timeout para repos grandes
    });

    const repoDir = path.join(tmpDir, "repo");
    logs.push("Repositório clonado com sucesso.");

    // 3. Checkout da branch correta
    try {
      await execAsync(`git checkout ${targetBranch}`, { cwd: repoDir });
      logs.push(`Branch '${targetBranch}' selecionada.`);
    } catch {
      // Se a branch não existir, cria uma nova
      try {
        await execAsync(`git checkout -b ${targetBranch}`, { cwd: repoDir });
        logs.push(`Branch '${targetBranch}' criada.`);
      } catch {
        logs.push(`Aviso: Usando branch padrão do repositório.`);
      }
    }

    // 4. Criar todos os commits retroativos
    let totalCreated = 0;

    for (const item of commits) {
      const { date, count, message } = item;
      const commitMsg = message || "chore: update history";
      const commitCount = count || 1;
      const formattedDate = new Date(date).toISOString();

      const env = {
        ...process.env,
        GIT_AUTHOR_DATE: formattedDate,
        GIT_COMMITTER_DATE: formattedDate,
        GIT_AUTHOR_NAME: authorName,
        GIT_AUTHOR_EMAIL: authorEmail,
        GIT_COMMITTER_NAME: authorName,
        GIT_COMMITTER_EMAIL: authorEmail,
      };

      for (let i = 0; i < commitCount; i++) {
        const cmd = `git commit --allow-empty -m "${commitMsg.replace(/"/g, '\\"')}"`;
        await execAsync(cmd, { cwd: repoDir, env });
        totalCreated++;
      }

      logs.push(
        `Criado(s) ${commitCount} commit(s) em ${new Date(date).toLocaleDateString("pt-BR")} ${new Date(date).toLocaleTimeString("pt-BR")}`
      );
    }

    logs.push(`Total: ${totalCreated} commits criados.`);

    // 5. Push para o GitHub
    const forceFlag = forcePush ? "--force" : "";
    logs.push(`Enviando para ${repoFullName} (branch: ${targetBranch})...`);

    await execAsync(
      `git push origin ${targetBranch} ${forceFlag}`,
      { cwd: repoDir, timeout: 60000 }
    );

    logs.push("Push executado com sucesso!");

    // 6. Limpar pasta temporária
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      logs.push("Pasta temporária removida.");
    } catch {
      logs.push("Aviso: Não foi possível remover a pasta temporária.");
    }

    return NextResponse.json({
      success: true,
      message: `Sucesso! ${totalCreated} commits criados e enviados para ${repoFullName}.`,
      logs,
    });
  } catch (error: any) {
    console.error("Erro na API de commits:", error);

    // Tentar limpar a pasta temporária em caso de erro
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignora erro na limpeza
      }
    }

    return NextResponse.json(
      {
        error: error.message || "Ocorreu um erro interno no servidor.",
        logs,
      },
      { status: 500 }
    );
  }
}
