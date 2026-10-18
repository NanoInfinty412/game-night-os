# Playtest guide

Everything you need to play Game Night on a Windows PC, phones and an Android TV.

## 1. Start the game on your PC

1. Get the latest code (PowerShell, in the `game-night-os` folder):

   ```powershell
   git pull
   ```

2. Double-click **`start-game.cmd`** in the `game-night-os` folder. It installs, builds and starts
   the game. The first run takes a minute or two.
3. When Windows asks about the firewall, tick **Private networks** and click **Allow**.
4. The window prints something like:

   ```
   🎉 Game Night is ready!
      📺 TV:     http://192.168.1.218:3000/tv
   ```

   Keep this window open while you play. Close it to stop the game.

Prefer typing? The same in PowerShell:

```powershell
npx.cmd pnpm install
npx.cmd pnpm --filter @gno/web build
npx.cmd pnpm --filter @gno/server start
```

## 2. Show it on the TV

Pick whichever is easiest:

- **Game Night TV app (Android TV / Google TV)**: install it once (section 4), open **Game Night**,
  and choose your PC from the list. It finds the PC by itself.
- **Any browser on the TV**: open the `📺 TV:` address from step 1.
- **Laptop on the TV** (HDMI): open the same address in Chrome and press F11 for full screen.

The TV screen works with the remote: arrows to move, OK to choose, Back to leave.

## 3. Join with phones

Phones must be on the same Wi-Fi as the PC. Scan the QR code on the TV, or open the address shown
on the TV and type the 4-letter room code. The first player to join is the 👑 VIP.

## 4. Install the TV app on Android TV

1. On GitHub, open **Actions → Android TV app**, open the newest green run, and download
   **game-night-tv-apk** at the bottom. Unzip it to get `game-night-tv.apk`.
2. Copy `game-night-tv.apk` into the `downloads` folder inside `game-night-os` on your PC, then start
   the game (step 1). The start window now also shows a `🤖 TV app:` address.
3. On the TV: turn on Developer options (**Settings → Device Preferences → About**, or on Google TV
   **Settings → System → About**, then click **Android TV OS build** seven times). Then allow
   **Unknown sources** for the Downloader app (**Security & restrictions**).
4. Install **Downloader** (by AFTVnews) from the Play Store, open it, and type the `🤖 TV app:`
   address, for example `http://192.168.1.218:3000/game-night-tv.apk`. Choose **Install**.
5. **Game Night** now appears in the TV's apps.

Other ways (USB stick, adb) are in [`apps/android-tv/README.md`](../apps/android-tv/README.md).

## 5. The games

Pick a game on the TV with the remote, or the VIP picks on their phone. Start needs 2+ players.

| Game               | How to play                                                         |
| ------------------ | ------------------------------------------------------------------- |
| 🎉 Party Mix       | 12 rounds of everything below, ending with a tap race               |
| 🧠 Trivia Chaos    | 10 questions; faster correct answers score more                     |
| 🎯 Category Clash  | Take turns picking one of three categories, then everyone answers   |
| ⚡ Lightning Round | True or false? 8 seconds each                                       |
| 🤠 Quick Draw      | Wait for GO, then tap first. Tapping early is a false start         |
| 🚀 Tap Frenzy      | Tap as fast as you can for 8 seconds: rockets, turtles and balloons |
| 🔢 Closest Wins    | Type a number guess; nearest wins, exact gets a bonus               |
| 🤔 Emoji Riddles   | Which word do the emojis spell?                                     |

During a game the TV (Skip, Menu) and the VIP phone can skip a title card or a reveal, or go back
to the menu.

## Troubleshooting

- **Phones can't open the page**: same Wi-Fi as the PC? Allow Node.js through the Windows firewall
  (Windows Security → Firewall → Allow an app → Node.js, tick Private).
- **The TV app finds nothing**: check the start window is still open and the TV is on the same
  network; press **Search again**, or choose **Type the address** and enter the `📺 TV:` address numbers (for example `192.168.1.218:3000`).
- **`npx` is not recognized**: install Node with `winget install OpenJS.NodeJS.LTS`, then open a
  new window.
- **"running scripts is disabled"**: use `npx.cmd` instead of `npx`, or run
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.
