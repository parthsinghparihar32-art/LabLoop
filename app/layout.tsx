import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LabLoop — Smart Campus Resource Sharing',
  description: 'Idle Today, Ideas Tomorrow. Centralized platform for campus equipment, lab, and space sharing.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
