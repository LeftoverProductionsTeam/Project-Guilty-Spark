import type { Vec3 } from './types';
export interface EnemyType {
  id: string;
  name: string;
  actorVariantPath: string;
  points: number;
}
export interface SpawnZone {
  id: string;
  position: Vec3;
  radius: number;
  enabled: boolean;
}
export interface WaveDefinition {
  id: string;
  name: string;
  boss: boolean;
  scoreMultiplierMilli: number;
  groups: { enemyId: string; count: number }[];
}
export interface FirefightConfig {
  schemaVersion: number;
  title: string;
  sourceSha256: string | null;
  seed: number;
  playerCount: number;
  teamLives: number;
  allowRevives: boolean;
  rounds: number;
  endless: boolean;
  preparationMs: number;
  countdownMs: number;
  intermissionMs: number;
  spawnIntervalMs: number;
  spawnTimeoutMs: number;
  stuckTimeoutMs: number;
  maxSpawnAttempts: number;
  maxAlive: number;
  maxTotalPerWave: number;
  difficultyStepPercent: number;
  extraPlayerCountPercent: number;
  enemies: EnemyType[];
  spawnZones: SpawnZone[];
  waves: WaveDefinition[];
  startingEquipment: string[];
  replenishAmmoEachWave: boolean;
  supplyDropTags: string[];
}
export interface FirefightPreset {
  id: string;
  name: string;
  config: FirefightConfig | null;
  missingActorVariants: string[];
  detail: string;
}
export interface FirefightCatalog {
  enemies: EnemyType[];
  presets: FirefightPreset[];
  defaultConfig: FirefightConfig;
}
export interface FirefightValidation {
  valid: boolean;
  sourceMatches: boolean;
  missingActorVariants: string[];
  missingEquipment: string[];
  runtimeIntegrated: false;
  diagnostics: string[];
}
export interface FirefightSimulation {
  schemaVersion: number;
  scope: 'authoringSimulationOnly';
  runtimeIntegrated: false;
  gameplayVerified: false;
  configSha256: string;
  state: {
    phase: string;
    elapsedMs: number;
    waveNumber: number;
    roundNumber: number;
    kills: number;
    score: number;
    teamLives: number;
    reason: string | null;
  };
  events: { atMs: number; kind: string; detail: string }[];
  diagnostics: string[];
}
