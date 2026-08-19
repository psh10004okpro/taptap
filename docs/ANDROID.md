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

## 메모
- 세로 모드 고정: `AndroidManifest.xml` 의 `android:screenOrientation="portrait"`
- 앱 ID: `com.taptap.titans` (capacitor.config.ts)
- 웹 코드 수정 후에는 항상 `npm run android:sync` 를 다시 실행
