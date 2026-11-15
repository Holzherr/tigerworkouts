import { describe, expect, it } from 'vitest';
import { signInMessage } from './errors';

describe('sign-in errors', () => {
  it('says a wrong or old code in plain words, not the server’s', () => {
    expect(signInMessage(new Error('Token has expired or is invalid'), 'verify')).toBe('That code is wrong or has expired. Check it, or send a new one.');
  });
  it('says to wait when the email limit is hit', () => {
    expect(signInMessage(new Error('For security purposes, you can only request this after 37 seconds.'), 'send')).toBe('Too many tries. Wait a minute, then try again.');
    expect(signInMessage(new Error('email rate limit exceeded'), 'send')).toBe('Too many tries. Wait a minute, then try again.');
  });
  it('says there is no connection instead of "Failed to fetch"', () => {
    expect(signInMessage(new TypeError('Failed to fetch'), 'send')).toBe('No connection. Check your signal and try again.');
    expect(signInMessage(new TypeError('Load failed'), 'verify')).toBe('No connection. Check your signal and try again.');
  });
  it('names a bad address', () => {
    expect(signInMessage(new Error('Unable to validate email address: invalid format'), 'send')).toBe('That email address does not look right.');
  });
  it('keeps a message it does not know, and has a line when there is none', () => {
    expect(signInMessage(new Error('Signups not allowed for otp'), 'send')).toBe('Signups not allowed for otp');
    expect(signInMessage({}, 'verify')).toBe('That code did not work');
  });
});
