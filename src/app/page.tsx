"use client";

import React, { useState, useEffect, useMemo } from "react";

interface CommitDay {
  dateStr: string;
  date: Date;
  existingCount: number;
  newCount: number;
  totalCount: number;
}

interface GitHubUser {
  name: string;
  login: string;
  avatarUrl: string;
  createdAt?: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  cloneUrl: string;
  private: boolean;
  defaultBranch: string;
}

interface CommitDetail {
  sha: string;
  message: string;
  repoFullName: string;
  date: string;
  url: string;
}

export default function Home() {
  // App States
  const [commitMessage, setCommitMessage] = useState("chore: update history");
  const [commitTime, setCommitTime] = useState("12:00:00");
  const [commitsPerDay, setCommitsPerDay] = useState(1);
  const [selectedDates, setSelectedDates] = useState<{ [key: string]: number }>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ text: "", type: "" });

  // GitHub Auth & Contributions States
  const [authState, setAuthState] = useState<{
    authenticated: boolean;
    user: GitHubUser | null;
    repos: GitHubRepo[];
    loginUrl: string;
    githubContributions: { [key: string]: number };
  }>({
    authenticated: false,
    user: null,
    repos: [],
    loginUrl: "",
    githubContributions: {},
  });

  // Selected repo for creating commits (destination)
  const [selectedRepoFullName, setSelectedRepoFullName] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("main");
  const [forcePush, setForcePush] = useState(false);

  // Selected repo for viewing commits in the graph
  const [viewRepoFullName, setViewRepoFullName] = useState("");
  const [repoCommitCounts, setRepoCommitCounts] = useState<{ [key: string]: number }>({});
  const [loadingRepoCommits, setLoadingRepoCommits] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Range selection state
  const [startDateStr, setStartDateStr] = useState("");
  const [endDateStr, setEndDateStr] = useState("");
  const [rangeCommits, setRangeCommits] = useState(2);

  // Commit details modal states
  const [githubCommitDetails, setGithubCommitDetails] = useState<{ [date: string]: CommitDetail[] }>({});
  const [selectedDay, setSelectedDay] = useState("");
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [redateLoading, setRedateLoading] = useState(false);
  const [redateTarget, setRedateTarget] = useState<{ sha: string; repoFullName: string } | null>(null);
  const [newDateForCommit, setNewDateForCommit] = useState("");
  const [redateLogs, setRedateLogs] = useState<string[]>([]);
  const [loadingCommitDetails, setLoadingCommitDetails] = useState(false);

  // Fetch GitHub User & Repos on mount
  useEffect(() => {
    async function fetchUser() {
      try {
        const response = await fetch("/api/auth/user");
        const data = await response.json();
        if (data.authenticated) {
          setAuthState({
            authenticated: true,
            user: data.user,
            repos: data.repos || [],
            loginUrl: "",
            githubContributions: data.githubContributions || {},
          });
          // Set default selected repo
          if (data.repos && data.repos.length > 0) {
            setSelectedRepoFullName(data.repos[0].fullName);
            setSelectedBranch(data.repos[0].defaultBranch || "main");
            setViewRepoFullName(data.repos[0].fullName);
          }
        } else {
          setAuthState((prev) => ({ ...prev, loginUrl: data.loginUrl }));
        }
      } catch (err) {
        console.error("Erro ao verificar autenticação:", err);
      }
    }
    fetchUser();
  }, []);

  // Fetch commits when viewRepoFullName or selectedYear changes
  useEffect(() => {
    if (viewRepoFullName && authState.authenticated) {
      fetchRepoCommits(viewRepoFullName, selectedYear);
    }
  }, [viewRepoFullName, selectedYear, authState.authenticated]);

  // Fetch commits for a specific repo (for graph display)
  const fetchRepoCommits = async (repoFullName: string, year: number) => {
    setLoadingRepoCommits(true);
    setLoadingCommitDetails(true);
    try {
      const res = await fetch(`/api/github/commits?repo=${encodeURIComponent(repoFullName)}&year=${year}`);
      const data = await res.json();
      if (res.ok && data.commitsByDate) {
        setGithubCommitDetails(data.commitsByDate);
        // Build count map for graph
        const counts: { [key: string]: number } = {};
        for (const [date, commits] of Object.entries(data.commitsByDate)) {
          counts[date] = (commits as CommitDetail[]).length;
        }
        setRepoCommitCounts(counts);
      } else {
        setGithubCommitDetails({});
        setRepoCommitCounts({});
      }
    } catch (err) {
      console.error("Erro ao buscar commits do repo:", err);
      setGithubCommitDetails({});
      setRepoCommitCounts({});
    } finally {
      setLoadingRepoCommits(false);
      setLoadingCommitDetails(false);
    }
  };

  // Handle Repo Dropdown Selection (for commits destination)
  const handleRepoSelect = (repoFullName: string) => {
    setSelectedRepoFullName(repoFullName);
    const foundRepo = authState.repos.find((r) => r.fullName === repoFullName);
    if (foundRepo) {
      setSelectedBranch(foundRepo.defaultBranch || "main");
    }
  };

  // Handle view repo selection (for graph display)
  const handleViewRepoSelect = (repoFullName: string) => {
    setViewRepoFullName(repoFullName);
  };

  // Logout function
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setAuthState({
        authenticated: false,
        user: null,
        repos: [],
        loginUrl: "",
        githubContributions: {},
      });
      setRepoCommitCounts({});
      setGithubCommitDetails({});
      const response = await fetch("/api/auth/user");
      const data = await response.json();
      setAuthState((prev) => ({ ...prev, loginUrl: data.loginUrl }));
    } catch (err) {
      console.error("Erro no logout:", err);
    }
  };

  // Generate days based on selectedYear
  const gridDays = useMemo(() => {
    const days: CommitDay[] = [];
    const currentYear = new Date().getFullYear();
    
    let startDate: Date;
    let endDate: Date;
    
    if (selectedYear === currentYear) {
      // Show trailing 12 months (last 371 days) ending on the current Saturday
      const today = new Date();
      const dayOfWeek = today.getDay();
      
      endDate = new Date(today);
      endDate.setDate(today.getDate() + (6 - dayOfWeek));
      
      startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 370);
    } else {
      // Show calendar year for selectedYear (Jan 1 to Dec 31, aligned to Sunday-Saturday weeks)
      startDate = new Date(selectedYear, 0, 1);
      const startDayOfWeek = startDate.getDay();
      startDate.setDate(startDate.getDate() - startDayOfWeek); // Roll back to Sunday
      
      endDate = new Date(selectedYear, 11, 31);
      const endDayOfWeek = endDate.getDay();
      endDate.setDate(endDate.getDate() + (6 - endDayOfWeek)); // Roll forward to Saturday
    }

    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split("T")[0];
      
      const existingCount = repoCommitCounts[dateStr] || 0;
      const newCount = selectedDates[dateStr] || 0;
      const totalCount = existingCount + newCount;

      days.push({
        dateStr,
        date: new Date(current),
        existingCount,
        newCount,
        totalCount,
      });
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [selectedYear, selectedDates, repoCommitCounts]);

  // Group days into weeks for column layout
  const weeks = useMemo(() => {
    const cols: CommitDay[][] = [];
    let currentWeek: CommitDay[] = [];
    
    gridDays.forEach((day, index) => {
      currentWeek.push(day);
      if (currentWeek.length === 7 || index === gridDays.length - 1) {
        cols.push(currentWeek);
        currentWeek = [];
      }
    });
    
    return cols;
  }, [gridDays]);

  // Total contribution count in the currently selected grid
  const totalContributions = useMemo(() => {
    return gridDays.reduce((sum, day) => sum + day.totalCount, 0);
  }, [gridDays]);

  // List of years to display in the switch (current year down to user's creation year, or current - 4 fallback)
  const yearsList = useMemo(() => {
    const current = new Date().getFullYear();
    let startYear = current - 4;
    
    if (authState.user?.createdAt) {
      const createdYear = new Date(authState.user.createdAt).getFullYear();
      if (createdYear < current) {
        startYear = createdYear;
      }
    }
    
    const list = [];
    for (let y = current; y >= startYear; y--) {
      list.push(y);
    }
    return list;
  }, [authState.user?.createdAt]);

  // Toggle/Increment commit count for a specific day
  const handleDayClick = (dateStr: string) => {
    // If there are existing commits for this day, open modal
    const dayCommits = githubCommitDetails[dateStr];
    if (dayCommits && dayCommits.length > 0) {
      setSelectedDay(dateStr);
      setShowCommitModal(true);
      setRedateTarget(null);
      setNewDateForCommit("");
      setRedateLogs([]);
      return;
    }

    setSelectedDates((prev) => {
      const current = prev[dateStr] || 0;
      let next = 0;
      if (current === 0) next = 1;
      else if (current === 1) next = 3;
      else if (current === 3) next = 6;
      else if (current === 6) next = 10;
      else next = 0;

      const updated = { ...prev };
      if (next === 0) {
        delete updated[dateStr];
      } else {
        updated[dateStr] = next;
      }
      return updated;
    });
  };

  // Handle redate commit
  const handleRedateCommit = async () => {
    if (!redateTarget || !newDateForCommit) return;

    setRedateLoading(true);
    setRedateLogs([]);

    try {
      const res = await fetch("/api/github/redate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoFullName: redateTarget.repoFullName,
          commitSha: redateTarget.sha,
          newDate: newDateForCommit,
          branch: selectedBranch,
        }),
      });

      const data = await res.json();

      if (data.logs) {
        setRedateLogs(data.logs);
      }

      if (res.ok) {
        setStatusMessage({ text: data.message || "Data alterada com sucesso!", type: "success" });
        // Refresh commit details for the current repo
        if (viewRepoFullName) {
          await fetchRepoCommits(viewRepoFullName, selectedYear);
        }
      } else {
        setStatusMessage({ text: data.error || "Erro ao alterar data do commit.", type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || "Erro de conexão.", type: "error" });
    } finally {
      setRedateLoading(false);
    }
  };

  // Apply batch commits to a date range
  const applyRange = () => {
    if (!startDateStr || !endDateStr) {
      setStatusMessage({ text: "Selecione as datas de início e fim para o intervalo.", type: "error" });
      return;
    }

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    if (start > end) {
      setStatusMessage({ text: "A data de início deve ser anterior ou igual à data de fim.", type: "error" });
      return;
    }

    const newDates = { ...selectedDates };
    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      if (rangeCommits > 0) {
        newDates[dateStr] = rangeCommits;
      } else {
        delete newDates[dateStr];
      }
      current.setDate(current.getDate() + 1);
    }

    setSelectedDates(newDates);
    setStatusMessage({ text: "Intervalo aplicado com sucesso!", type: "success" });
  };

  // Clear all selected dates
  const clearGrid = () => {
    setSelectedDates({});
    setStatusMessage({ text: "Grid limpo.", type: "success" });
  };

  // Fill random pattern
  const fillRandom = () => {
    const newDates: { [key: string]: number } = {};
    gridDays.forEach((day) => {
      if (Math.random() < 0.3) {
        const intensities = [1, 3, 6, 10];
        newDates[day.dateStr] = intensities[Math.floor(Math.random() * intensities.length)];
      }
    });
    setSelectedDates(newDates);
    setStatusMessage({ text: "Padrão aleatório gerado!", type: "success" });
  };

  // Determine contribution color class
  const getColorClass = (count: number) => {
    if (count === 0) return "bg-zinc-800 border-zinc-700 hover:bg-zinc-700";
    if (count <= 2) return "bg-emerald-900 border-emerald-800 hover:bg-emerald-800";
    if (count <= 5) return "bg-emerald-700 border-emerald-600 hover:bg-emerald-600";
    if (count <= 9) return "bg-emerald-500 border-emerald-400 hover:bg-emerald-400";
    return "bg-emerald-400 border-emerald-300 hover:bg-emerald-300";
  };

  // Submit commits to the cloud
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRepoFullName) {
      setStatusMessage({ text: "Selecione um repositório de destino.", type: "error" });
      return;
    }

    const commitList = Object.entries(selectedDates).map(([dateStr, count]) => {
      const dateTimeStr = `${dateStr}T${commitTime}`;
      return {
        date: dateTimeStr,
        count,
        message: commitMessage,
      };
    });

    if (commitList.length === 0) {
      setStatusMessage({ text: "Selecione pelo menos um dia no gráfico para criar commits.", type: "error" });
      return;
    }

    setLoading(true);
    setStatusMessage({ text: "", type: "" });
    setLogs([]);

    try {
      const response = await fetch("/api/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoFullName: selectedRepoFullName,
          branch: selectedBranch,
          commits: commitList,
          forcePush,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatusMessage({ text: data.message, type: "success" });
        if (data.logs) {
          setLogs(data.logs);
        }
        // Refresh the graph if we're viewing the same repo
        if (viewRepoFullName === selectedRepoFullName) {
          setTimeout(() => fetchRepoCommits(viewRepoFullName, selectedYear), 2000);
        }
      } else {
        setStatusMessage({ text: data.error || "Ocorreu um erro ao processar a requisição.", type: "error" });
        if (data.logs) {
          setLogs(data.logs);
        }
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || "Erro de conexão com o servidor.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // If not authenticated, show login screen
  if (!authState.authenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
        {/* Header */}
        <header className="border-b border-slate-900 bg-slate-900/50 backdrop-blur sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-bold text-slate-950 shadow-lg shadow-emerald-500/20">
              G
            </div>
            <div>
              <h1 className="font-bold text-lg leading-none tracking-tight">Git Chronos</h1>
              <span className="text-xs text-slate-500 font-medium">Visualização & Controle de Histórico</span>
            </div>
          </div>
        </header>

        {/* Login CTA */}
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-8">
            <div className="space-y-4">
              <div className="h-20 w-20 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-bold text-slate-950 text-3xl shadow-2xl shadow-emerald-500/20 mx-auto">
                G
              </div>
              <h2 className="text-3xl font-bold">Bem-vindo ao Git Chronos</h2>
              <p className="text-slate-400 text-sm leading-relaxed max-w-sm mx-auto">
                Gerencie seu histórico de contribuições do GitHub diretamente na nuvem. Crie commits retroativos, altere datas e visualize seu gráfico — tudo sem repositório local.
              </p>
            </div>

            <div className="space-y-4">
              {authState.loginUrl ? (
                <a
                  href={authState.loginUrl}
                  className="inline-flex items-center gap-3 bg-slate-900 hover:bg-slate-800 text-slate-100 font-bold px-8 py-4 rounded-2xl border border-slate-800 transition-all shadow-xl hover:shadow-2xl hover:shadow-emerald-500/5 text-sm"
                >
                  <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  Conectar com GitHub
                </a>
              ) : (
                <div className="flex items-center justify-center gap-3 text-slate-500 text-sm">
                  <div className="h-4 w-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                  Carregando...
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4">
              <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 text-center">
                <div className="text-emerald-400 text-lg font-bold mb-1">☁️</div>
                <p className="text-[10px] text-slate-400 font-medium">100% na Nuvem</p>
              </div>
              <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 text-center">
                <div className="text-emerald-400 text-lg font-bold mb-1">📅</div>
                <p className="text-[10px] text-slate-400 font-medium">Commits Retroativos</p>
              </div>
              <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 text-center">
                <div className="text-emerald-400 text-lg font-bold mb-1">🔄</div>
                <p className="text-[10px] text-slate-400 font-medium">Alterar Datas</p>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-900 bg-slate-950 px-6 py-6 text-center text-xs text-slate-600">
          <p>© 2026 Git Chronos. Gerencie seu histórico de contribuições na nuvem.</p>
        </footer>
      </div>
    );
  }

  // Authenticated view
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      
      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-900/50 backdrop-blur sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-bold text-slate-950 shadow-lg shadow-emerald-500/20">
            G
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none tracking-tight">Git Chronos</h1>
            <span className="text-xs text-slate-500 font-medium">Visualização & Controle de Histórico</span>
          </div>
        </div>

        {/* Auth Section */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl p-1.5 pr-4">
            <img
              src={authState.user!.avatarUrl}
              alt={authState.user!.name}
              className="h-8 w-8 rounded-lg border border-slate-700 object-cover"
            />
            <div className="flex flex-col">
              <span className="text-xs font-bold leading-none text-slate-200">{authState.user!.name}</span>
              <span className="text-[10px] text-slate-500 font-medium">@{authState.user!.login}</span>
            </div>
            <button
              onClick={handleLogout}
              className="ml-2 text-xs text-rose-400 hover:text-rose-300 font-semibold px-2 py-1 rounded-lg hover:bg-rose-950/20 transition-all"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 flex flex-col gap-8">
        
        {/* Intro */}
        <section className="bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-900 rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
          <h2 className="text-2xl font-bold mb-2">Gerencie seu Histórico na Nuvem</h2>
          <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">
            Selecione um repositório do GitHub, visualize seus commits no gráfico de contribuição e crie commits retroativos diretamente na nuvem — sem necessidade de repositório local.
          </p>
        </section>

        {/* Repository Selection & Push Config */}
        <section className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col gap-4">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-400">Repositório de Destino</h3>
            
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-300">Selecione o Repositório</label>
              <select
                value={selectedRepoFullName}
                onChange={(e) => handleRepoSelect(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              >
                {authState.repos.map((repo) => (
                  <option key={repo.id} value={repo.fullName}>
                    {repo.fullName} {repo.private ? "(Privado)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-2">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-300">Branch de Destino</label>
                <input
                  type="text"
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  placeholder="main"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div className="flex flex-col gap-2 justify-end">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-rose-400 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3">
                  <input
                    type="checkbox"
                    checked={forcePush}
                    onChange={(e) => setForcePush(e.target.checked)}
                    className="rounded border-slate-800 bg-slate-950 text-rose-500 focus:ring-0"
                  />
                  Forçar Push (--force)
                </label>
              </div>
            </div>
          </div>

        </section>

        {/* Gráfico de Contribuição com Switch de Anos */}
        <div className="flex flex-col lg:flex-row gap-6 items-start w-full">
          {/* Contribution Graph Section */}
          <section className="flex-1 bg-slate-900/20 border border-slate-900 rounded-2xl p-6 flex flex-col gap-6 w-full lg:max-w-[calc(100%-120px)] overflow-hidden">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-6">
                <div>
                  <h3 className="font-bold text-base">
                    {totalContributions} {totalContributions === 1 ? "contribuição" : "contribuições"}{" "}
                    {selectedYear === new Date().getFullYear() ? "no último ano" : `em ${selectedYear}`}
                  </h3>
                  <p className="text-xs text-slate-400">Clique nos blocos para adicionar commits na data correspondente.</p>
                </div>

                {/* Repo Filter for Graph */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Visualizar Repo</label>
                  <select
                    value={viewRepoFullName}
                    onChange={(e) => handleViewRepoSelect(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Nenhum (limpo)</option>
                    {authState.repos.map((repo) => (
                      <option key={repo.id} value={repo.fullName}>
                        {repo.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                {loadingRepoCommits && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <div className="h-3 w-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    Carregando...
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Menos</span>
                <div className="h-3 w-3 rounded bg-zinc-800"></div>
                <div className="h-3 w-3 rounded bg-emerald-900"></div>
                <div className="h-3 w-3 rounded bg-emerald-700"></div>
                <div className="h-3 w-3 rounded bg-emerald-500"></div>
                <div className="h-3 w-3 rounded bg-emerald-400"></div>
                <span>Mais</span>
              </div>
            </div>

            {/* Grid Container */}
            <div className="w-full overflow-x-auto pb-2">
              <div className="min-w-max p-1">
                {/* Month Labels Row */}
                <div className="flex" style={{ marginLeft: '28px' }}>
                  {(() => {
                    const labels: { text: string; colSpan: number }[] = [];
                    let prevLabel = '';
                    weeks.forEach((week) => {
                      // Use the first day of each week to determine month
                      const firstDay = week[0];
                      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                      const m = firstDay.date.getMonth();
                      const y = firstDay.date.getFullYear();
                      const label = `${monthNames[m]}`;
                      const fullLabel = `${monthNames[m]} ${y}`;
                      if (label !== prevLabel) {
                        labels.push({ text: fullLabel, colSpan: 1 });
                        prevLabel = label;
                      } else {
                        labels[labels.length - 1].colSpan += 1;
                      }
                    });
                    return labels.map((l, i) => (
                      <span
                        key={i}
                        className="text-[10px] text-slate-500 leading-none"
                        style={{
                          width: `${l.colSpan * 14}px`,
                          flexShrink: 0,
                          textAlign: 'left',
                          paddingLeft: '2px',
                        }}
                      >
                        {l.colSpan >= 3 ? l.text : ''}
                      </span>
                    ));
                  })()}
                </div>

                {/* Day labels + Grid */}
                <div className="flex">
                  {/* Day-of-week labels */}
                  <div className="flex flex-col gap-[3px] mr-1 pt-0" style={{ width: '24px', flexShrink: 0 }}>
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((dayName, i) => (
                      <span
                        key={dayName}
                        className="text-[9px] text-slate-500 leading-none flex items-center"
                        style={{ height: '11px' }}
                      >
                        {i % 2 === 1 ? dayName : ''}
                      </span>
                    ))}
                  </div>

                  {/* Contribution squares */}
                  <div className="flex gap-[3px]">
                    {weeks.map((week, wIndex) => (
                      <div key={wIndex} className="flex flex-col gap-[3px]">
                        {week.map((day) => (
                          <button
                            key={day.dateStr}
                            onClick={() => handleDayClick(day.dateStr)}
                            title={`${new Date(day.date).toLocaleDateString("pt-BR", {
                              weekday: "long",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}: ${day.existingCount} existentes + ${day.newCount} novos = ${day.totalCount} total`}
                            className={`h-[11px] w-[11px] rounded-[2px] transition-colors border-[0.5px] ${getColorClass(
                              day.totalCount
                            )}`}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Switch de Anos */}
          <div className="flex flex-row lg:flex-col gap-1.5 w-full lg:w-28 shrink-0 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
            {yearsList.map((y) => {
              const isActive = selectedYear === y;
              return (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all text-center lg:text-left ${
                    isActive
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/15"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                  }`}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>

        {/* Range Selection & Details Form */}
        <section className="grid md:grid-cols-2 gap-8">
          
          {/* Form details */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col gap-4">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-400">Detalhes dos Commits</h3>
            
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-300">Mensagem de Commit Padrão</label>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-300">Horário do Commit</label>
                  <input
                    type="time"
                    step="1"
                    value={commitTime}
                    onChange={(e) => setCommitTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-300">Quantidade de Commits / Clique</label>
                  <select
                    value={commitsPerDay}
                    onChange={(e) => setCommitsPerDay(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    <option value={1}>1 Commit</option>
                    <option value={3}>3 Commits (Médio)</option>
                    <option value={6}>6 Commits (Intenso)</option>
                    <option value={10}>10 Commits (Muito Intenso)</option>
                  </select>
                </div>
              </div>

              {statusMessage.text && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold ${
                    statusMessage.type === "success"
                      ? "bg-emerald-950/50 border border-emerald-900 text-emerald-400"
                      : "bg-rose-950/50 border border-rose-900 text-rose-400"
                  }`}
                >
                  {statusMessage.text}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 font-bold py-3.5 px-6 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10 mt-2"
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                    Clonando, criando commits e enviando...
                  </>
                ) : (
                  `Gerar e Enviar ${Object.values(selectedDates).reduce((a, b) => a + b, 0)} Commits`
                )}
              </button>
            </form>
          </div>

          {/* Batch Range Selection & Logs */}
          <div className="flex flex-col gap-6">
            
            {/* Range Selector */}
            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col gap-4">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-400">Preenchimento de Intervalo Rápido</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-300">Data Inicial</label>
                  <input
                    type="date"
                    value={startDateStr}
                    onChange={(e) => setStartDateStr(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-300">Data Final</label>
                  <input
                    type="date"
                    value={endDateStr}
                    onChange={(e) => setEndDateStr(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1 flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-300">Quantidade por Dia</label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={rangeCommits}
                    onChange={(e) => setRangeCommits(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <button
                  type="button"
                  onClick={applyRange}
                  className="bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs px-6 py-3.5 rounded-xl transition-all h-fit mt-auto"
                >
                  Aplicar Intervalo
                </button>
              </div>
            </div>

            {/* Logs Console */}
            <div className="bg-slate-950 border border-slate-900 rounded-2xl p-6 flex-1 flex flex-col gap-3 min-h-[200px]">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-400">Terminal de Logs</h3>
              <div className="bg-black/60 rounded-xl p-4 flex-1 font-mono text-xs text-emerald-400 overflow-y-auto max-h-[240px] border border-slate-900">
                {logs.length === 0 ? (
                  <span className="text-slate-600">// Aguardando execução...</span>
                ) : (
                  logs.map((log, index) => <div key={index}>{`> ${log}`}</div>)
                )}
              </div>
            </div>

          </div>

        </section>

      </main>

      {/* Commit Details Modal */}
      {showCommitModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => setShowCommitModal(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Modal Content */}
          <div
            className="relative w-full max-w-2xl max-h-[85vh] bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl shadow-black/50 flex flex-col animate-[modalIn_0.25s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div>
                <h3 className="font-bold text-lg text-slate-100">
                  Commits em{" "}
                  {new Date(selectedDay + "T12:00:00").toLocaleDateString("pt-BR", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {githubCommitDetails[selectedDay]?.length || 0} commit(s) encontrado(s)
                </p>
              </div>
              <button
                onClick={() => setShowCommitModal(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors text-lg"
              >
                ✕
              </button>
            </div>

            {/* Commits List */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {(githubCommitDetails[selectedDay] || []).map((commit) => (
                <div
                  key={`${commit.repoFullName}-${commit.sha}`}
                  className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono bg-slate-800 text-emerald-400 px-2 py-0.5 rounded-md">
                          {commit.sha.substring(0, 7)}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium truncate">
                          {commit.repoFullName}
                        </span>
                      </div>
                      <p className="text-sm text-slate-200 font-medium truncate">
                        {commit.message}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {new Date(commit.date).toLocaleString("pt-BR")}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {commit.url && (
                        <a
                          href={commit.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-slate-400 hover:text-emerald-400 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800"
                        >
                          Ver ↗
                        </a>
                      )}
                      <button
                        onClick={() => {
                          if (redateTarget?.sha === commit.sha) {
                            setRedateTarget(null);
                            setNewDateForCommit("");
                          } else {
                            setRedateTarget({ sha: commit.sha, repoFullName: commit.repoFullName });
                            setNewDateForCommit("");
                            setRedateLogs([]);
                          }
                        }}
                        className={`text-[10px] font-semibold px-3 py-1.5 rounded-lg transition-all ${
                          redateTarget?.sha === commit.sha
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                        }`}
                      >
                        Alterar Data
                      </button>
                    </div>
                  </div>

                  {/* Redate form for this commit */}
                  {redateTarget?.sha === commit.sha && (
                    <div className="mt-3 pt-3 border-t border-slate-800 space-y-3 animate-[modalIn_0.15s_ease-out]">
                      <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg p-3">
                        <p className="text-[10px] text-amber-400 font-semibold flex items-center gap-1.5">
                          ⚠️ Atenção: Isso fará force push e reescreverá o histórico do repositório.
                        </p>
                      </div>

                      <div className="flex items-end gap-3">
                        <div className="flex-1 flex flex-col gap-1.5">
                          <label className="text-[10px] font-semibold text-slate-400 uppercase">Nova Data e Horário</label>
                          <input
                            type="datetime-local"
                            value={newDateForCommit}
                            onChange={(e) => setNewDateForCommit(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                          />
                        </div>
                        <button
                          onClick={handleRedateCommit}
                          disabled={redateLoading || !newDateForCommit}
                          className="bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-lg transition-all disabled:opacity-40 hover:opacity-90 flex items-center gap-2 shrink-0"
                        >
                          {redateLoading ? (
                            <>
                              <div className="h-3 w-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                              Processando...
                            </>
                          ) : (
                            "Confirmar Alteração"
                          )}
                        </button>
                      </div>

                      {/* Redate logs */}
                      {redateLogs.length > 0 && (
                        <div className="bg-black/60 rounded-lg p-3 font-mono text-[10px] text-emerald-400 max-h-[120px] overflow-y-auto border border-slate-900">
                          {redateLogs.map((log, i) => (
                            <div key={i} className="leading-relaxed">{`> ${log}`}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {(!githubCommitDetails[selectedDay] || githubCommitDetails[selectedDay].length === 0) && (
                <div className="text-center py-12">
                  <p className="text-slate-500 text-sm">Nenhum commit encontrado para este dia.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 px-6 py-6 text-center text-xs text-slate-600 mt-12">
        <p>© 2026 Git Chronos. Gerencie seu histórico de contribuições na nuvem.</p>
      </footer>
    </div>
  );
}
