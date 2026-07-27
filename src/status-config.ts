export const visibleSystems = [
  { token: '0f71', name: 'Corporate Website' },
  { token: '1wbc', name: 'UCID Authentication' },
  { token: 'sumd', name: 'Infrastructure Monitoring' },
  { token: 'je6a', name: 'Certificate Issuance' },
] as const;

export const visibleCheckTokens = visibleSystems.map(({ token }) => token);
