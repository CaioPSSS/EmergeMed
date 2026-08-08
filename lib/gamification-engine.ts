import { SupabaseClient } from '@supabase/supabase-js';
import { buildReadinessSnapshot } from './learning-engine';

export interface LevelThreshold {
  level: number;
  xp: number;
  title: string;
  icon: string;
}

export const LEVEL_THRESHOLDS: LevelThreshold[] = [
  { level: 1, xp: 0, title: 'Acadêmico', icon: '📚' },
  { level: 2, xp: 200, title: 'Interno', icon: '🩺' },
  { level: 3, xp: 500, title: 'R1 — Primeiro Ano', icon: '⚕️' },
  { level: 4, xp: 1000, title: 'R2 — Emergencista Jr', icon: '🏥' },
  { level: 5, xp: 2000, title: 'R3 — Emergencista', icon: '🚑' },
  { level: 6, xp: 3500, title: 'Preceptor', icon: '👨‍⚕️' },
  { level: 7, xp: 5000, title: 'Chefe de Plantão', icon: '⭐' },
  { level: 8, xp: 8000, title: 'Coordenador de UPA', icon: '🏆' },
  { level: 9, xp: 12000, title: 'Especialista Sênior', icon: '🎖️' },
  { level: 10, xp: 20000, title: 'Mestre da Emergência', icon: '👑' },
];

export interface Achievement {
  key: string;
  title: string;
  desc: string;
  icon: string;
  category: 'reading' | 'plantao' | 'streak' | 'performance';
}

export const ACHIEVEMENTS: Achievement[] = [
  { key: 'first_read', title: 'Primeiro Capítulo', desc: 'Leu o 1° capítulo do livro', icon: '📖', category: 'reading' },
  { key: 'ten_chapters', title: 'Estudioso', desc: 'Leu 10 capítulos', icon: '📚', category: 'reading' },
  { key: 'fifty_chapters', title: 'Meio Caminho', desc: 'Leu 50 capítulos', icon: '🏔️', category: 'reading' },
  { key: 'all_chapters', title: 'Enciclopédia Viva', desc: 'Leu todos os 122 capítulos', icon: '🏅', category: 'reading' },
  
  { key: 'first_plantao', title: 'Primeiro Plantão', desc: 'Completou o 1° plantão simulado', icon: '🌙', category: 'plantao' },
  { key: 'ten_plantoes', title: 'Plantonista', desc: '10 plantões completados', icon: '🏥', category: 'plantao' },
  { key: 'fifty_plantoes', title: 'Veterano de Plantão', desc: '50 plantões completados', icon: '⚡', category: 'plantao' },
  
  { key: 'streak_3', title: 'Consistência', desc: '3 dias seguidos de estudo', icon: '🔥', category: 'streak' },
  { key: 'streak_7', title: 'Semana de Fogo', desc: '7 dias seguidos de estudo', icon: '🔥🔥', category: 'streak' },
  { key: 'streak_30', title: 'Maratonista', desc: '30 dias seguidos de estudo', icon: '🏃‍♂️', category: 'streak' },
  
  { key: 'perfect_plantao', title: 'Plantão Perfeito', desc: 'Score 10/10 em um plantão', icon: '💯', category: 'performance' },
  { key: 'readiness_80', title: 'Apto para Sala Vermelha', desc: 'Prontidão global >= 80%', icon: '🛡️', category: 'performance' },
  { key: 'no_adverse', title: 'Zero Complicações', desc: 'Plantão sem evolução adversa', icon: '✨', category: 'performance' },
];

export function getCurrentLevelInfo(totalXp: number): {
  currentLevel: LevelThreshold;
  nextLevel: LevelThreshold | null;
  progressPercent: number;
} {
  let currentLevel = LEVEL_THRESHOLDS[0];
  let nextLevel: LevelThreshold | null = LEVEL_THRESHOLDS[1];

  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalXp >= LEVEL_THRESHOLDS[i].xp) {
      currentLevel = LEVEL_THRESHOLDS[i];
      nextLevel = LEVEL_THRESHOLDS[i + 1] || null;
    }
  }

  let progressPercent = 100;
  if (nextLevel) {
    const range = nextLevel.xp - currentLevel.xp;
    const gained = totalXp - currentLevel.xp;
    progressPercent = Math.min(100, Math.max(0, Math.round((gained / range) * 100)));
  }

  return { currentLevel, nextLevel, progressPercent };
}

