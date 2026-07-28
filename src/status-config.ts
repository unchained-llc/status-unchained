export const visibleSystems = [
  { token: '0f71', name: 'Corporate Web' },
  { token: '1wbc', name: 'Identity & Authentication' },
  { token: 'je6a', name: 'Certificate Authority' },
  { token: 'sumd', name: 'Infrastructure Operations' },
  { token: '5gqg', name: 'Network Continuity' },
  { token: 'u13g', name: 'Data Protection' },
] as const;

export const visibleCheckTokens = visibleSystems.map(({ token }) => token);
