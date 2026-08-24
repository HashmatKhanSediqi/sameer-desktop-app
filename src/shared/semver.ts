export type SemVerParts = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
};

/**
 * Parse a semantic version string (optional leading "v").
 * Returns null for invalid versions.
 */
export function parseSemVer(input: string): SemVerParts | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const normalized = trimmed.startsWith('v') || trimmed.startsWith('V') ? trimmed.slice(1) : trimmed;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(normalized);
  if (!match) {
    return null;
  }
  return {
    major: Number.parseInt(match[1]!, 10),
    minor: Number.parseInt(match[2]!, 10),
    patch: Number.parseInt(match[3]!, 10),
    prerelease: match[4] ?? null,
  };
}

/**
 * Compare two semantic versions.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 * Invalid versions compare as equal to each other and less than valid ones when mixed.
 */
export function compareSemVer(a: string, b: string): number {
  const left = parseSemVer(a);
  const right = parseSemVer(b);
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return -1;
  }
  if (!right) {
    return 1;
  }

  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  if (left.patch !== right.patch) {
    return left.patch - right.patch;
  }

  if (left.prerelease === right.prerelease) {
    return 0;
  }
  if (left.prerelease === null) {
    return 1;
  }
  if (right.prerelease === null) {
    return -1;
  }
  return left.prerelease.localeCompare(right.prerelease);
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const left = parseSemVer(candidate);
  const right = parseSemVer(current);
  if (!left || !right) {
    return false;
  }
  return compareSemVer(candidate, current) > 0;
}

export function isSameVersion(a: string, b: string): boolean {
  const left = parseSemVer(a);
  const right = parseSemVer(b);
  if (!left || !right) {
    return false;
  }
  return compareSemVer(a, b) === 0;
}
