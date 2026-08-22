import { Stethoscope, WifiOff, RefreshCw } from 'lucide-react';

export const metadata = {
  title: 'Manutenção — EmergeMed',
  description: 'O sistema está temporariamente em manutenção.',
};

export default function MaintenancePage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div className="glass-panel" style={{
        maxWidth: '500px',
        width: '100%',
        padding: '48px 40px',
        textAlign: 'center',
      }}>
        {/* Icon */}
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, rgba(251, 146, 60, 0.2), rgba(244, 63, 94, 0.2))',
          border: '1px solid rgba(251, 146, 60, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px auto',
          color: '#fb923c',
        }}>
          <WifiOff size={36} />
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: '1.6rem',
          fontWeight: 800,
          color: 'var(--text-primary)',
          marginBottom: '12px',
        }}>
          Sistema em Manutenção
        </h1>

        {/* Description */}
        <p style={{
          color: 'var(--text-muted)',
          fontSize: '0.95rem',
          lineHeight: '1.6',
          marginBottom: '8px',
        }}>
          O banco de dados está temporariamente indisponível.
          Seus dados estão seguros e o serviço será restaurado em breve.
        </p>

        <p style={{
          color: 'var(--text-subtle)',
          fontSize: '0.85rem',
          lineHeight: '1.5',
          marginBottom: '32px',
        }}>
          Isso geralmente acontece quando o sistema fica inativo por alguns dias.
          O administrador já foi notificado.
        </p>

        {/* Retry Button */}
        <a
          href="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '14px 28px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #0ea5e9, #10b981)',
            color: 'white',
            fontWeight: 700,
            fontSize: '0.95rem',
            textDecoration: 'none',
            transition: 'all 0.2s ease',
          }}
        >
          <RefreshCw size={18} />
          Tentar Novamente
        </a>

        {/* Footer */}
        <div style={{
          marginTop: '32px',
          paddingTop: '20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          color: 'var(--text-subtle)',
          fontSize: '0.82rem',
        }}>
          <Stethoscope size={16} />
          EmergeMed — Preparação para Emergências
        </div>
      </div>
    </div>
  );
}