export async function checkAndAwardAchievements(
  supabase: SupabaseClient,
  userId: string,
  extraContext?: {
    actionType?: string;
    plantaoScore?: number;
  }
): Promise<string[]> {
  // 1. Fetch user's existing achievements from Supabase DB table `user_achievements`
  const { data: existingAchievements } = await supabase
    .from('user_achievements')
    .select('achievement_key')
    .eq('user_id', userId);

  const existingUnlocked = new Set((existingAchievements || []).map((a) => a.achievement_key));

  // 2. Gather user activity metrics
  const { data: readProgress } = await supabase
    .from('chapter_progress')
    .select('chapter_id')
    .eq('user_id', userId)
    .eq('is_read', true);

  const readCount = (readProgress || []).length;

  const { data: stats } = await supabase
    .from('user_gamification_stats')
    .select('current_streak, max_streak, total_xp')
    .eq('user_id', userId)
    .single();

  const currentStreak = stats?.current_streak || 0;
  const maxStreak = stats?.max_streak || 0;
  const streak = Math.max(currentStreak, maxStreak);

  const { data: completedTests } = await supabase
    .from('tests')
    .select('id, chapter_ids, score, mode, plantao_data, completed')
    .eq('user_id', userId)
    .eq('completed', true);

  const plantoes = (completedTests || []).filter((t) => t.mode === 'plantao');
  const plantaoCount = plantoes.length;

  const hasPerfectPlantao =
    (extraContext?.actionType === 'plantao_complete' && (extraContext?.plantaoScore || 0) >= 10.0) ||
    plantoes.some((p) => typeof p.score === 'number' && p.score >= 10.0);

  const hasNoAdversePlantao = plantoes.some((p) => {
    const pData = p.plantao_data || {};
    return (!pData.adverseEvolutions || pData.adverseEvolutions === 0) && !pData.adverse_triggered;
  });

  let globalReadiness = 0;
  if (!existingUnlocked.has('readiness_80')) {
    try {
      const { data: reviewStats } = await supabase
        .from('chapter_review_stats')
        .select('*')
        .eq('user_id', userId);

      const snapshot = buildReadinessSnapshot({
        progressList: (readProgress || []) as any,
        reviewStatsList: (reviewStats || []) as any,
        testsList: (completedTests || []) as any,
      });
      globalReadiness = snapshot.globalReadiness;
    } catch {
      // fallback
    }
  }

  // 3. Evaluate 13 badge criteria
  const newlyUnlocked: string[] = [];

  for (const ach of ACHIEVEMENTS) {
    if (existingUnlocked.has(ach.key)) continue;

    let isUnlocked = false;
    switch (ach.key) {
      case 'first_read':
        isUnlocked = readCount >= 1;
        break;
      case 'ten_chapters':
        isUnlocked = readCount >= 10;
        break;
      case 'fifty_chapters':
        isUnlocked = readCount >= 50;
        break;
      case 'all_chapters':
        isUnlocked = readCount >= 122;
        break;

      case 'first_plantao':
        isUnlocked = plantaoCount >= 1;
        break;
      case 'ten_plantoes':
        isUnlocked = plantaoCount >= 10;
        break;
      case 'fifty_plantoes':
        isUnlocked = plantaoCount >= 50;
        break;

      case 'streak_3':
        isUnlocked = streak >= 3;
        break;
      case 'streak_7':
        isUnlocked = streak >= 7;
        break;
      case 'streak_30':
        isUnlocked = streak >= 30;
        break;

      case 'perfect_plantao':
        isUnlocked = hasPerfectPlantao;
        break;
      case 'readiness_80':
        isUnlocked = globalReadiness >= 80;
        break;
      case 'no_adverse':
        isUnlocked = hasNoAdversePlantao;
        break;
    }

    if (isUnlocked) {
      newlyUnlocked.push(ach.key);
    }
  }

  // 4. Insert newly unlocked badge records into Supabase `user_achievements` table
  if (newlyUnlocked.length > 0) {
    const nowStr = new Date().toISOString();
    const rowsToInsert = newlyUnlocked.map((key) => ({
      user_id: userId,
      achievement_key: key,
      unlocked_at: nowStr,
    }));

    await supabase.from('user_achievements').upsert(rowsToInsert, { onConflict: 'user_id,achievement_key' });
  }

  return newlyUnlocked;
}

