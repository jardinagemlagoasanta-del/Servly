"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

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
  authorName: string;
  authorLogin: string;
  authorAvatarUrl: string;
}

export default function Home() {
  // App States
  const [commitMessage, setCommitMessage] = useState("chore: update history");
  const [commitTime, setCommitTime] = useState("12:00:00");
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

  // Day popover state (new: for setting exact commit count)
  const [popoverDay, setPopoverDay] = useState<string | null>(null);
  const [popoverCount, setPopoverCount] = useState<number>(1);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverInputRef = useRef<HTMLInputElement>(null);

  // Show preview panel
  const [showPreview, setShowPreview] = useState(false);

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

  // Close popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverDay(null);
      }
    };
    if (popoverDay) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [popoverDay]);

  // Focus input when popover opens
  useEffect(() => {
    if (popoverDay && popoverInputRef.current) {
      popoverInputRef.current.focus();
      popoverInputRef.current.select();
    }
  }, [popoverDay]);

  // Fetch commits for a specific repo (for graph display)
  const fetchRepoCommits = async (repoFullName: string, year: number) => {
    setLoadingRepoCommits(true);
    setLoadingCommitDetails(true);
    try {
      const res = await fetch(`/api/github/commits?repo=${encodeURIComponent(repoFullName)}&year=${year}`);
      const data = await res.json();
      if (res.ok && data.commitsByDate) {
        setGithubCommitDetails(data.commitsByDate);
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
      const today = new Date();
      const dayOfWeek = today.getDay();
      endDate = new Date(today);
      endDate.setDate(today.getDate() + (6 - dayOfWeek));
      startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 370);
    } else {
      startDate = new Date(selectedYear, 0, 1);
      const startDayOfWeek = startDate.getDay();
      startDate.setDate(startDate.getDate() - startDayOfWeek);
      endDate = new Date(selectedYear, 11, 31);
      const endDayOfWeek = endDate.getDay();
      endDate.setDate(endDate.getDate() + (6 - endDayOfWeek));
    }

    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split("T")[0];
      const existingCount = repoCommitCounts[dateStr] || 0;
      const newCount = selectedDates[dateStr] || 0;
      const totalCount = existingCount + newCount;
      days.push({ dateStr, date: new Date(current), existingCount, newCount, totalCount });
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

  // Total contribution count
  const totalContributions = useMemo(() => {
    return gridDays.reduce((sum, day) => sum + day.totalCount, 0);
  }, [gridDays]);

  // List of years
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

  // Total new commits to be created
  const totalNewCommits = useMemo(() => {
    return Object.values(selectedDates).reduce((a, b) => a + b, 0);
  }, [selectedDates]);

  // Sorted selected dates for preview
  const sortedSelectedDates = useMemo(() => {
    return Object.entries(selectedDates)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateStr, count]) => ({ dateStr, count }));
  }, [selectedDates]);

  // Handle day click — open popover to set exact count
  const handleDayClick = useCallback((dateStr: string, e: React.MouseEvent) => {
    // If there are existing commits for this day, open commit detail modal
    const dayCommits = githubCommitDetails[dateStr];
    if (dayCommits && dayCommits.length > 0) {
      setSelectedDay(dateStr);
      setShowCommitModal(true);
      setRedateTarget(null);
      setNewDateForCommit("");
      setRedateLogs([]);
      return;
    }

    // Open popover for setting commit count
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPopoverPos({ x: rect.left + rect.width / 2, y: rect.bottom + 8 });
    setPopoverCount(selectedDates[dateStr] || 1);
    setPopoverDay(dateStr);
  }, [githubCommitDetails, selectedDates]);

  // Apply popover count
  const applyPopoverCount = useCallback(() => {
    if (!popoverDay) return;
    setSelectedDates((prev) => {
      const updated = { ...prev };
      if (popoverCount <= 0) {
        delete updated[popoverDay];
      } else {
        updated[popoverDay] = popoverCount;
      }
      return updated;
    });
    setPopoverDay(null);
  }, [popoverDay, popoverCount]);

  // Remove a single date from selected
  const removeSelectedDate = (dateStr: string) => {
    setSelectedDates((prev) => {
      const updated = { ...prev };
      delete updated[dateStr];
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
      if (data.logs) setRedateLogs(data.logs);
      if (res.ok) {
        setStatusMessage({ text: data.message || "Data alterada com sucesso!", type: "success" });
        if (viewRepoFullName) await fetchRepoCommits(viewRepoFullName, selectedYear);
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
      setStatusMessage({ text: "Selecione as datas de início e fim.", type: "error" });
      return;
    }
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    if (start > end) {
      setStatusMessage({ text: "Data de início deve ser anterior à data de fim.", type: "error" });
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
    setStatusMessage({ text: "Intervalo aplicado!", type: "success" });
  };

  // Clear all selected dates
  const clearGrid = () => {
    setSelectedDates({});
    setStatusMessage({ text: "Seleção limpa.", type: "success" });
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

  // Determine contribution color
  const getColorClass = (day: CommitDay) => {
    if (day.newCount > 0) {
      // Highlight new commits with a distinct blue/purple tint
      if (day.newCount <= 2) return "bg-blue-800 border-blue-600 hover:bg-blue-700 ring-1 ring-blue-500/30";
      if (day.newCount <= 5) return "bg-blue-600 border-blue-500 hover:bg-blue-500 ring-1 ring-blue-400/40";
      if (day.newCount <= 9) return "bg-blue-500 border-blue-400 hover:bg-blue-400 ring-1 ring-blue-300/50";
      return "bg-blue-400 border-blue-300 hover:bg-blue-300 ring-1 ring-blue-200/50";
    }
    const count = day.totalCount;
    if (count === 0) return "bg-zinc-800 border-zinc-700 hover:bg-zinc-700";
    if (count <= 2) return "bg-emerald-900 border-emerald-800 hover:bg-emerald-800";
    if (count <= 5) return "bg-emerald-700 border-emerald-600 hover:bg-emerald-600";
    if (count <= 9) return "bg-emerald-500 border-emerald-400 hover:bg-emerald-400";
    return "bg-emerald-400 border-emerald-300 hover:bg-emerald-300";
  };

  // Submit commits
  const handleSubmit = async () => {
    if (!selectedRepoFullName) {
      setStatusMessage({ text: "Selecione um repositório de destino.", type: "error" });
      return;
    }
    const commitList = Object.entries(selectedDates).map(([dateStr, count]) => {
      const dateTimeStr = `${dateStr}T${commitTime}`;
      return { date: dateTimeStr, count, message: commitMessage };
    });
    if (commitList.length === 0) {
      setStatusMessage({ text: "Selecione pelo menos um dia no gráfico.", type: "error" });
      return;
    }
    setLoading(true);
    setStatusMessage({ text: "", type: "" });
    setLogs([]);
    setShowPreview(false);
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
        if (data.logs) setLogs(data.logs);
        setSelectedDates({});
        if (viewRepoFullName === selectedRepoFullName) {
          setTimeout(() => fetchRepoCommits(viewRepoFullName, selectedYear), 2000);
        }
      } else {
        setStatusMessage({ text: data.error || "Erro ao processar.", type: "error" });
        if (data.logs) setLogs(data.logs);
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || "Erro de conexão.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };

  // ======================================================
  // LOGIN SCREEN
  // ======================================================
  if (!authState.authenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
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

        <footer className="border-t border-slate-900 bg-slate-950 px-6 py-6 text-center text-xs text-slate-600">
          <p>© 2026 Git Chronos. Gerencie seu histórico de contribuições na nuvem.</p>
        </footer>
      </div>
    );
  }

  // ======================================================
  // AUTHENTICATED VIEW
  // ======================================================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      
      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-900/50 backdrop-blur sticky top-0 z-50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-bold text-slate-950 shadow-lg shadow-emerald-500/20">
            G
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none tracking-tight">Git Chronos</h1>
            <span className="text-xs text-slate-500 font-medium">Visualização & Controle de Histórico</span>
          </div>
        </div>

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
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 flex flex-col gap-6">
        
        {/* ── Top Bar: Repo + Config (compact single row) ── */}
        <section className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5">
          <div className="flex flex-wrap items-end gap-4">
            {/* Repo */}
            <div className="flex flex-col gap-1.5 min-w-[220px] flex-1">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Repositório de Destino</label>
              <select
                value={selectedRepoFullName}
                onChange={(e) => handleRepoSelect(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              >
                {authState.repos.map((repo) => (
                  <option key={repo.id} value={repo.fullName}>
                    {repo.fullName} {repo.private ? "🔒" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Branch */}
            <div className="flex flex-col gap-1.5 w-36">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Branch</label>
              <input
                type="text"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            {/* Commit message */}
            <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Mensagem de Commit</label>
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            {/* Time */}
            <div className="flex flex-col gap-1.5 w-32">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Horário</label>
              <input
                type="time"
                step="1"
                value={commitTime}
                onChange={(e) => setCommitTime(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            {/* Force push */}
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-rose-400 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 h-fit whitespace-nowrap">
              <input
                type="checkbox"
                checked={forcePush}
                onChange={(e) => setForcePush(e.target.checked)}
                className="rounded border-slate-800 bg-slate-950 text-rose-500 focus:ring-0"
              />
              Force Push
            </label>
          </div>
        </section>

        {/* ── Contribution Graph + Year Switcher ── */}
        <div className="flex flex-col lg:flex-row gap-4 items-start w-full">
          {/* Graph */}
          <section className="flex-1 bg-slate-900/20 border border-slate-900 rounded-2xl p-5 flex flex-col gap-4 w-full lg:max-w-[calc(100%-120px)] overflow-hidden relative">
            
            {/* Graph Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4">
                <div>
                  <h3 className="font-bold text-sm">
                    {totalContributions} {totalContributions === 1 ? "contribuição" : "contribuições"}{" "}
                    {selectedYear === new Date().getFullYear() ? "no último ano" : `em ${selectedYear}`}
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Clique num dia para definir a quantidade exata de commits.{" "}
                    <span className="text-blue-400">■</span> = novos commits selecionados
                  </p>
                </div>

                {/* View Repo Filter */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Visualizar</label>
                  <select
                    value={viewRepoFullName}
                    onChange={(e) => handleViewRepoSelect(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Nenhum (limpo)</option>
                    {authState.repos.map((repo) => (
                      <option key={repo.id} value={repo.fullName}>{repo.fullName}</option>
                    ))}
                  </select>
                </div>

                {loadingRepoCommits && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <div className="h-3 w-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              
              {/* Legend + Quick Actions */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  <span>Menos</span>
                  <div className="h-3 w-3 rounded bg-zinc-800"></div>
                  <div className="h-3 w-3 rounded bg-emerald-900"></div>
                  <div className="h-3 w-3 rounded bg-emerald-700"></div>
                  <div className="h-3 w-3 rounded bg-emerald-500"></div>
                  <div className="h-3 w-3 rounded bg-emerald-400"></div>
                  <span>Mais</span>
                  <span className="mx-1 text-slate-700">|</span>
                  <div className="h-3 w-3 rounded bg-blue-600 ring-1 ring-blue-400/40"></div>
                  <span className="text-blue-400">Novos</span>
                </div>

                <div className="flex gap-1.5">
                  <button onClick={fillRandom} className="text-[10px] px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all font-medium">
                    🎲 Aleatório
                  </button>
                  <button onClick={clearGrid} className="text-[10px] px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all font-medium">
                    🗑 Limpar
                  </button>
                </div>
              </div>
            </div>

            {/* Grid */}
            <div className="w-full overflow-x-auto pb-2">
              <div className="min-w-max p-1">
                {/* Month Labels */}
                <div className="flex" style={{ marginLeft: '28px' }}>
                  {(() => {
                    const labels: { text: string; colSpan: number }[] = [];
                    let prevLabel = '';
                    weeks.forEach((week) => {
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
                        style={{ width: `${l.colSpan * 14}px`, flexShrink: 0, textAlign: 'left', paddingLeft: '2px' }}
                      >
                        {l.colSpan >= 3 ? l.text : ''}
                      </span>
                    ));
                  })()}
                </div>

                {/* Day labels + Grid */}
                <div className="flex">
                  <div className="flex flex-col gap-[3px] mr-1 pt-0" style={{ width: '24px', flexShrink: 0 }}>
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((dayName, i) => (
                      <span key={dayName} className="text-[9px] text-slate-500 leading-none flex items-center" style={{ height: '11px' }}>
                        {i % 2 === 1 ? dayName : ''}
                      </span>
                    ))}
                  </div>

                  <div className="flex gap-[3px]">
                    {weeks.map((week, wIndex) => (
                      <div key={wIndex} className="flex flex-col gap-[3px]">
                        {week.map((day) => (
                          <button
                            key={day.dateStr}
                            onClick={(e) => handleDayClick(day.dateStr, e)}
                            title={`${new Date(day.date).toLocaleDateString("pt-BR", {
                              weekday: "long", year: "numeric", month: "long", day: "numeric",
                            })}: ${day.existingCount} existentes + ${day.newCount} novos = ${day.totalCount} total`}
                            className={`h-[11px] w-[11px] rounded-[2px] transition-all border-[0.5px] ${getColorClass(day)}`}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Day Popover — set exact commit count */}
            {popoverDay && (
              <div
                ref={popoverRef}
                className="fixed z-[200] animate-fadeIn"
                style={{ left: popoverPos.x - 110, top: popoverPos.y }}
              >
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-2xl shadow-black/50 w-[220px]">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase mb-2">
                    {formatDate(popoverDay)}
                  </p>
                  <div className="flex items-center gap-2 mb-3">
                    <label className="text-xs text-slate-300 whitespace-nowrap">Commits:</label>
                    <input
                      ref={popoverInputRef}
                      type="number"
                      min="0"
                      max="50"
                      value={popoverCount}
                      onChange={(e) => setPopoverCount(Math.max(0, Number(e.target.value)))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyPopoverCount();
                        if (e.key === "Escape") setPopoverDay(null);
                      }}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-emerald-500 transition-colors w-16"
                    />
                  </div>
                  {/* Quick count buttons */}
                  <div className="flex gap-1.5 mb-3">
                    {[1, 3, 5, 10].map((n) => (
                      <button
                        key={n}
                        onClick={() => setPopoverCount(n)}
                        className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg transition-all ${
                          popoverCount === n
                            ? "bg-emerald-500 text-slate-950"
                            : "bg-slate-900 text-slate-400 hover:bg-slate-700 hover:text-white"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={applyPopoverCount}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs py-2 rounded-lg transition-all"
                    >
                      Aplicar
                    </button>
                    <button
                      onClick={() => {
                        setPopoverCount(0);
                        applyPopoverCount();
                      }}
                      className="text-xs text-slate-500 hover:text-rose-400 px-2 py-2 rounded-lg hover:bg-slate-900 transition-all"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Year Switcher */}
          <div className="flex flex-row lg:flex-col gap-1.5 w-full lg:w-24 shrink-0 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
            {yearsList.map((y) => {
              const isActive = selectedYear === y;
              return (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all text-center lg:text-left ${
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

        {/* ── Bottom: Range Fill + Preview/Summary + Logs ── */}
        <section className="grid md:grid-cols-3 gap-4">

          {/* Range Fill (compact) */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 flex flex-col gap-3">
            <h3 className="font-semibold text-xs uppercase tracking-wider text-slate-500 flex items-center gap-2">
              ⚡ Preenchimento Rápido
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-slate-400">Início</label>
                <input
                  type="date"
                  value={startDateStr}
                  onChange={(e) => setStartDateStr(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-slate-400">Fim</label>
                <input
                  type="date"
                  value={endDateStr}
                  onChange={(e) => setEndDateStr(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-slate-400">Commits/dia</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={rangeCommits}
                  onChange={(e) => setRangeCommits(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              <button
                onClick={applyRange}
                className="bg-slate-800 hover:bg-slate-700 text-white font-semibold text-[10px] px-4 py-2 rounded-lg transition-all"
              >
                Aplicar
              </button>
            </div>
          </div>

          {/* Preview / Summary Panel */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-xs uppercase tracking-wider text-slate-500 flex items-center gap-2">
                📋 Resumo ({totalNewCommits} commits)
              </h3>
              {totalNewCommits > 0 && (
                <button
                  onClick={clearGrid}
                  className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold transition-all"
                >
                  Limpar tudo
                </button>
              )}
            </div>

            {sortedSelectedDates.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-600 py-4">
                Nenhum dia selecionado. Clique no gráfico acima.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto max-h-[160px] space-y-1 pr-1">
                {sortedSelectedDates.map(({ dateStr, count }) => (
                  <div key={dateStr} className="flex items-center justify-between bg-slate-950/60 rounded-lg px-3 py-1.5 group">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-sm bg-blue-500"></div>
                      <span className="text-xs text-slate-300">{formatDate(dateStr)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-blue-400 bg-blue-950/50 px-1.5 py-0.5 rounded">
                        ×{count}
                      </span>
                      <button
                        onClick={() => removeSelectedDate(dateStr)}
                        className="text-slate-600 hover:text-rose-400 text-xs opacity-0 group-hover:opacity-100 transition-all"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Submit Button */}
            {totalNewCommits > 0 && (
              <button
                onClick={() => setShowPreview(true)}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-emerald-500/10 text-sm mt-1"
              >
                Revisar e Enviar {totalNewCommits} Commits →
              </button>
            )}
          </div>

          {/* Logs Console */}
          <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 flex flex-col gap-3">
            <h3 className="font-semibold text-xs uppercase tracking-wider text-slate-500 flex items-center gap-2">
              🖥 Terminal
            </h3>
            <div className="bg-black/60 rounded-xl p-3 flex-1 font-mono text-[10px] text-emerald-400 overflow-y-auto max-h-[180px] border border-slate-900 min-h-[80px]">
              {statusMessage.text && (
                <div className={`mb-2 px-2 py-1.5 rounded-lg text-[10px] font-semibold ${
                  statusMessage.type === "success"
                    ? "bg-emerald-950/50 border border-emerald-900 text-emerald-400"
                    : "bg-rose-950/50 border border-rose-900 text-rose-400"
                }`}>
                  {statusMessage.text}
                </div>
              )}
              {logs.length === 0 && !statusMessage.text ? (
                <span className="text-slate-600">// Aguardando execução...</span>
              ) : (
                logs.map((log, index) => <div key={index}>{`> ${log}`}</div>)
              )}
            </div>
          </div>

        </section>

      </main>

      {/* ── CONFIRMATION MODAL (Preview before sending) ── */}
      {showPreview && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => setShowPreview(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg max-h-[80vh] bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl shadow-black/50 flex flex-col animate-[modalIn_0.25s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-800">
              <h3 className="font-bold text-lg text-slate-100">Confirmar Envio</h3>
              <p className="text-xs text-slate-400 mt-1">Revise os detalhes antes de criar os commits.</p>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{totalNewCommits}</p>
                  <p className="text-[10px] text-slate-500 font-semibold uppercase mt-0.5">Total de Commits</p>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-blue-400">{sortedSelectedDates.length}</p>
                  <p className="text-[10px] text-slate-500 font-semibold uppercase mt-0.5">Dias Selecionados</p>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs py-1.5 border-b border-slate-800/50">
                  <span className="text-slate-500">Repositório</span>
                  <span className="text-slate-200 font-semibold">{selectedRepoFullName}</span>
                </div>
                <div className="flex justify-between text-xs py-1.5 border-b border-slate-800/50">
                  <span className="text-slate-500">Branch</span>
                  <span className="text-slate-200 font-mono">{selectedBranch}</span>
                </div>
                <div className="flex justify-between text-xs py-1.5 border-b border-slate-800/50">
                  <span className="text-slate-500">Mensagem</span>
                  <span className="text-slate-200 font-mono truncate max-w-[200px]">{commitMessage}</span>
                </div>
                <div className="flex justify-between text-xs py-1.5 border-b border-slate-800/50">
                  <span className="text-slate-500">Horário</span>
                  <span className="text-slate-200 font-mono">{commitTime}</span>
                </div>
                {forcePush && (
                  <div className="flex justify-between text-xs py-1.5">
                    <span className="text-rose-400">⚠️ Force Push</span>
                    <span className="text-rose-400 font-semibold">Ativado</span>
                  </div>
                )}
              </div>

              {/* Day list */}
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">Dias</p>
                <div className="max-h-[150px] overflow-y-auto space-y-1 pr-1">
                  {sortedSelectedDates.map(({ dateStr, count }) => (
                    <div key={dateStr} className="flex items-center justify-between bg-slate-950/40 rounded-lg px-3 py-1.5">
                      <span className="text-xs text-slate-300">{formatDate(dateStr)}</span>
                      <span className="text-[10px] font-mono text-blue-400">×{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Alteration notice */}
              <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-xl p-3">
                <p className="text-[10px] text-emerald-400 font-semibold">
                  📝 Cada commit altera o arquivo CHANGELOG.md com uma entrada única — sem commits vazios.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t border-slate-800 flex gap-3">
              <button
                onClick={() => setShowPreview(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm py-3 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 font-bold text-sm py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10"
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                    Enviando...
                  </>
                ) : (
                  "Confirmar e Enviar 🚀"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Commit Details Modal (existing commits) ── */}
      {showCommitModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => setShowCommitModal(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-2xl max-h-[85vh] bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl shadow-black/50 flex flex-col animate-[modalIn_0.25s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div>
                <h3 className="font-bold text-lg text-slate-100">
                  Commits em{" "}
                  {new Date(selectedDay + "T12:00:00").toLocaleDateString("pt-BR", {
                    weekday: "long", year: "numeric", month: "long", day: "numeric",
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

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {(githubCommitDetails[selectedDay] || []).map((commit) => (
                <div
                  key={`${commit.repoFullName}-${commit.sha}`}
                  className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {commit.authorAvatarUrl && (
                          <img src={commit.authorAvatarUrl} alt={commit.authorLogin} className="h-5 w-5 rounded-full ring-1 ring-slate-700" />
                        )}
                        <span className="text-[10px] font-semibold text-slate-300 truncate">{commit.authorName || commit.authorLogin}</span>
                        <span className="text-[10px] font-mono bg-slate-800 text-emerald-400 px-2 py-0.5 rounded-md">{commit.sha.substring(0, 7)}</span>
                        <span className="text-[10px] text-slate-500 font-medium truncate">{commit.repoFullName}</span>
                      </div>
                      <p className="text-sm text-slate-200 font-medium truncate">{commit.message}</p>
                      <p className="text-[10px] text-slate-500 mt-1">{new Date(commit.date).toLocaleString("pt-BR")}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {commit.url && (
                        <a href={commit.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-slate-400 hover:text-emerald-400 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800">
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
