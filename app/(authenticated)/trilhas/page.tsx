import { createClient } from '@/lib/supabase/server';
import { LEARNING_TRACKS } from '@/lib/learning-tracks';
import { CHAPTERS_DATA } from '@/lib/chapters-data';
import { buildReadinessSnapshot } from '@/lib/learning-engine';
import Link from 'next/link';
import { CheckCircle2, Lock, Sparkles, BookOpen, ArrowRight } from 'lucide-react';

export default async function TrilhasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: progressList } = await supabase
    .from('chapter_progress')
    .select('chapter_id, is_read, read_at, read_count')
    .eq('user_id', user.id);

  const { data: reviewStatsList } = await supabase
    .from('chapter_review_stats')
    .select('*')
    .eq('user_id', user.id);

  const { data: testsList } = await supabase
    .from('tests')
    .select('id, chapter_ids, mode, score, completed, completed_at, results')
    .eq('user_id', user.id);

  const snapshot = buildReadinessSnapshot({
    progressList: progressList || [],
    reviewStatsList: reviewStatsList || [],
    testsList: testsList || [],
    surface: 'dashboard',
  });

  const readSet = new Set((progressList || []).filter((p) => p.is_read).map((p) => p.chapter_id));

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Roadmap Visual RPG</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-100">Trilhas de Aprendizagem por Especialidade</h1>
        <p className="text-slate-400 mt-1">
          Sequências estruturadas de estudo da Sala Vermelha até procedimentos de alta complexidade.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {LEARNING_TRACKS.map((track) => {
          const trackChapters = track.chapters.map((id) => CHAPTERS_DATA.find((c) => c.id === id)).filter(Boolean);
          const completedCount = track.chapters.filter((id) => readSet.has(id)).length;
          const progressPercent = Math.round((completedCount / track.chapters.length) * 100);

          return (
            <div
              key={track.id}
              className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-inner"
                      style={{ backgroundColor: `${track.color}20`, border: `1px solid ${track.color}40` }}
                    >
                      {track.icon}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-100">{track.name}</h2>
                      <p className="text-xs text-slate-400">{track.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-slate-200">{progressPercent}%</span>
                    <span className="text-xs text-slate-500 block">concluído</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-800 rounded-full h-2 mb-6 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%`, backgroundColor: track.color }}
                  />
                </div>

                {/* Vertical Skill Tree Nodes */}
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
                  {trackChapters.map((cap, idx) => {
                    if (!cap) return null;
                    const isCompleted = readSet.has(cap.id);
                    const prereqs = cap.prerequisites || [];
                    const prereqsMet = prereqs.every((pId) => readSet.has(pId));
                    const isLocked = !isCompleted && !prereqsMet;
                    const metric = snapshot.chapterMetrics[cap.id];
                    const readiness = metric ? Math.round(metric.topicReadiness) : 0;

                    return (
                      <div key={cap.id} className="relative flex items-start gap-4 group">
                        {/* Node Status Dot */}
                        <div
                          className={`absolute -left-6 top-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition ${
                            isCompleted
                              ? 'bg-emerald-500 text-slate-950 ring-4 ring-slate-900'
                              : isLocked
                              ? 'bg-slate-800 text-slate-500 border border-slate-700 ring-4 ring-slate-900'
                              : 'bg-cyan-500 text-slate-950 ring-4 ring-cyan-500/20 animate-pulse'
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : isLocked ? (
                            <Lock className="w-3 h-3" />
                          ) : (
                            <BookOpen className="w-3 h-3" />
                          )}
                        </div>

                        {/* Node Card */}
                        <div
                          className={`flex-1 p-3.5 rounded-xl border transition ${
                            isCompleted
                              ? 'bg-emerald-950/20 border-emerald-500/20 text-slate-300'
                              : isLocked
                              ? 'bg-slate-950/40 border-slate-800/80 text-slate-500'
                              : 'bg-cyan-950/20 border-cyan-500/30 text-slate-200 hover:border-cyan-500/60'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-[10px] uppercase tracking-wider font-semibold opacity-70">
                                Cap {cap.number} • {cap.sectionTitle}
                              </span>
                              <h3 className="text-sm font-semibold mt-0.5">{cap.title}</h3>
                            </div>
                            {isCompleted ? (
                              <span className="text-xs text-emerald-400 font-medium px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                                Concluído
                              </span>
                            ) : isLocked ? (
                              <span className="text-xs text-slate-500 font-medium px-2 py-0.5 rounded bg-slate-800 border border-slate-700 flex items-center gap-1">
                                <Lock className="w-3 h-3" /> Requer Cap {prereqs.join(', ')}
                              </span>
                            ) : (
                              <Link
                                href={`/capitulos?cap=${cap.id}`}
                                className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center gap-1 transition"
                              >
                                Estudar <ArrowRight className="w-3 h-3" />
                              </Link>
                            )}
                          </div>

                          {isCompleted && (
                            <div className="mt-2 flex items-center gap-4 text-xs text-slate-400">
                              <span>Prontidão: <strong className="text-emerald-400">{readiness}%</strong></span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
