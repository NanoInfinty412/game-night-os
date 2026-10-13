/** URL a phone opens (via QR code) to join a room. */
export function buildJoinUrl(origin: string, roomCode: string): string {
  const url = new URL('/play', origin);
  url.searchParams.set('code', roomCode);
  return url.toString();
}
