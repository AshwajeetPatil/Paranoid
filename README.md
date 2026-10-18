# 🛡️ Paranoid — Offline-First Private Receipt & Document Vault

[![Download Android APK](https://img.shields.io/badge/Download-Android_APK-10b981?style=for-the-badge&logo=android)](https://github.com/AshwajeetPatil/Paranoid/releases/latest)

Paranoid is a privacy-first, 100% on-device mobile vault built with **React Native (Expo)** and **SQLite**. It eliminates cloud dependency and subscription fees, enabling lightning-fast capture while keeping sensitive financial documents locked behind native biometrics and device credentials.

---

## ✨ Key Features
- **Zero-Lock Blind Camera:** Bypasses biometric prompts on launch to open instantly into the camera viewfinder. Snap receipts or documents with 1-tap blur inspection.
- **Hurry Mode & Review Queue:** Quickly snap a receipt at checkout and let Paranoid queue it under *"Needs Review"* for categorization later.
- **Auto-Remainder Splitter:** Split a single multi-item bill across categories using an inline calculator while Paranoid handles the math.
- **0-KB UPI & Cash Logging:** Record everyday expenses without cluttering internal storage with unnecessary photos.
- **Startup Janitor & Warranty Pinning:** Automatically purges expired items on launch while protecting `📌 Pinned` warranty bills permanently.
- **Biometric & PIN Gate:** Secures monthly spend dashboards and stored documents with native Fingerprint, FaceID, or Device PIN (`expo-local-authentication`).
- **Portable 1-Tap Backup:** Bundles SQLite data and local images into an exportable JSON payload.

---

## 📲 Installation
1. Go to the [Releases](https://github.com/AshwajeetPatil/Paranoid/releases/latest) section.
2. Download the `.apk` file onto your Android device.
3. Tap the file to install (allow installation from unknown sources if prompted by your browser).

---

## 🛠️ Tech Stack
- **Framework:** React Native (Expo SDK 57)
- **Local Storage:** `expo-sqlite` & `expo-file-system`
- **Security:** `expo-local-authentication`
