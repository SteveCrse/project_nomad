import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ds';

/**
 * A soft lock over the whole tool, so someone who stumbles onto the deployed
 * site (or scrapes Netlify subdomains) doesn't walk straight in. It is not
 * real security: the check runs in the browser and the bundle is public.
 *
 * The password comes from the `ACCESS_PASSWORD` env var at build time, and
 * `vite.config.ts` bakes in only its SHA-256. A correct entry is remembered
 * as a cookie holding that hash, so a changed password locks everyone out again. With no hash set,
 * dev builds skip the gate and production builds stay locked.
 */
declare const __ACCESS_HASH__: string;
const HASH = __ACCESS_HASH__;
const COOKIE = 'nomad_access';
const MAX_AGE = 60 * 60 * 24 * 365;

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readCookie(): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
}

function writeCookie(value: string) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE}=${value}; Max-Age=${MAX_AGE}; Path=/; SameSite=Strict${secure}`;
}

export function PasswordGate({ children }: { children: ReactNode }) {
  const open = !HASH && import.meta.env.DEV;
  const [unlocked, setUnlocked] = useState(() => open || (!!HASH && readCookie() === HASH));
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => setError(false), [value]);

  if (unlocked) return <>{children}</>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!HASH) return;
    const hash = await sha256(value.trim());
    if (hash !== HASH) {
      setError(true);
      return;
    }
    writeCookie(hash);
    setUnlocked(true);
  };

  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-surface-bg p-4">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-sm border border-border-strong bg-surface-panel p-6"
      >
        <h1 className="font-display text-xl font-extrabold tracking-[0.06em] text-text-primary">
          N.O.M.A.D.
        </h1>
        {HASH ? (
          <>
            <label className="flex flex-col gap-1.5 font-body text-[13px] text-text-primary">
              Password
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="rounded-sm border border-border-default bg-putty-100 px-3 py-2 font-mono text-[15px] text-n-900 outline-none focus:border-amber-500"
              />
            </label>
            {error && <p className="font-body text-[13px] text-status-danger">Wrong password.</p>}
            <Button type="submit" disabled={!value}>
              Enter
            </Button>
          </>
        ) : (
          <p className="font-body text-[13px] text-text-primary">
            Access is not configured for this build.
          </p>
        )}
      </form>
    </div>
  );
}
