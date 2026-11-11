// Builds an unsigned JWT-shaped token whose `exp` is `expSecondsFromNow` from now.
export function makeToken(expSecondsFromNow) {
  const encode = value => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 1, role: 'job_seeker', exp })}.signature`;
}
