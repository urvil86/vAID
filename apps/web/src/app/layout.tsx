import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import './global.css';
import { Providers } from './providers';
import PWARegister from '@/components/PWARegister';

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0c0e11' },
    { media: '(prefers-color-scheme: light)', color: '#f6f1e9' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: {
    default: 'V-Aid · Clinical Intake',
    template: '%s · V-Aid',
  },
  description: 'AI-assisted voice intake for outpatient clinics. Multilingual, structured, fast.',
  applicationName: 'V-Aid',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'V-Aid',
    startupImage: [
      { url: 'https://raw.createusercontent.com/e6024ac6-f96b-47c1-8cb1-6cf80619e3cc/' },
    ],
  },
  icons: {
    icon: [
      {
        url: 'https://raw.createusercontent.com/e6024ac6-f96b-47c1-8cb1-6cf80619e3cc/',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: 'https://raw.createusercontent.com/e6024ac6-f96b-47c1-8cb1-6cf80619e3cc/',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
  openGraph: {
    title: 'V-Aid · Clinical Intake',
    description: 'AI-assisted voice intake for outpatient clinics.',
    type: 'website',
    images: [{ url: 'https://raw.createusercontent.com/e6024ac6-f96b-47c1-8cb1-6cf80619e3cc/' }],
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'msapplication-TileColor': '#0c0e11',
    'msapplication-tap-highlight': 'no',
    'format-detection': 'telephone=no',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="/fontawesome/releases/v6.3.0/css/pro.min.css?token=2c15cc0cc7"
        />
        {/* PWA: prevent tap highlight on iOS */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>
        <Providers>{children}</Providers>
        <PWARegister />
      </body>
    </html>
  );
}
