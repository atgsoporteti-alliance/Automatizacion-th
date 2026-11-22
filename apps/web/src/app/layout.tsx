import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'Alliance HCM – Core TH & IT (Fase 1 MVP)',
  description:
    'Plataforma empresarial de Onboarding, Offboarding, Firma Ley 1581 y automatización con ManageEngine ServiceDesk Plus.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="antialiased min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
