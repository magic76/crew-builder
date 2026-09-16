# Crew Builder — Google Play Release

## Release identity
- App name: Crew Builder
- Package: `com.crewpocket.crewbuilder`
- Version: `1.0.0` (`versionCode 1`)
- Minimum Android: API 26
- Target Android: API 36
- Primary locale: Traditional Chinese (Taiwan)
- Secondary locale: English

## Store listing draft

### Short description (zh-TW)
用一句話打造專屬迷你 App，隨時用自然語言修改。

### Full description (zh-TW)
Crew Builder 讓你把日常需求快速變成真正可以使用的迷你 App。

只要描述你想做什麼，Crew Builder 會使用 Gemini 規劃功能並建立 App。完成後可以立即使用，也能直接用自然語言要求修改，不需要自己寫程式。

你可以建立計時器、家庭小工具、旅行工具、工作輔助、運動工具、互動遊戲等不同類型的 App。

支援的手機能力包含定位、動作感應、陀螺儀、震動、分享、剪貼簿、電池資訊與文字轉語音。只有在 App 功能需要時才會使用相關能力。

主要功能：
- 用自然語言建立迷你 App
- AI 自動規劃畫面、資料與互動
- 建立後立即使用
- 用自然語言持續修改
- 將建立的 App 保存在裝置上
- Gemini Live 語音互動
- 繁體中文與英文介面

Gemini API key 由使用者自行設定，並儲存在裝置的 Android Keystore 保護儲存空間中。

### Short description (en)
Turn an idea into a personal mini app, then change it with natural language.

### Full description (en)
Crew Builder turns everyday needs into working mini apps. Describe what you need and Gemini plans and builds it for you. Use the app immediately, then request changes in natural language without writing code.

Create timers, family tools, travel helpers, productivity utilities, fitness tools, games and more. Crew Builder can automatically use supported phone capabilities when they are useful, including location, motion sensors, gyroscope, vibration, sharing, clipboard, battery information and text-to-speech.

Your generated apps are stored on your device. A Gemini API key is provided by the user and protected using Android Keystore-backed storage.

## Play Console declarations

### App category
Recommended: Tools / Productivity. Pick one based on the final Play Console taxonomy available at submission time.

### Ads
No ads are implemented in the current app. Declare "No" unless ads are added before release.

### App access
Core Builder requires the user to provide a Gemini API key. Reviewers need working access. Add clear review instructions and, if Google requires credentials/access material, provide a review-safe method rather than a personal production secret.

### AI-generated content
Crew Builder is a generative AI app. Complete the Play AI-generated-content declarations. Generated content must follow Google Play content policies and the production app should provide an in-app way to report/flag problematic AI-generated output before public production release.

### Permissions and Data Safety inventory
Current Android permissions:
- INTERNET — Gemini API requests.
- RECORD_AUDIO — Gemini Live voice input; requested at use time.
- ACCESS_COARSE_LOCATION / ACCESS_FINE_LOCATION — generated apps may request the user's current location; requested at use time.
- VIBRATE — generated apps can provide haptic feedback.

Device-only features include accelerometer/gyroscope, clipboard writes, battery state and TTS. Re-check the final Data Safety form against actual transmitted data before submission. Location and microphone data should not be declared as collected merely because permission exists; declaration depends on whether data leaves the device and how it is processed.

## Privacy policy requirements
Publish a public HTTPS privacy-policy page before production submission. It should explain:
- What Crew Builder stores locally (generated apps, settings, API key).
- API key storage and removal.
- What content is sent to Google's Gemini API when the user builds/modifies an app or uses Gemini Live.
- Microphone and location use and when permissions are requested.
- Retention/deletion behavior.
- Third-party service: Google Gemini API and a link/reference to Google's applicable privacy terms.
- Contact method for privacy requests.
- AI-generated content and reporting process.

Do not claim that Google/Gemini retains no data unless verified for the exact Gemini API product/account configuration used by the user.

## Required before production
- [ ] Android CI passes with API 36.
- [ ] Build and install release candidate on Android 16 device/emulator.
- [ ] Produce signed `.aab` with Play App Signing.
- [ ] Keep upload keystore outside Git; back it up securely.
- [ ] Test clean install and upgrade path.
- [ ] Test Build, Modify, Live, Location, sensors, TTS and app persistence.
- [ ] Test permission denial and later retry for microphone/location.
- [ ] Add in-app AI-generated-content report/flag flow.
- [ ] Publish HTTPS privacy policy.
- [ ] Complete Data Safety based on final behavior.
- [ ] Prepare phone screenshots and 512×512 high-resolution icon.
- [ ] Prepare 1024×500 feature graphic if required/used by listing.
- [ ] Complete content rating questionnaire.
- [ ] Complete app access instructions.
- [ ] Upload AAB to internal testing first.
- [ ] Run pre-launch report and fix blocking crashes/ANRs.
- [ ] Complete closed testing / production-access requirements applicable to the developer account.

## Signing
Do not commit passwords or keystore files. Prefer Play App Signing. Configure the upload signing key through local/CI secrets only. The release source tree must remain buildable without containing signing secrets.
