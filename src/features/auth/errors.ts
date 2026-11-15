/**
 * What a failed sign-in step says. The server's own words ("Token has expired or is invalid",
 * "For security purposes, you can only request this after 37 seconds", "Failed to fetch") are for
 * developers; each maps to a line that says what to do next.
 */
export const signInMessage = (err: unknown, step: 'send' | 'verify' | 'google'): string => {
  const raw = (err as { message?: string } | null)?.message ?? '';
  if (/failed to fetch|load failed|networkerror|network request/i.test(raw)) return 'No connection. Check your signal and try again.';
  if (/rate limit|security purposes|too many/i.test(raw)) return 'Too many tries. Wait a minute, then try again.';
  if (step === 'verify' && /expired|invalid|otp/i.test(raw)) return 'That code is wrong or has expired. Check it, or send a new one.';
  if (step === 'send' && /invalid|validate/i.test(raw)) return 'That email address does not look right.';
  return raw || (step === 'send' ? 'Could not send the code' : step === 'verify' ? 'That code did not work' : 'Could not sign in with Google');
};