export async function getGamificationSnapshot(supabase: SupabaseClient, userId: string) {
  // Evaluate and persist any newly qualified achievements
  await checkAndAwardAchievements(supabase, userId);

  const { data: stats } = await supabase
    .from('user_gamification_stats')
    .select('*')
    .eq('user_id', userId)
    .single();

  const { data: userAchievements } = await supabase
    .from('user_achievements')
    .select('achievement_key, unlocked_at')
    .eq('user_id', userId);

  const unlockedKeys = new Set((userAchievements || []).map((a) => a.achievement_key));

  const totalXp = stats?.total_xp || 0;
  const currentStreak = stats?.current_streak || 0;
  const maxStreak = stats?.max_streak || 0;
  const levelInfo = getCurrentLevelInfo(totalXp);

  const achievementsList = ACHIEVEMENTS.map((ach) => ({
    ...ach,
    unlocked: unlockedKeys.has(ach.key),
    unlockedAt: (userAchievements || []).find((a) => a.achievement_key === ach.key)?.unlocked_at || null,
  }));

  return {
    totalXp,
    currentStreak,
    maxStreak,
    levelInfo,
    achievements: achievementsList,
  };
}

export async function recordActivityAndAwardXP(
  supabase: SupabaseClient,
  userId: string,
  action: {
    type: 'first_read' | 'reread_quiz' | 'plantao_complete' | 'test_complete' | 'adverse_correct';
    quizPassed?: boolean;
    plantaoScore?: number;
  }
) {
  let xpAwarded = 0;

  switch (action.type) {
    case 'first_read':
      xpAwarded = 50;
      break;
    case 'reread_quiz':
      xpAwarded = action.quizPassed ? 30 : 10;
      break;
    case 'plantao_complete':
      xpAwarded = 100 + ((action.plantaoScore || 0) >= 8.0 ? 50 : 0);
      break;
    case 'test_complete':
      xpAwarded = 40;
      break;
    case 'adverse_correct':
      xpAwarded = 25;
      break;
  }

  const todayStr = new Date().toISOString().split('T')[0];

  // Record daily activity
  const { data: daily } = await supabase
    .from('user_daily_activity')
    .select('*')
    .eq('user_id', userId)
    .eq('activity_date', todayStr)
    .single();

  if (daily) {
    await supabase
      .from('user_daily_activity')
      .update({
        study_events: (daily.study_events || 0) + 1,
        chapters_read: action.type === 'first_read' ? (daily.chapters_read || 0) + 1 : daily.chapters_read,
        chapters_reread: action.type === 'reread_quiz' ? (daily.chapters_reread || 0) + 1 : daily.chapters_reread,
        plantoes_completed: action.type === 'plantao_complete' ? (daily.plantoes_completed || 0) + 1 : daily.plantoes_completed,
        tests_completed: action.type === 'test_complete' ? (daily.tests_completed || 0) + 1 : daily.tests_completed,
      })
      .eq('id', daily.id);
  } else {
    await supabase.from('user_daily_activity').insert({
      user_id: userId,
      activity_date: todayStr,
      study_events: 1,
      chapters_read: action.type === 'first_read' ? 1 : 0,
      chapters_reread: action.type === 'reread_quiz' ? 1 : 0,
      plantoes_completed: action.type === 'plantao_complete' ? 1 : 0,
      tests_completed: action.type === 'test_complete' ? 1 : 0,
    });
  }

  // Update stats and streak
  const { data: stats } = await supabase
    .from('user_gamification_stats')
    .select('*')
    .eq('user_id', userId)
    .single();

  let currentStreak = stats?.current_streak || 0;
  let maxStreak = stats?.max_streak || 0;
  let newXp = (stats?.total_xp || 0) + xpAwarded;
  let lastDate = stats?.last_activity_date || null;

  if (lastDate !== todayStr) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (lastDate === yesterdayStr) {
      currentStreak += 1;
    } else {
      currentStreak = 1;
    }

    if (currentStreak > maxStreak) {
      maxStreak = currentStreak;
    }
  }

  const { currentLevel } = getCurrentLevelInfo(newXp);

  await supabase.from('user_gamification_stats').upsert({
    user_id: userId,
    current_streak: currentStreak,
    max_streak: maxStreak,
    total_xp: newXp,
    level: currentLevel.level,
    last_activity_date: todayStr,
    updated_at: new Date().toISOString(),
  });

  // Evaluate & award achievements
  await checkAndAwardAchievements(supabase, userId, {
    actionType: action.type,
    plantaoScore: action.plantaoScore,
  });

  return { xpAwarded, newXp, currentStreak, level: currentLevel.level };
}
