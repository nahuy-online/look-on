# Look On — Android App (Tauri 2.0)

**Look On** — это Android-приложение (аналог Pure Tuber / Green Tuber) с просмотром YouTube без рекламы через Invidious API и встроенным WireGuard VPN.

Это **нативное приложение** (не веб-сайт). Сайт-лендинг делается отдельно.

---

## ⚠️ Важно: сборка только на вашем компьютере

Каркас проекта полностью готов, но **собрать APK здесь нельзя** — нужна Android SDK/NDK.
Все шаги ниже выполняются **на вашем компьютере** (Windows/macOS/Linux).

---

## Пошаговая инструкция

### Шаг 1: Установка инструментов

**Где выполнять:** откройте терминал (на Windows — PowerShell или Git Bash, на macOS/Linux — Terminal) в **любой папке**. Эти команды устанавливают глобальные инструменты, место не имеет значения.

```bash
# 1. Rust (на Windows скачайте с https://rustup.rs и запустите установщик)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Android Studio (даёт SDK + NDK)
#    Скачайте с https://developer.android.com/studio
#    После установки откройте: Settings → SDK Manager → установите:
#      - SDK Platforms: Android 14 (API 34)
#      - SDK Tools: NDK (Side by side), CMake, Android SDK Build-Tools

# 3. Tauri CLI
cargo install tauri-cli --version "^2.0"

# 4. Bun (если нет — установите с https://bun.sh)
curl -fsSL https://bun.sh/install | bash

# 5. Добавьте Android-таргеты для Rust
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

**Проверка:** перезапустите терминал и выполните `rustc --version`, `cargo --version`, `bun --version` — все должны показать версии.

---

### Шаг 2: Копирование проекта

**Где выполнять:** в терминале перейдите в папку, где хотите хранить проект:

```bash
cd ~/Projects        # или любая ваша папка
# Если проект в git:
git clone <ваш-репозиторий> look-on
cd look-on/native
# Или просто скопируйте папку native/ с этого проекта на свой компьютер
```

**Все последующие команды выполняйте в папке `native/`.**

---

### Шаг 3: Иконка приложения

**Где разместить `app-icon.png`:** положите файл `app-icon.png` (PNG, **1024×1024 пикселей**) прямо в папку `native/` (рядом с `package.json`, `index.html`).

```bash
# Убедитесь что вы в папке native/
ls app-icon.png      # должен показать файл

# Сгенерируйте все размеры иконок:
cargo tauri icon ./app-icon.png
# Создаст папку src-tauri/icons/ со всеми размерами для Android
```

---

### Шаг 4: Установка зависимостей

```bash
# В папке native/
bun install
```

---

### Шаг 5: Инициализация Android-проекта

```bash
cargo tauri android init
# Создаст src-tauri/gen/android/ — полный Android Studio проект
```

---

### Шаг 6: Тестовый запуск

```bash
# Подключите Android-телефон (USB debugging включён) ИЛИ запустите эмулятор
cargo tauri android dev
# Соберёт debug-версию и установит на устройство
```

Приложение запустится. Вы увидите:
- Главную с Invidious-лентой (промо-видео с янтарными бейджами)
- Плеер с нативным `<video>` (без рекламы, скорость до 3×)
- VPN-экран (симулированный режим)
- Очередь, загрузки, историю, плейлисты, настройки
- Переключение языка EN/RU

---

### Шаг 7: Release-сборка APK

```bash
cargo tauri android build
# APK появится в:
# src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
```

**Подпись APK** (нужно для распространения):
```bash
# Создайте keystore (один раз, запомните пароль):
keytool -genkey -v -keystore look-on.keystore -alias look-on \
  -keyalg RSA -keysize 2048 -validity 10000

# Настройте подпись в src-tauri/gen/android/app/build.gradle.kts:
# signingConfigs { create("release") { ... } }
```

---

### Шаг 8: Публикация

**GitHub Releases (бесплатно):**
1. Создайте GitHub-репозиторий `look-on`
2. Загрузите `app-universal-release.apk` в Releases
3. Лендинг будет ссылаться на `https://github.com/ваш/look-on/releases/latest`

