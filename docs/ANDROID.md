# 안드로이드 빌드 가이드 (Capacitor)

웹 게임 코드는 그대로 두고 네이티브 컨테이너로 감싼다.

## 요구사항 (로컬 PC)
- Android Studio (Ladybug 이상) + Android SDK 34+
- JDK 17

## 빌드 절차
```bash
npm install
npm run android:sync   # 웹 빌드 → android/ 에 동기화
npm run android:open   # Android Studio 로 열기
```
Android Studio 에서 Run ▶ (실기기/에뮬레이터) 또는
Build > Generate Signed App Bundle 로 스토어용 AAB 생성.

## CLI 만으로 디버그 APK
```bash
npm run android:sync
cd android && ./gradlew assembleDebug
# 산출물: android/app/build/outputs/apk/debug/app-debug.apk
```

## 아이콘 / 스플래시 / 스토어 이미지
`python3 tools/art/icons.py` 가 런처 아이콘(5밀도 x 3종)·스플래시·`store/` 의
Play 등록 이미지를 한 번에 만든다. 기본 Capacitor 아이콘(파란 X)은 교체 완료.
아트 스타일을 바꾸면 `tools/art/raw/appicon.png` 를 지우고 다시 실행할 것.

## 프레임 (저사양 내성)
```bash
npm run preview                # 다른 터미널
npm run perf                   # 실 GPU 창이 뜬다 (--headless 는 참고용)
```
endgame 프리셋 + 스킬 6종 동시 발동 + 연타 조건에서 CPU 감속을 걸어 근사한다.
2026-08 기준 macOS 실 GPU: 1x 51fps / 4x 50fps / 6x 44fps — CPU 병목이 아니다.
헤드리스는 소프트웨어 렌더라 GPU 병목에 갇혀 수치가 의미 없다 (감속해도 안 변함).
실기기 확인은 여전히 필요하다 — 이 측정은 회귀 감지용이다.

## 세로 화면 · 안전영역 · 백그라운드

실기기 없이 확인 가능한 것은 E2E 로 고정해 뒀다 (`npm test`).

- **세로 고정**: `AndroidManifest.xml` `screenOrientation="portrait"`
- **노치/홈바 안전영역**: `index.html` 이 `viewport-fit=cover` 로 화면 전체를 쓰되
  `#app` 을 `env(safe-area-inset-*)` 안쪽에 절대배치한다. 하단 탭 바가 제스처 홈바에
  먹히지 않는다.
  - Phaser 의 `expandParent` 는 **꺼야 한다** — 기본값(true)이면 ScaleManager 가
    부모의 width/height 를 100% 로 덮어써 인셋이 무시된다.
  - 인셋이 바뀌면 `ResizeObserver` 로 `getParentBounds()` → `refresh()` 를 부른다.
    `refresh()` 만 부르면 **재중앙정렬만 하고 크기는 그대로다**.
  - env() 를 CSS 변수로 감싸 뒀으므로 테스트에서 값을 주입해 검증할 수 있다.
- **오디오 자동재생**: 브라우저가 제스처 전 오디오를 막는다. `sfx.ts` 가
  `pointerdown` 캡처로 컨텍스트를 만들고 `resume()` 한다 — 부팅 직후에는
  컨텍스트가 없거나 suspended 여야 정상이다.
- **백그라운드 복귀**: 숨겨진 동안 렌더 루프가 멈춰 영웅 DPS 가 전혀 쌓이지 않는다.
  앱이 죽어 재부팅될 때만 오프라인 보상을 주면 앱을 살려둔 채 전환한 유저만 손해이므로,
  `visibilitychange` 복귀 시점에 부팅과 같은 규칙(60초 초과, 상한 클램프)으로 정산하고
  `offline-return` 이벤트로 팝업을 띄운다.
- **진동**: `haptics.ts` — 설정에서 끌 수 있다. 실기기 확인 필요.

## 메모
- 세로 모드 고정: `AndroidManifest.xml` 의 `android:screenOrientation="portrait"`
- 앱 ID: `com.taptap.titans` (capacitor.config.ts)
- 웹 코드 수정 후에는 항상 `npm run android:sync` 를 다시 실행
