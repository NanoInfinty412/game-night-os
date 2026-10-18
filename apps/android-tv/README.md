# Game Night for Android TV

A tiny Android TV app that finds the computer running Game Night OS on your home network and
shows its TV screen (`http://<computer-ip>:<port>/tv`) full screen. Everything works with the
TV remote: arrows, OK and Back.

## Get the APK

Every push that touches `apps/android-tv/` runs the **Android TV app** GitHub Actions workflow.
Open the run and download the `game-night-tv-apk` artifact; inside the zip is `game-night-tv.apk`
(a debug build, fine for sideloading at home).

To build it yourself (needs the Android SDK, e.g. from Android Studio):

```bash
cd apps/android-tv
./gradlew assembleDebug   # -> app/build/outputs/apk/debug/app-debug.apk
```

## Install it on the TV

First allow installs from outside the Play Store:

1. **Settings → Device Preferences → About** (Google TV: **Settings → System → About**), then
   click **Android TV OS build** seven times until it says you are a developer.
2. **Settings → Device Preferences → Security & restrictions → Unknown sources** (Google TV:
   **Settings → Apps → Security & restrictions → Unknown sources**) and switch it on for the
   app you will install with (Downloader, your file manager, ...).

Then pick one way to install:

- **Downloader app** (easiest): install "Downloader" by AFTVnews from the Play Store, give it
  permission to install unknown apps, and type a direct link to the APK. A GitHub artifact link
  needs a login, so put `game-night-tv.apk` somewhere with a plain URL first, for example serve
  the folder from your PC with `npx serve` and type `http://<PC-IP>:3000/game-night-tv.apk`.
- **USB stick**: copy `game-night-tv.apk` to a USB stick, plug it into the TV, and open it with a
  file manager app (e.g. "File Commander" or "X-plore"), then choose Install.
- **adb over the network**: in **Developer options** turn on **Network debugging** /
  **USB debugging**, find the TV's IP in its network settings, then on your PC:

  ```bash
  adb connect <TV-IP>:5555   # accept the prompt on the TV
  adb install -r game-night-tv.apk
  ```

  (Android 11+ TVs with **Wireless debugging** show a pairing code: `adb pair <TV-IP>:<port>` first.)

"Game Night" then shows up in the TV's app row (with its banner) and in the regular app list.

## How it finds your computer

1. Start the game on your PC: `pnpm dev` (port 5173) or `pnpm build && pnpm start` (port 3000).
   The PC and the TV must be on the same network.
2. Open **Game Night** on the TV. It reads the TV's own IPv4 address (Wi-Fi or Ethernet), then
   asks every address in that `/24` (for example `192.168.1.1` to `192.168.1.254`) on ports 5173
   and 3000 for `GET /health`, using 32 parallel checks with short timeouts. Anything that
   answers `{"ok":true}` appears as a big button such as `192.168.1.218:5173`. This takes a few
   seconds.
3. Pick it and the game opens. The address is remembered, so next time the app jumps straight
   in if that computer still answers.

If nothing is found, choose **Type the address** and enter the IP shown by your PC with the
on-screen keypad (or the remote's number keys). With no `:port` typed, 5173 is used.

Windows tip: the first time Node runs, Windows Firewall asks whether to allow it. Allow it on
**Private networks**, otherwise the TV cannot reach the PC.

## Remote controls

- **Arrows / OK**: passed straight to the game page (OK arrives as Enter).
- **Back** during a game: "Leave the game?" with **Keep playing**, **Change computer** or **Exit**.
- If the page cannot load you get **Try again** and **Find computer** instead of a blank screen.

## Notes

- Plain Java, `android.app.Activity` and `android.webkit.WebView` only; no androidx or other
  libraries. minSdk 21, target/compile SDK 35, Android Gradle Plugin 8.7.
- Cleartext HTTP is allowed (`res/xml/network_security_config.xml`) because the game is served
  over plain HTTP on the LAN by IP address.