**Google Play ($25 одноразово):**
1. Создайте аккаунт Google Play Console
2. Загрузите AAB (не APK): `cargo tauri android build --target aab`
3. Пройдите ревью

---

## Название проекта

Проект называется **"Look On"** (не puretuber.vpn). Это уже настроено в:
- `tauri.conf.json` → `productName: "Look On"`, `identifier: "com.lookon.app"`
- `Cargo.toml` → `name = "look-on"`
- Rust → `look_on_lib`

---

## Реальный VPN (опционально, позже)

Приложение работает в **симулированном режиме VPN**. Для настоящего VPN:

1. Арендуйте VPS (Hetzner/Vultr, ~$5/мес)
2. Установите WireGuard:
   ```bash
   curl -O https://raw.githubusercontent.com/angristan/wireguard-install/master/wireguard-install.sh
   bash wireguard-install.sh
   ```
3. Получите: endpoint, peer public key, ваш private key
4. В `src-tauri/src/vpn/wireguard.rs` → реализуйте `server_creds_for()`
5. Зарегистрируйте WireGuard-плагин (см. `src-tauri/android-plugins/wireguard/README.md`)
6. Пересоберите: `cargo tauri android build`

---

## Нативный OAuth (Google/YouTube логин)

Реализован через **AppAuth** (нативный PKCE, без веб-redirect):
- Rust-команды: `oauth_sign_in`, `oauth_sign_out`, `oauth_get_session`, `oauth_get_youtube_liked`, `oauth_get_youtube_subscriptions`
- В dev-режиме (без AppAuth-плагина) — fallback на симуляцию
- Для реального OAuth нужен Google Client ID (настроенный для Android, не Web)

**Настройка:**
1. Google Cloud Console → создайте OAuth Client ID типа **Android** (не Web!)
2. Package name: `com.lookon.app`
3. SHA-1 fingerprint: получите через `keytool -list -v -keystore ~/.android/debug.keystore`
4. Добавьте Client ID в `src-tauri/src/auth.rs`

---

## Архитектура

```
┌──────────────────────────────────────────────────┐
│  Look On (Android APK)                           │
│                                                  │
│  ┌─────────────┐  invoke()  ┌─────────────────┐ │
│  │ React (Vite)│ ─────────► │ Rust backend    │ │
│  │             │ ◄──────────│ (src-tauri/)    │ │
│  │ • Home grid │   JSON     │                 │ │
│  │ • Watch view│            │ • Invidious API │ │
│  │ • VPN orb   │            │ • SQLite (local)│ │
│  │ • Queue     │            │ • WireGuard VPN │ │
│  │ • Settings  │            │ • AppAuth OAuth │ │
│  │ • i18n RU/EN│            │ • Promoted vids │ │
│  └──────┬──────┘            └─────────────────┘ │
│         │ <video src=…>                         │
│         ▼ (Invidious stream URL — ad-free, 3×)  │
│  ┌─────────────┐                                │
│  │ Native video│                                │
│  └─────────────┘                                │
└──────────────────────────────────────────────────┘
```

**Приложение самодостаточно** — не требует вашего сервера. Invidious API и YouTube Data API вызываются напрямую из Rust. Сервер нужен только для хранения APK-файла (GitHub Releases).

---

## Возможные проблемы

| Проблема | Решение |
|---|---|
| `cargo tauri android init` fails | Установите NDK через Android Studio SDK Manager |
| `rustup target add` fails | Обновите rustup: `rustup update stable` |
| Build error: GTK not found | Это только для desktop-сборки; для Android не нужно |
| Invidious пустая лента | Публичные инстансы могут быть недоступны; используйте свой |
| APK не устанавливается | Включите "Установка из неизвестных источников" на телефоне |
