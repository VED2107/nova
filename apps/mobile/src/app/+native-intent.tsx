/**
 * "Open with NOVA" (Android): a file manager or another app hands NOVA a
 * `content://` or `file://` URI. That is not a route, so it is sent to /open,
 * which adds the file and starts playing it (desktop: file associations).
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (/^(content|file):\/\//i.test(path)) return `/open?uri=${encodeURIComponent(path)}`;
  } catch {
    /* fall through to the normal route */
  }
  return path;
}
