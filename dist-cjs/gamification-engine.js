"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACHIEVEMENTS = exports.LEVEL_THRESHOLDS = void 0;
exports.getCurrentLevelInfo = getCurrentLevelInfo;
exports.getGamificationSnapshot = getGamificationSnapshot;
exports.recordActivityAndAwardXP = recordActivityAndAwardXP;
exports.LEVEL_THRESHOLDS = [
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
exports.ACHIEVEMENTS = [
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
function getCurrentLevelInfo(totalXp) {
    var currentLevel = exports.LEVEL_THRESHOLDS[0];
    var nextLevel = exports.LEVEL_THRESHOLDS[1];
    for (var i = 0; i < exports.LEVEL_THRESHOLDS.length; i++) {
        if (totalXp >= exports.LEVEL_THRESHOLDS[i].xp) {
            currentLevel = exports.LEVEL_THRESHOLDS[i];
            nextLevel = exports.LEVEL_THRESHOLDS[i + 1] || null;
        }
    }
    var progressPercent = 100;
    if (nextLevel) {
        var range = nextLevel.xp - currentLevel.xp;
        var gained = totalXp - currentLevel.xp;
        progressPercent = Math.min(100, Math.max(0, Math.round((gained / range) * 100)));
    }
    return { currentLevel: currentLevel, nextLevel: nextLevel, progressPercent: progressPercent };
}
function getGamificationSnapshot(supabase, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var stats, userAchievements, unlockedKeys, totalXp, currentStreak, maxStreak, levelInfo, achievementsList;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, supabase
                        .from('user_gamification_stats')
                        .select('*')
                        .eq('user_id', userId)
                        .single()];
                case 1:
                    stats = (_a.sent()).data;
                    return [4 /*yield*/, supabase
                            .from('user_achievements')
                            .select('achievement_key, unlocked_at')
                            .eq('user_id', userId)];
                case 2:
                    userAchievements = (_a.sent()).data;
                    unlockedKeys = new Set((userAchievements || []).map(function (a) { return a.achievement_key; }));
                    totalXp = (stats === null || stats === void 0 ? void 0 : stats.total_xp) || 0;
                    currentStreak = (stats === null || stats === void 0 ? void 0 : stats.current_streak) || 0;
                    maxStreak = (stats === null || stats === void 0 ? void 0 : stats.max_streak) || 0;
                    levelInfo = getCurrentLevelInfo(totalXp);
                    achievementsList = exports.ACHIEVEMENTS.map(function (ach) {
                        var _a;
                        return (__assign(__assign({}, ach), { unlocked: unlockedKeys.has(ach.key), unlockedAt: ((_a = (userAchievements || []).find(function (a) { return a.achievement_key === ach.key; })) === null || _a === void 0 ? void 0 : _a.unlocked_at) || null }));
                    });
                    return [2 /*return*/, {
                            totalXp: totalXp,
                            currentStreak: currentStreak,
                            maxStreak: maxStreak,
                            levelInfo: levelInfo,
                            achievements: achievementsList,
                        }];
            }
        });
    });
}
function recordActivityAndAwardXP(supabase, userId, action) {
    return __awaiter(this, void 0, void 0, function () {
        var xpAwarded, todayStr, daily, stats, currentStreak, maxStreak, newXp, lastDate, yesterday, yesterdayStr, currentLevel;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    xpAwarded = 0;
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
                    todayStr = new Date().toISOString().split('T')[0];
                    return [4 /*yield*/, supabase
                            .from('user_daily_activity')
                            .select('*')
                            .eq('user_id', userId)
                            .eq('activity_date', todayStr)
                            .single()];
                case 1:
                    daily = (_a.sent()).data;
                    if (!daily) return [3 /*break*/, 3];
                    return [4 /*yield*/, supabase
                            .from('user_daily_activity')
                            .update({
                            study_events: (daily.study_events || 0) + 1,
                            chapters_read: action.type === 'first_read' ? (daily.chapters_read || 0) + 1 : daily.chapters_read,
                            chapters_reread: action.type === 'reread_quiz' ? (daily.chapters_reread || 0) + 1 : daily.chapters_reread,
                            plantoes_completed: action.type === 'plantao_complete' ? (daily.plantoes_completed || 0) + 1 : daily.plantoes_completed,
                            tests_completed: action.type === 'test_complete' ? (daily.tests_completed || 0) + 1 : daily.tests_completed,
                        })
                            .eq('id', daily.id)];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 3: return [4 /*yield*/, supabase.from('user_daily_activity').insert({
                        user_id: userId,
                        activity_date: todayStr,
                        study_events: 1,
                        chapters_read: action.type === 'first_read' ? 1 : 0,
                        chapters_reread: action.type === 'reread_quiz' ? 1 : 0,
                        plantoes_completed: action.type === 'plantao_complete' ? 1 : 0,
                        tests_completed: action.type === 'test_complete' ? 1 : 0,
                    })];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5: return [4 /*yield*/, supabase
                        .from('user_gamification_stats')
                        .select('*')
                        .eq('user_id', userId)
                        .single()];
                case 6:
                    stats = (_a.sent()).data;
                    currentStreak = (stats === null || stats === void 0 ? void 0 : stats.current_streak) || 0;
                    maxStreak = (stats === null || stats === void 0 ? void 0 : stats.max_streak) || 0;
                    newXp = ((stats === null || stats === void 0 ? void 0 : stats.total_xp) || 0) + xpAwarded;
                    lastDate = (stats === null || stats === void 0 ? void 0 : stats.last_activity_date) || null;
                    if (lastDate !== todayStr) {
                        yesterday = new Date();
                        yesterday.setDate(yesterday.getDate() - 1);
                        yesterdayStr = yesterday.toISOString().split('T')[0];
                        if (lastDate === yesterdayStr) {
                            currentStreak += 1;
                        }
                        else {
                            currentStreak = 1;
                        }
                        if (currentStreak > maxStreak) {
                            maxStreak = currentStreak;
                        }
                    }
                    currentLevel = getCurrentLevelInfo(newXp).currentLevel;
                    return [4 /*yield*/, supabase.from('user_gamification_stats').upsert({
                            user_id: userId,
                            current_streak: currentStreak,
                            max_streak: maxStreak,
                            total_xp: newXp,
                            level: currentLevel.level,
                            last_activity_date: todayStr,
                            updated_at: new Date().toISOString(),
                        })];
                case 7:
                    _a.sent();
                    return [2 /*return*/, { xpAwarded: xpAwarded, newXp: newXp, currentStreak: currentStreak, level: currentLevel.level }];
            }
        });
    });
}
