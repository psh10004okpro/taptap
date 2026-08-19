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

## 메모
- 세로 모드 고정: `AndroidManifest.xml` 의 `android:screenOrientation="portrait"`
- 앱 ID: `com.taptap.titans` (capacitor.config.ts)
- 웹 코드 수정 후에는 항상 `npm run android:sync` 를 다시 실행
