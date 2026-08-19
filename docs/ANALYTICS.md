# 분석 이벤트 스키마

코어: `src/core/Analytics.ts` — Phaser 비의존 싱글턴. 링버퍼(300개) + 플러거블 싱크.
연동(Firebase/Amplitude/Supabase)은 `Analytics.setSink(fn)` 하나로 끝난다. 미연동 시에도
이벤트는 정상 축적되며 개발 모드에서 콘솔로 확인된다 (`window.__taptap` 훅 → `Analytics.snapshot()`).

## 공통 필드
| 필드 | 설명 |
|---|---|
| `t` | epoch ms |
| `session` | 부팅 단위 세션 ID |

## 이벤트 정의

### 수명주기
| 이벤트 | 파라미터 | 목적 |
|---|---|---|
| `session_start` | resumed, offlineSec, stage, maxStage, relics | DAU/복귀 간격, 이탈 시점의 진행도 |
| `save_stale` | — | 멀티탭 충돌 빈도 (지원 이슈 예측) |

### 진행/벽 (핵심 리텐션 지표)
| 이벤트 | 파라미터 | 목적 |
|---|---|---|
| `stage_clear` | stage, dwellMs | **벽 위치 실측** — dwellMs 분포가 시뮬(sim/)과 실유저의 차이를 보여준다 |
| `boss_fail` | stage | 보스 벽 위치. 연속 실패 스테이지 = 이탈 위험 지점 |
| `prestige` | atStage, gained, totalRelics | 환생 주기·깊이. 시뮬 예측 대비 검증 |

### 경제
| 이벤트 | 파라미터 | 목적 |
|---|---|---|
| `upgrade_buy` | kind(tap/hero/artifact), id, level, cost | 소비 패턴, 죽은 콘텐츠(안 사는 영웅) 탐지 |
| `quest_claim` | id, reward, amount, stage | 퀘스트 참여율 |
| `equip_drop` | slot, rarity, statPct, stage, equipped | 드롭 체감·인플레 감시 |

### 참여
| 이벤트 | 파라미터 | 목적 |
|---|---|---|
| `skill_use` | id, stage | 스킬별 사용률 (버려지는 스킬 탐지) |

### 수익화 (BM 퍼널)
| 이벤트 | 파라미터 | 목적 |
|---|---|---|
| `ad_offer` | slot | 광고 노출 수 (퍼널 분모) |
| `ad_reward` | slot | 완료 시청 (퍼널 분자 → 슬롯별 완료율) |
| `ad_abort` | slot | 중도 이탈 |

## 대시보드 최소 셋 (론칭 시)
1. D1/D7 리텐션 x 최고 스테이지 코호트
2. stage_clear dwellMs p50/p90 by stage — 벽 히트맵
3. 환생 횟수 분포 (0회 유저 비율 = 온보딩 문제)
4. ad_offer→ad_reward 슬롯별 전환율
