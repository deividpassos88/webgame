import * as THREE from 'three';

/**
 * Procura um AnimationClip por palavras-chave (case-insensitive).
 * Útil porque exportações do Blender/FBX podem nomear os clipes
 * de formas diferentes (ex: "Armature|Idle", "idle_anim", etc).
 */
export function findClip(
  clips: THREE.AnimationClip[],
  keywords: string[]
): THREE.AnimationClip | undefined {
  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  // 1. correspondência exata
  for (const clip of clips) {
    if (lowerKeywords.includes(clip.name.toLowerCase())) return clip;
  }

  // 2. correspondência por substring
  for (const clip of clips) {
    const name = clip.name.toLowerCase();
    if (lowerKeywords.some((k) => name.includes(k))) return clip;
  }

  return undefined;
}

/**
 * Busca um clipe pelo NOME EXATO (usado para o mapeamento manual,
 * quando queremos garantir 100% de precisão em vez de heurística
 * por palavra-chave).
 */
export function findClipByName(
  clips: THREE.AnimationClip[],
  exactName: string
): THREE.AnimationClip | undefined {
  return clips.find((c) => c.name === exactName);
}

/**
 * Gera uma lista de debug com nome, duração e quantidade de tracks
 * de cada clipe encontrado. Útil para identificar manualmente
 * qual clipe é qual quando os nomes não ajudam (aparece no painel
 * de logs do jogo, tecla `).
 */
export function describeClips(clips: THREE.AnimationClip[]): string[] {
  return clips.map(
    (c, i) =>
      `[${i}] "${c.name}" — duração: ${c.duration.toFixed(2)}s — tracks: ${c.tracks.length}`
  );
}