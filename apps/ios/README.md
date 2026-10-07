# iOS / iPadOS – zurückgestellt

Produktentscheidung vom 07.10.2026: Keine iOS-App zum Download anbieten oder veröffentlichen. iPhone und iPad verwenden die Online-Kasse im Browser. Die vorbereitete App bleibt für spätere Nachfrage erhalten; automatische iOS-Builds sind abgeschaltet.

SwiftUI/WKWebView-Client für iPhone/iPad ab iOS 16. Die Kasse öffnet `https://bringness.de/pos/` mit dauerhafter WebKit-Anmeldung, nativen Dialogen, Download-Teilen und Verbindungshinweisen.

Auf macOS: `brew install xcodegen`, dann `swift apps/ios/generate-app-icon.swift apps/ios/BringnessPOS/Assets.xcassets/AppIcon.appiconset`, `xcodegen generate --spec apps/ios/project.yml` und `apps/ios/BringnessPOS.xcodeproj` in Xcode öffnen. Für ein Gerät das eigene Apple-Entwicklerteam wählen, Bundle-ID registrieren und eine Signierung einrichten. Der CI-Simulator-Build ist nicht auf einem echten iPhone installierbar.

Vor TestFlight/App Store fehlen noch Apple Developer/App Store Connect, ein signiertes Gerätearchiv sowie Store-Angaben. Die iOS-App verwendet die Online-Kasse; die lokale Offline-Barverkaufskasse ist derzeit Bestandteil des Windows-Clients. Details: `docs/pos-ai-completion.md`.
