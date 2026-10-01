import type { Metadata } from 'next';
import './globals.css';


export const metadata: Metadata = {
  title: 'SQL Sensi — AI-Powered Database Assistant',
  description:
    'Upload a SQLite database, ask questions in plain English, and get instant SQL, results, and visualizations.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
