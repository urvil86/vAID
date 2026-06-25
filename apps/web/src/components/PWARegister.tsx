'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// PWA / service worker is OPT-IN (default off). A proper caching service worker
// isn't shipped yet, so by default we register nothing and actively tear down
// any previously-installed worker + caches. Enable later with
// NEXT_PUBLIC_ENABLE_PWA=1 once a real caching sw.js exists.
const PWA_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PWA === '1';

export default function PWARegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    if (!PWA_ENABLED) {
      // Tear down any previously-installed service worker + caches. Do NOT
      // register one (avoids the self-reloading kill-switch loop).
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => regs.forEach((r) => r.unregister()))
          .catch(() => {});
      }
      if (typeof caches !== 'undefined') {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      return;
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[PWA] Service worker registered, scope:', reg.scope);

          // Check for updates
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                toast('Update available', {
                  description: 'Reload to get the latest version of V-Aid.',
                  action: {
                    label: 'Reload',
                    onClick: () => window.location.reload(),
                  },
                  duration: 10000,
                });
              }
            });
          });
        })
        .catch((err) => {
          console.warn('[PWA] Service worker registration failed:', err);
        });
    }

    // Capture install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Only show banner if user hasn't dismissed before (checked inside event handler — client only)
      const dismissed =
        typeof window !== 'undefined' ? sessionStorage.getItem('pwa-install-dismissed') : null;
      if (!dismissed) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Hide banner if already installed
    window.addEventListener('appinstalled', () => {
      setShowInstallBanner(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem('pwa-install-dismissed', '1');
    setShowInstallBanner(false);
  };

  if (!showInstallBanner) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'calc(100% - 2rem)',
        maxWidth: '420px',
        background: '#1b222a',
        border: '1px solid #2a333d',
        borderRadius: '14px',
        padding: '1rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      {/* V-Aid mini icon */}
      <div
        style={{
          width: 40,
          height: 40,
          background: '#0c0e11',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
          <path
            d="M4 6 L12 18 L20 6"
            stroke="#56b3c9"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line
            x1="7"
            y1="21"
            x2="17"
            y2="21"
            stroke="#d8693e"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: '0.6rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: '#6e7884',
            marginBottom: '0.2rem',
          }}
        >
          Install App
        </p>
        <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e7ecf0', lineHeight: 1.3 }}>
          Add V-Aid to your home screen
        </p>
        <p style={{ fontSize: '0.75rem', color: '#6e7884', marginTop: '0.15rem' }}>
          Works offline · No app store needed
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flexShrink: 0 }}>
        <button
          onClick={handleInstall}
          style={{
            background: '#56b3c9',
            color: '#0c0e11',
            border: 'none',
            borderRadius: 6,
            padding: '0.4rem 0.9rem',
            fontFamily: "'Space Mono', monospace",
            fontSize: '0.65rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            cursor: 'pointer',
          }}
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          style={{
            background: 'transparent',
            color: '#6e7884',
            border: 'none',
            fontSize: '0.7rem',
            cursor: 'pointer',
            fontFamily: "'Space Mono', monospace",
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
