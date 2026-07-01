'use client';

/**
 * Persistent red banner shown whenever the client-side auth bypass flag is on,
 * so a dev super-user session can never be mistaken for a real one during a
 * demo. Renders nothing when the flag is unset (i.e. always nothing in a
 * correctly-configured production build).
 */
export default function DevBypassBanner() {
  if (process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== '1') return null;

  return (
    <div
      role="alert"
      className="fixed bottom-0 inset-x-0 z-[9999] pointer-events-none bg-red-600 text-white text-center text-[11px] font-bold tracking-wide py-1 shadow-[0_-2px_8px_rgba(0,0,0,0.25)]"
    >
      ⚠ AUTH BYPASS ACTIVE — DEV ONLY (no real login required)
    </div>
  );
}
