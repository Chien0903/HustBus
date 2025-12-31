const RAW_API_BASE = import.meta.env.VITE_API_URL as string | undefined;
// Normalize to avoid trailing slashes
const API_BASE = (RAW_API_BASE || '').replace(/\/+$/, '');

/**
 * Resolve avatar URLs coming from backend.
 *
 * Historical data may store:
 * - absolute URL: "http(s)://host/uploads/avatar/..."
 * - relative legacy path: "/assets/avatar/..."
 * - relative new path: "/uploads/avatar/..."
 *
 * In dev, the FE runs on a different origin (Vite), so relative avatar paths must be prefixed
 * with the backend base URL to avoid 404s.
 */
export function resolveAvatarUrl(pathUrl?: string | null): string | null {
  if (!pathUrl) return null;
  const raw = String(pathUrl).trim();
  if (!raw) return null;

  // Already absolute
  if (/^https?:\/\//i.test(raw)) return raw;

  // Only rewrite known avatar paths
  if (raw.startsWith('/uploads/avatar/') || raw.startsWith('/assets/avatar/')) {
    return API_BASE ? `${API_BASE}${raw}` : raw;
  }

  // Unknown format -> return as-is
  return raw;
}
