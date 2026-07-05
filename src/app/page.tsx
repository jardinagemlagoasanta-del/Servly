"use client";

import React, { useState, useEffect, useMemo } from "react";

interface CommitDay {
  dateStr: string;
  date: Date;
  count: number;
}

export default function Home() {
  const [repoPath, setRepoPath] = useState("");
  const [action, setAction] = useState<"commit" | "init">("commit");
  const [initRepoName, setInitRepoName] = useState("");
  const [commitMessage, setCommitMessage] = useState("chore: update history");
  const [commitTime, setCommitTime] = useState("12:00:00");
  const [commitsPerDay, setCommitsPerDay] = useState(1);
  const [selectedDates, setSelectedDates] = useState<{ [key: string]: number }>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ text: "", type: "" });

  // Range selection state
  const [startDateStr, setStartDateStr] = useState("");
  const [endDateStr, setEndDateStr] = useState("");
  const [rangeCommits, setRangeCommits] = useState(2);

  // Generate last 371 days (53 weeks) ending on the current Saturday
  const gridDays = useMemo(() => {
    const days: CommitDay[] = [];
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 is Sunday, 6 is Saturday
    
    // We want the grid to end on the upcoming Saturday (or today if today is Saturday)
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + (6 - dayOfWeek));
    
    // Go back 53 weeks (53 * 7 = 371 days)
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 370);

    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split("T")[0];
      days.push({
        dateStr,
        date: new Date(current),
        count: selectedDates[dateStr] || 0,
      });
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [selectedDates]);

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

  // Toggle/Increment commit count for a specific day
  const handleDayClick = (dateStr: string) => {
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
      // 30% chance of commit
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

  // Submit action to backend API
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoPath) {
      setStatusMessage({ text: "O caminho do repositório é obrigatório.", type: "error" });
      return;
    }

    setLoading(true);
    setStatusMessage({ text: "", type: "" });
    setLogs([]);

    try {
      const commitList = Object.entries(selectedDates).map(([dateStr, count]) => {
        // Combinar a data do grid com o horário selecionado
        const dateTimeStr = `${dateStr}T${commitTime}`;
        return {
          date: dateTimeStr,
          count,
          message: commitMessage,
        };
      });

      if (action === "commit" && commitList.length === 0) {
        setStatusMessage({ text: "Selecione pelo menos um dia no grid para criar commits.", type: "error" });
        setLoading(false);
        return;
      }

      const response = await fetch("/api/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          repoPath,
          commits: commitList,
          message: commitMessage,
          initRepoName: action === "init" ? initRepoName : undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatusMessage({ text: data.message, type: "success" });
        if (data.logs) {
          setLogs(data.logs);
        }
        if (action === "init" && data.path) {
          setRepoPath(data.path);
          setAction("commit");
        }
      } else {
        setStatusMessage({ text: data.error || "Ocorreu um erro ao processar requisição.", type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || "Erro de conexão com o servidor.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

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
            <span className="text-xs text-slate-500 font-medium">Manipulador de Linha do Tempo</span>
          </div>
        </div>
        <div className="text-xs text-slate-400 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
          Status: <span className="text-emerald-400 font-semibold">Local Server</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 flex flex-col gap-8">
        
        {/* Intro */}
        <section className="bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-900 rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
          <h2 className="text-2xl font-bold mb-2">Simule seu Histórico de Contribuições</h2>
          <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">
            Selecione um repositório Git local, configure as datas desejadas no gráfico interativo abaixo ou defina um intervalo, e crie commits retroativos com facilidade.
          </p>
        </section>

        {/* Git Path and Action Setup */}
        <section className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col gap-4">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-400">Configuração do Repositório</h3>
            
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-300">Caminho Absoluto da Pasta Local</label>
              <input
                type="text"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="Ex: C:\Users\Nome\Projetos\meu-repositorio"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-600"
              />
            </div>

            <div className="flex gap-4 mt-2">
              <button
                type="button"
                onClick={() => setAction("commit")}
                className={`flex-1 py-3 px-4 rounded-xl border text-sm font-semibold transition-all ${
                  action === "commit"
                    ? "bg-slate-800 border-slate-700 text-white"
                    : "border-transparent text-slate-400 hover:text-white"
                }`}
              >
                Trabalhar em Repo Existente
              </button>
              <button
                type="button"
                onClick={() => setAction("init")}
                className={`flex-1 py-3 px-4 rounded-xl border text-sm font-semibold transition-all ${
                  action === "init"
                    ? "bg-slate-800 border-slate-700 text-white"
                    : "border-transparent text-slate-400 hover:text-white"
                }`}
              >
                Inicializar Novo Repo
              </button>
            </div>

            {action === "init" && (
              <div className="flex flex-col gap-2 animate-fadeIn">
                <label className="text-xs font-semibold text-slate-300">Nome da Nova Pasta do Repositório (Opcional)</label>
                <input
                  type="text"
                  value={initRepoName}
                  onChange={(e) => setInitRepoName(e.target.value)}
                  placeholder="Deixe em branco para usar a própria pasta especificada"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-600"
                />
              </div>
            )}
          </div>

          <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col justify-between gap-4">
            <div>
              <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-400 mb-4">Ações Rápidas do Grid</h3>
              <p className="text-xs text-slate-400 mb-4">
                Use esses utilitários para desenhar ou limpar o gráfico de contribuição rapidamente.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={fillRandom}
                className="w-full bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900 text-slate-300 text-xs font-semibold py-2.5 rounded-xl transition-all"
              >
                Gerar Padrão Aleatório (30%)
              </button>
              <button
                type="button"
                onClick={clearGrid}
                className="w-full bg-slate-950 border border-slate-800 hover:border-rose-500/50 hover:bg-slate-900 text-slate-300 text-xs font-semibold py-2.5 rounded-xl transition-all"
              >
                Limpar Gráfico
              </button>
            </div>
          </div>
        </section>

        {/* Contribution Graph Section */}
        <section className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6 flex flex-col gap-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="font-bold text-base">Gráfico de Contribuição</h3>
              <p className="text-xs text-slate-400">Clique nos blocos para adicionar ou remover commits daquele dia específico.</p>
            </div>
            
            {/* Color Legend */}
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
            <div className="flex gap-[3px] min-w-max p-1">
              {weeks.map((week, wIndex) => (
                <div key={wIndex} className="flex flex-col gap-[3px]">
                  {week.map((day) => (
                    <button
                      key={day.dateStr}
                      onClick={() => handleDayClick(day.dateStr)}
                      title={`${day.date.toLocaleDateString()}: ${day.count} commits`}
                      className={`h-[11px] w-[11px] rounded-[2px] transition-colors border-[0.5px] ${getColorClass(
                        day.count
                      )}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

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
                    Executando comandos Git...
                  </>
                ) : action === "init" ? (
                  "Inicializar Repositório Git"
                ) : (
                  `Gerar ${Object.values(selectedDates).reduce((a, b) => a + b, 0)} Commits`
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

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 px-6 py-6 text-center text-xs text-slate-600 mt-12">
        <p>© 2026 Git Chronos. Criado para simulações e manipulações de datas locais do Git.</p>
      </footer>
    </div>
  );
}
