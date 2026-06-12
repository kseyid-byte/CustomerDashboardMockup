# Changelog

## 2026-06-12

### Added
- Animated typing indicator (three moving dots) for the Customer Cockpit dashboard chatbot while the bot response is in "typing" state.

### Changed
- Replaced static "typing..." text with animated dot loader in the dashboard chat widget UI.
- Fixed typing animation rendering so the dots display and animate correctly inside the chat bubble.
- Fixed dashboard chat submission so user messages render immediately and input clears after sending.

## 2026-06-04

### Changed
- Renamed "Customer Dashboard" to "Customer Cockpit" across the Lynx platform demo branch (UI header, app menu, title, README).

## 2026-06-01

### Changed
- Replaced the Customer filter icon from ◉ to 👤 in the top filter bar for clearer meaning.

## 2026-05-29
### Fixed
- Reverted hover expansion and scroll hint behavior added to dashboard tables (table-wrap and mini-table-wrap).
- Reverted scenario table hover overlay expansion on the prep page.

## 2026-05-28
- Added hover overlay expansion for the scenario table in the pre-meeting prep account overview matrix so large tables can be viewed without resizing the layout. Requested by Shantanu.
- Added hover expansion behavior and horizontal scroll hint for all scrollable tables (`table-wrap`, `mini-table-wrap`) to improve readability of wide matrices. Requested by Shantanu.
- Added Shantanu's May 28 changes to the dashboard's Changes page, and made it auto-fetch future entries from CHANGELOG.md.

## 2026-05-27
- Fixed mobile layout for pre-meeting prep product trend panels so table contents fit inside the card. Requested by Kerem Seyid.
- Added mobile-friendly layout rules so dashboard pages stack cleanly on phone-width screens while preserving the desktop mockup. Requested by Kerem Seyid.

## 2026-05-26
- Added top deployment delay banner to inform users that changes may take a few minutes to show up.
- Minimal user messaging policy and always share the dashboard link in the output.
- Changed gross-to-net waterfall graph bar colors in Accounts Overview: gross now yellow (#ffd600), net/deduction bars now black (#202124). Requested by Kerem S (voice, Telegram).
- Requested by Kerem S.
