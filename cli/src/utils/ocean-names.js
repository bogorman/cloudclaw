/**
 * Ocean-themed name generator for CloudClaw instances
 * Because claws belong in the ocean! 🦀
 */

const adjectives = [
  'salty', 'coral', 'reef', 'tidal', 'deep',
  'pacific', 'stormy', 'misty', 'azure', 'pearl',
  'sandy', 'tropical', 'arctic', 'atlantic', 'calm',
  'foamy', 'briny', 'coastal', 'abyssal', 'pelagic'
];

const creatures = [
  'hermit', 'lobster', 'kraken', 'shrimp', 'crayfish',
  'nautilus', 'urchin', 'barnacle', 'crab', 'prawn',
  'krill', 'squid', 'octopus', 'starfish', 'clam',
  'mussel', 'oyster', 'scallop', 'conch', 'mantis'
];

export function generateOceanName() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const creature = creatures[Math.floor(Math.random() * creatures.length)];
  return `${adj}-${creature}`;
}

export function generateUniqueOceanName(existingNames = []) {
  const existing = new Set(existingNames);
  let attempts = 0;
  const maxAttempts = 100;
  
  while (attempts < maxAttempts) {
    const name = generateOceanName();
    if (!existing.has(name)) {
      return name;
    }
    attempts++;
  }
  
  // Fallback: add random number
  return `${generateOceanName()}-${Math.floor(Math.random() * 1000)}`;
}
