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
      { error: "Usuário não autenticado." },
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
    const { repoFullName, commitSha, newDate, branch } = body;

    if (!repoFullName || !commitSha || !newDate) {
      return NextResponse.json(
        {
          error:
            "Parâmetros obrigatórios: repoFullName, commitSha, newDate.",
        },
        { status: 400 }
      );
    }

    const targetBranch = branch || "main";
    const formattedDate = new Date(newDate).toISOString();

    // 1. Criar pasta temporária
    tmpDir = path.join(os.tmpdir(), `gitchronos-redate-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    logs.push(`Pasta temporária criada: ${tmpDir}`);

    // 2. Clonar o repositório usando o token de acesso
    const cloneUrl = `https://${token}@github.com/${repoFullName}.git`;
    logs.push(`Clonando repositório ${repoFullName}...`);

    await execAsync(`git clone "${cloneUrl}" repo`, {
      cwd: tmpDir,
      timeout: 120000, // 2 minutos de timeout para clones grandes
    });

    const repoDir = path.join(tmpDir, "repo");
    logs.push("Repositório clonado com sucesso.");

    // 3. Checkout da branch correta
    try {
      await execAsync(`git checkout ${targetBranch}`, { cwd: repoDir });
      logs.push(`Branch '${targetBranch}' selecionada.`);
    } catch {
      logs.push(
        `Aviso: Não foi possível fazer checkout da branch '${targetBranch}', usando branch padrão.`
      );
    }

    // 4. Verificar se o commit existe no histórico
    try {
      await execAsync(`git cat-file -t ${commitSha}`, { cwd: repoDir });
    } catch {
      return NextResponse.json(
        {
          error: `Commit ${commitSha} não encontrado no repositório.`,
          logs,
        },
        { status: 400 }
      );
    }

    logs.push(`Commit ${commitSha.substring(0, 7)} localizado.`);

    // 5. Usar git rebase interativo com env editor para alterar a data
    // Estratégia: usar git filter-branch ou git rebase com EDITOR script
    // Para um único commit, a abordagem mais segura é:
    // - Se for o commit mais recente (HEAD), usar amend diretamente
    // - Se for mais antigo, usar rebase interativo

    // Verificar se é o commit HEAD
    const { stdout: headSha } = await execAsync(
      "git rev-parse HEAD",
      { cwd: repoDir }
    );

    const isHead = headSha.trim().startsWith(commitSha);

    if (isHead) {
      // Caso simples: commit é o HEAD, basta amend
      logs.push("Commit é o HEAD atual. Aplicando amend direto...");

      const env = {
        ...process.env,
        GIT_AUTHOR_DATE: formattedDate,
        GIT_COMMITTER_DATE: formattedDate,
        GIT_AUTHOR_NAME: authorName,
        GIT_AUTHOR_EMAIL: authorEmail,
        GIT_COMMITTER_NAME: authorName,
        GIT_COMMITTER_EMAIL: authorEmail,
      };

      await execAsync(
        `git commit --amend --no-edit --date="${formattedDate}" --author="${authorName} <${authorEmail}>"`,
        { cwd: repoDir, env }
      );

      logs.push("Data do commit alterada com sucesso via amend.");
    } else {
      // Caso complexo: commit antigo, usar git filter-branch
      // NOTA: git filter-branch SEMPRE usa o sh do Git Bash, mesmo no Windows.
      // Por isso usamos sintaxe POSIX shell em todas as plataformas.
      logs.push(
        "Commit é antigo. Usando filter-branch para alterar a data..."
      );

      // Escrever o script de filtro em um arquivo temporário para evitar
      // problemas de escape de aspas no shell
      const filterScriptPath = path.join(tmpDir, "env-filter.sh");
      const filterScriptContent = [
        "#!/bin/sh",
        `if [ "$GIT_COMMIT" = "${commitSha}" ]`,
        "then",
        `    export GIT_AUTHOR_DATE="${formattedDate}"`,
        `    export GIT_COMMITTER_DATE="${formattedDate}"`,
        `    export GIT_AUTHOR_NAME="${authorName}"`,
        `    export GIT_AUTHOR_EMAIL="${authorEmail}"`,
        `    export GIT_COMMITTER_NAME="${authorName}"`,
        `    export GIT_COMMITTER_EMAIL="${authorEmail}"`,
        "fi",
        "",
      ].join("\n");

      fs.writeFileSync(filterScriptPath, filterScriptContent, {
        mode: 0o755,
      });

      // No Windows, converter o caminho para formato Unix (Git Bash espera isso)
      const isWindows = os.platform() === "win32";
      let scriptPathForGit = filterScriptPath;
      if (isWindows) {
        // Converter C:\Users\... para /c/Users/...
        scriptPathForGit = filterScriptPath
          .replace(/\\/g, "/")
          .replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);
      }

      const filterCommand = `git filter-branch -f --env-filter ". '${scriptPathForGit}'" HEAD`;

      logs.push(`Executando filter-branch...`);

      await execAsync(filterCommand, {
        cwd: repoDir,
        timeout: 120000,
        env: {
          ...process.env,
          FILTER_BRANCH_SQUELCH_WARNING: "1",
        },
      });

      logs.push("Data do commit alterada com sucesso via filter-branch.");
    }

    // 6. Force push para o GitHub
    logs.push(
      `Executando force push para ${repoFullName} (branch: ${targetBranch})...`
    );

    await execAsync(
      `git push --force origin ${targetBranch}`,
      { cwd: repoDir, timeout: 300000 }
    );

    logs.push("Force push executado com sucesso!");

    // 7. Limpar pasta temporária
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      logs.push("Pasta temporária removida.");
    } catch {
      logs.push(
        "Aviso: Não foi possível remover a pasta temporária."
      );
    }

    return NextResponse.json({
      success: true,
      message: `Data do commit ${commitSha.substring(0, 7)} alterada com sucesso para ${new Date(newDate).toLocaleString("pt-BR")}.`,
      logs,
    });
  } catch (error: any) {
    console.error("Erro ao alterar data do commit:", error);

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
        error:
          error.message || "Erro interno ao alterar data do commit.",
        logs,
      },
      { status: 500 }
    );
  }
}
