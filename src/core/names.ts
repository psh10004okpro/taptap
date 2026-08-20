// ---------------------------------------------------------------------------
// 게임 데이터의 표시 이름 — 오버레이 i18n.
//
// config.ts 는 한국어 원문을 그대로 들고 있고(단일 출처), 다른 언어일 때만
// 카탈로그가 덮는다. 번역이 없는 항목은 자동으로 한국어가 나온다 —
// 콘텐츠를 늘려도 번역이 늦어질 뿐 화면이 비지 않는다.
//
// 씬은 def.name 을 직접 쓰지 말고 여기를 경유한다.
// ---------------------------------------------------------------------------
import type {
  AchievementDef, ArtifactDef, EquipSlotDef, HeroDef, PetDef,
  QuestDef, RarityDef, SkillDef, TreeNodeDef, ZoneDef,
} from '../config.ts';
import { t } from './i18n.ts';

export const zoneName = (z: ZoneDef): string => t(`zone.${z.id}.name`, z.name);
export const monsterName = (z: ZoneDef, slot: number): string =>
  t(`zone.${z.id}.m${slot}`, z.monsterNames[slot] ?? '');
export const bossName = (z: ZoneDef): string => t(`zone.${z.id}.boss`, z.bossName);

export const heroName = (h: HeroDef): string => t(`hero.${h.id}.name`, h.name);
export const heroTitle = (h: HeroDef): string => t(`hero.${h.id}.title`, h.title);
/** 패시브 설명 (마일스톤 index) */
export const heroPassive = (h: HeroDef, i: number): string =>
  t(`hero.${h.id}.p${i}`, h.passives[i]?.desc ?? '');

export const skillName = (s: SkillDef): string => t(`skill.${s.id}.name`, s.name);
export const skillDesc = (s: SkillDef): string => t(`skill.${s.id}.desc`, s.desc);
export const skillGlyph = (s: SkillDef): string => t(`skill.${s.id}.glyph`, s.glyph);

export const artifactName = (a: ArtifactDef): string => t(`relic.${a.id}.name`, a.name);
export const artifactDesc = (a: ArtifactDef): string => t(`relic.${a.id}.desc`, a.desc);

export const petName = (p: PetDef): string => t(`pet.${p.id}.name`, p.name);
export const petDesc = (p: PetDef): string => t(`pet.${p.id}.desc`, p.desc);
export const petGlyph = (p: PetDef): string => t(`pet.${p.id}.glyph`, p.glyph);

export const slotName = (s: EquipSlotDef): string => t(`slot.${s.id}.name`, s.name);
export const rarityName = (r: RarityDef, i: number): string => t(`rarity.${i}.name`, r.name);

export const treeName = (n: TreeNodeDef): string => t(`tree.${n.id}.name`, n.name);
export const treeDesc = (n: TreeNodeDef): string => t(`tree.${n.id}.desc`, n.desc);

export const questDesc = (q: QuestDef): string => t(`quest.${q.id}.desc`, q.desc);
export const achDesc = (a: AchievementDef): string => t(`ach.${a.id}.desc`, a.desc);
