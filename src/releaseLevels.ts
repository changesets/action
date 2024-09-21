export const RELEASE_LEVELS = [
  {
    key: "dep",
    index: 0,
  },
  {
    key: "patch",
    index: 1,
  },
  {
    key: "minor",
    index: 2,
  },
  {
    key: "major",
    index: 3,
  },
] as const;
type ReleaseLevel = typeof RELEASE_LEVELS[number];
export type ReleaseLevelKey = (typeof RELEASE_LEVELS)[number]["key"];
export const ReleaseLevelKey = (k:ReleaseLevelKey)=> getLevel({key:k}).key;
export type ReleaseLevelIndex = (typeof RELEASE_LEVELS)[number]["index"];
export const ReleaseLevelIndex = (i:ReleaseLevelIndex)=> getLevel({index:i}).index;

export function getLevel(by:
  | { key: ReleaseLevelKey }
  | { index: ReleaseLevelIndex }
): ReleaseLevel {
  if ("key" in by) {
    return RELEASE_LEVELS.find((l) => l.key === by.key)!;
  } else {
    return RELEASE_LEVELS.find((l) => l.index === by.index)!;
  }
}

export function getKeyFromIndex(index: ReleaseLevelIndex) {
  return RELEASE_LEVELS.find((l) => l.index === index)!.key;
}

export function getIndexFromKey(key: ReleaseLevelKey) {
  return RELEASE_LEVELS.find((l) => l.key === key)!.index;
}

function isReleaseLevelKey(key: string): key is ReleaseLevelKey {
  return RELEASE_LEVELS.some((l) => l.key === key);
}

export function assertIsReleaseLevelKey(
  key: string
): asserts key is ReleaseLevelKey {
  if (!isReleaseLevelKey(key)) {
    throw new Error(`Invalid release level: ${key}`);
  }
}

function isReleaseLevel(index: number): index is ReleaseLevelIndex {
  return RELEASE_LEVELS.some((l) => l.index === index);
}

export function assertIsReleaseLevelIndex(
  index: number
): asserts index is ReleaseLevelIndex {
  if (!isReleaseLevel(index)) {
    throw new Error(`Invalid release level: ${index}`);
  }
}

export function getHigherIndex(
  a: ReleaseLevelIndex,
  b: ReleaseLevelIndex
): ReleaseLevelIndex {
  return Math.max(a, b) as ReleaseLevelIndex;
}

export function checkForLevelsInString(str: string) {
  const matches = [];
  for (let level of RELEASE_LEVELS) {
    if (str.toLowerCase().includes(level.key)) {
      matches.push(level);
    }
  }
  return matches;
}