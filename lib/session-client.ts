// Shares one /api/auth/session request between components that mount together
// (navbar, page, layout). Logout and login do full page loads, which reset this cache.
const TTL_MS = 5000;

let pending: Promise<any> | null = null;
let fetchedAt = 0;

export function fetchSession(): Promise<any> {
  if (pending && Date.now() - fetchedAt < TTL_MS) return pending;
  fetchedAt = Date.now();
  pending = fetch("/api/auth/session")
    .then((res) => res.json())
    .catch((err) => {
      pending = null;
      throw err;
    });
  return pending;
}
