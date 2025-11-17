import './globals.css';
import type { Metadata } from 'next';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'SpeculateX v3',
  description: 'Pure CPMM Prediction Markets',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-100">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}


