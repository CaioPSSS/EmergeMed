import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'EmergeMed — Preparação para Emergências em UPA',
  description: 'Plataforma de estudos médica baseada no livro Medicina de Emergência. Sorteio de capítulos, questões inteligentes e avaliação de prescrições por IA.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
      </body>
    </html>
  );
}
