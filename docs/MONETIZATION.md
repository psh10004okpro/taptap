# BM 설계 (수익화)

## 원칙
1. **무과금 페이싱이 기준선** — 시뮬(docs/BALANCE.md)은 IAP 미반영으로 돌린다.
   보석은 "시간 단축"만 팔고, 무과금이 도달 불가능한 파워는 팔지 않는다.
2. **지급은 서버 검증 후에만** — 클라이언트 단독으로 보석이 늘어나는 경로는
   Mock(개발 모드)뿐이며 ?dev=1 에서만 활성화된다.
3. 수익 구성 목표: 보상형 광고(주 수입) + IAP(보조) — 방치형 표준.

## 재화 흐름
```
[IAP] ─ Google Play 결제 ─→ verify-purchase(영수증 검증+원장) ─→ grantGems(purchased=true)
                                                                     │
[획득]  업적/이벤트 소량 지급 ──────────────→ grantGems(purchased=false)
                                                                     ▼
[소비]  쿨다운 리셋 20 · 골드팩 50 · 장비상자 80 · 트리 리스펙 30  (gem_spend 계측)
```

## 상품 (GEM_PACKS — 스토어 product id 와 1:1)
| id | 상품 | 보석 | 가격(표기) | 비고 |
|---|---|---|---|---|
| gems_s | 보석 한 줌 | 80 | ₩3,900 | |
| gems_m | 보석 주머니 | 450 | ₩19,000 | +12% |
| gems_l | 보석 금고 | 1,200 | ₩45,000 | +23% |
| starter | 스타터 팩 | 120 | ₩5,900 | 전설 장비 1 동봉, 1회 한정 |

## 소비처 설계 근거
- **골드팩 = killGold(현재 스테이지) x 600** — 스테이지 비례라 어느 구간에서도
  "약 10분치 파밍" 가치로 고정. 경제 인플레 없음.
- **장비 상자** — 확률형: 영웅 85% / 전설 15%. **UI 에 확률 상시 표기**
  (한국 게임산업법 확률형 아이템 공시 의무). 확률 변경 시 config 의
  EQUIP_BOX_RATES 와 상점 표기가 자동 동기화된다.
- 쿨다운 리셋: 광고(무료)와 보석(즉시) 이중 경로 — 광고 퍼널을 잠식하지 않도록
  보석 가격을 광고 시청 대비 비싸게 유지.

## 보상형 광고 전달 = 요정 (TT2 문법)
상단 고정 광고 버튼 대신 **요정이 전투 화면을 가로질러 날아간다** (`FAIRY` 상수).
- 첫 등장 22초, 이후 45~95초 랜덤. 화면 횡단 9초 — 놓치면 다음 기회까지 기다린다.
- 탭하면 지금 쓸모 있는 슬롯을 골라 `AdRewards.offer` 로 제안:
  골드 부스트 미적용 → `gold-boost`, 아니면 쿨다운 대기 중 → `cooldowns`.
  둘 다 불필요하면 보상 없이 지나가고 그 사실을 토스트로 알린다.
- 광고 노출을 상시 버튼에서 **시간 제한 이벤트**로 바꾼 것이라 클릭률은 오르지만
  총 노출 기회는 줄어든다. 등장 주기는 ad_offer/ad_reward 퍼널 실측 후 조정할 것.
- 실제 SDK 연동은 기존대로 `AdProvider` 교체만으로 끝난다 (요정은 UI 계층).

## VIP (누적 구매 보석 기준, 영구)
| 티어 | 누적 | 혜택 (QoL 만) |
|---|---|---|
| 1 | 100 | 오프라인 상한 +1h, 퀘스트 골드 +25% |
| 2 | 500 | +2h, +50% |
| 3 | 1,500 | +4h, +100% |

## 결제 연동 절차 (안드로이드)
1. Play Console 에 상품 4종 등록 (id 동일)
2. Capacitor 결제 플러그인 연동 → 구매 성공 시 purchaseToken 획득
3. `verify-purchase` Edge Function 호출 (JWT + productId + purchaseToken)
   - Google Play Developer API 로 검증 (서비스 계정 시크릿 필요)
   - gem_ledger 에 기록 — purchase_token unique 로 **중복 지급 원천 차단**
4. ok 응답 후에만 `IapProvider.purchase` resolve → `grantGems(gems, true)`
5. `IapService.setProvider(new CapacitorIapProvider())` 한 줄로 교체

## 계측 (docs/ANALYTICS.md 에 등록됨)
`iap_start / iap_purchase / iap_fail / gem_spend(sink)` — 퍼널: 상점 진입→구매 전환율,
싱크별 소비 분포로 가격 조정.

## 출시 전 체크리스트
- [ ] Play Console 상품 등록 + 가격 현지화
- [ ] 서비스 계정 시크릿 3종 설정 (supabase/README.md)
- [ ] 확률형 아이템 확률 공시 페이지 (스토어 설명란 + 인게임 — 인게임은 구현됨)
- [ ] 환불 처리 정책: gem_ledger 기준 회수 배치 (미구현 — 운영 시 추가)
- [ ] 청소년 결제 한도/법정대리인 동의 문구 (스토어 정책 준수)
