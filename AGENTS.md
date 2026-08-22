# Repository Guidelines

## Project Structure & Module Organization

Legado contains an Android app and two Vue front ends. Android/Kotlin code is in `app/src/main/java/io/legado/app`; resources are under `app/src/main/res` and `app/src/main/assets`. Tests are in `app/src/test` and `app/src/androidTest`. Shared libraries are `modules/book` and `modules/rhino`; the server-backed UI is in `modules/web`. The offline reader in `modules/web-reader` is the project's current development focus; prioritize it in cross-module work.

## Build, Test, and Development Commands

- `./gradlew :app:assembleAppDebug` builds a debug APK with JDK 17.
- `./gradlew :app:installAppDebug` installs it on a connected emulator or device.
- `./gradlew :app:testAppDebugUnitTest` runs local Kotlin/JUnit tests.
- `./gradlew :app:connectedAppDebugAndroidTest` runs instrumentation tests on a connected device.
- `cd modules/web && pnpm install --frozen-lockfile && pnpm build` runs Node tests, builds, type-checks, and synchronizes Web assets.
- `cd modules/web && pnpm dev` starts the Web management UI; use `pnpm lint:fix` and `pnpm format` before submitting UI changes.
- `cd modules/web-reader && pnpm install --frozen-lockfile && pnpm dev` starts the offline reader; `pnpm build` type-checks and creates its production bundle.

## Coding Style & Naming Conventions

Follow surrounding Kotlin style: four-space indentation, `PascalCase` types, `camelCase` members, and `snake_case` Android resources. Prefer small extension functions and existing coroutine patterns. In `modules/web`, EditorConfig requires two spaces; Prettier uses single quotes and no semicolons, and ESLint checks TypeScript/Vue files. Use Vue 3 Composition API and `<script setup>` where established.

## Testing Guidelines

Name Kotlin tests `*Test.kt` and align their package with production code. Add host-side tests for pure logic and AndroidJUnit4 tests when framework behavior is required. Web tests live in `modules/web/tests` and use Node's test runner. No coverage threshold is stated; cover relevant regressions and boundaries.

## Commit & Pull Request Guidelines

Recent commits use short, imperative Chinese summaries, often ending with an issue reference such as `修复书签回弹闪烁 (#930)`. Scoped Conventional Commit style is also used for module features, for example `feat(web-reader): ...`. PRs should explain the problem, root cause, and solution; link the issue; select change/platform/module/impact categories; and list exact verification commands and results. Include screenshots or recordings for visible Android or Web changes, and avoid unrelated edits.

## Security & Configuration

Never commit signing keys, passwords, tokens, private source data, or local SDK paths. Repository mirror changes in `settings.gradle` are local workarounds and should not be committed.

## Agent-Specific Instructions

Agents must communicate with users in Chinese, including progress updates, explanations, questions, and final responses.
