'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CHAPTERS_DATA } from '@/lib/chapters-data';
import {
  LayoutDashboard,
  BookOpen,
  FileQuestion,
  History,
  Settings,
  LogOut,
  Stethoscope,
  ChevronRight,
  Sparkles,
  Menu,
  X,
  Compass,
  Flame,
  Award,
} from 'lucide-react';
import { getGamificationSnapshot } from '@/lib/gamification-engine';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [userEmail, setUserEmail] = useState<string>('');
  const [readCount, setReadCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [gamification, setGamification] = useState<any>(null);

  useEffect(() => {
    async function loadUserData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setUserEmail(user.email);
        
        // Fetch read progress count
        const { data: readProgress } = await supabase
          .from('chapter_progress')
          .select('chapter_id')
          .eq('user_id', user.id)
          .eq('is_read', true);

        if (readProgress) {
          setReadCount(readProgress.length);
        }

        // Fetch gamification stats
        try {
          const gSnap = await getGamificationSnapshot(supabase, user.id);
          setGamification(gSnap);
        } catch (e) {
          console.warn('Could not load gamification stats:', e);
        }
      }
    }
    loadUserData();
  }, [pathname]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/trilhas', label: '🛤️ Trilhas de Estudo', icon: Compass },
    { href: '/capitulos', label: 'Capítulos (122)', icon: BookOpen },
    { href: '/testes', label: 'Gerar Testes', icon: FileQuestion },
    { href: '/plantoes', label: '🏥 Modo Plantão', icon: Stethoscope },
    { href: '/historico', label: 'Histórico & Evolução', icon: History },
    { href: '/configuracoes', label: 'Configurações & PDF', icon: Settings },
  ];

  const totalChapters = CHAPTERS_DATA.length;
  const progressPercent = Math.round((readCount / totalChapters) * 100);

  return (
    <div className="app-layout">
      {/* Mobile Top Bar */}
      <div className="mobile-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(16, 185, 129, 0.25))',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#38bdf8',
          }}>
            <Stethoscope size={18} />
          </div>
          <span className="text-gradient" style={{ fontSize: '1.1rem', fontWeight: 800 }}>
            EmergeMed
          </span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="mobile-menu-btn"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
        <div>
          {/* Brand Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 8px', marginBottom: '32px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(16, 185, 129, 0.25))',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
              flexShrink: 0,
            }}>
              <Stethoscope size={24} />
            </div>
            <div>
              <div className="text-gradient" style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.1 }}>
                EmergeMed
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', fontWeight: 500 }}>
                Emergência & Sala Vermelha
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    color: isActive ? '#38bdf8' : 'var(--text-muted)',
                    backgroundColor: isActive ? 'rgba(14, 165, 233, 0.12)' : 'transparent',
                    border: isActive ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid transparent',
                    textDecoration: 'none',
                    fontWeight: isActive ? 600 : 500,
                    fontSize: '0.92rem',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Icon size={19} color={isActive ? '#38bdf8' : '#64748b'} />
                    <span>{item.label}</span>
                  </div>
                  {isActive && <ChevronRight size={16} color="#38bdf8" />}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section: Gamification, Progress Card & User Profile */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Gamification Widget */}
          {gamification && (
            <div
              className="glass-panel"
              style={{
                padding: '12px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(16, 185, 129, 0.1))',
                border: '1px solid rgba(245, 158, 11, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Flame size={14} color="#f59e0b" /> {gamification.currentStreak} dias seguidos
                </span>
                <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>
                  ⚡ {gamification.totalXp} XP
                </span>
              </div>

              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f3f4f6', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <span>{gamification.levelInfo.currentLevel.icon}</span>
                <span>Nível {gamification.levelInfo.currentLevel.level}: {gamification.levelInfo.currentLevel.title}</span>
              </div>

              <div className="progress-bar-bg" style={{ height: '5px', background: 'rgba(255,255,255,0.1)' }}>
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${gamification.levelInfo.progressPercent}%`,
                    background: 'linear-gradient(90deg, #f59e0b, #10b981)',
                  }}
                />
              </div>
            </div>
          )}

          {/* Progress Card */}
          <div className="glass-panel" style={{ padding: '12px', borderRadius: '14px', background: 'rgba(15, 23, 42, 0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Progresso do Livro</span>
              <span style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 700 }}>{progressPercent}%</span>
            </div>
            <div className="progress-bar-bg" style={{ height: '6px' }}>
              <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginTop: '8px', textAlign: 'right' }}>
              {readCount} de {totalChapters} capítulos lidos
            </div>
          </div>

          {/* User & Logout */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'rgba(15, 23, 42, 0.4)',
            border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {userEmail ? userEmail.split('@')[0] : 'Médico'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {userEmail || 'Conectado'}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Sair da Conta"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-subtle)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
