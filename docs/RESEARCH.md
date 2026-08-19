# 2D 게임 엔진 선정 조사 요약 (2026-08)

## 결론
**Phaser 4 + TypeScript + Vite + Playwright** 채택.

## 근거
1. **에이전트 피드백 루프**: Playwright 가 브라우저를 열어 탭 입력·스크린샷으로 검증 → AI 코딩 루프가 완전 자동으로 닫힘.
2. **성능**: JS 렌더링 벤치마크(1만 스프라이트) Phaser 43 FPS — Babylon(56)·Pixi(47) 다음, Kaplay(3) 압도.
   Phaser 4(2026-04)는 인덱스 버퍼·WebGL2·SpriteGPULayer(100만 스프라이트/1드로우콜)로 모바일 개선.
3. **로딩**: 빌드 2~5MB, 3G에서도 5초 미만. Unity WebGL(30~100MB, 10~30초) 대비 캐주얼 웹게임에 결정적.
4. **환각 최소화**: Phaser 자료가 최다. 공식 저장소 `phaserjs/phaser/skills/`(28종)로 v4 API 정확도 확보 가능.

## 비교 요약
| 스택 | 판정 |
|---|---|
| Godot 4.6 | 네이티브 배포 필수 시 차선. 단 VideoStreamPlayer 알파 미지원, 웹 로딩 중간 |
| Unity | 웹 빌드 크기/로딩 최악, 에이전트 친화성 낮음(.meta·바이너리 씬) |
| Kaplay/Excalibur | 학습자료 부족 → LLM 환각 다수, 성능 열세 |

## 멀티플레이 (향후)
- 랭킹: Supabase → 실시간: Colyseus(자체호스팅 → Cloud $15/mo).
- 탭 장르는 치팅에 취약: 점수는 서버 계산(탭 이벤트만 전송), 탭 속도 상한 검증 필수.

## 몬스터 영상 렌더링 검토
- MP4/H.264 는 알파 채널 없음. Safari=HEVC+alpha / Chrome=VP9+alpha 로 상호배타.
- 결론: 영상 소스는 ffmpeg 로 스프라이트시트로 굽는다(전환 0프레임, iOS 16개 비디오 제한 회피).
- 컷신 등 비상호작용 연출만 알파 패킹(RGB|Alpha 나란히) + 셰이더 방식 고려.
