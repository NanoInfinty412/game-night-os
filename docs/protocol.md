# Game protocol

The server is the only source of truth. Clients send **intents**; the server validates each one
with a Zod schema from `packages/shared`, applies it, and broadcasts **snapshots**. A client never
sends a score, a phase, or another player's id.

Status: room membership (milestone 2) and the Party Pack of eight games are implemented. Game rules
are pure functions in `packages/shared/src/game/` (`engine.ts` plays rounds, `catalog.ts` turns a
game choice into a playlist of rounds, `view.ts` builds what screens may see).
`apps/server/src/rooms/roomManager.ts` applies them to rooms and
`apps/server/src/socket/roomSockets.ts` wires sockets and timers. `PAUSED` is reserved and not
used yet: the game keeps running if the TV drops off.

## Roles

| Role         | Client                   | Identifies itself with                                |
| ------------ | ------------------------ | ----------------------------------------------------- |
| Host display | `/tv`                    | `hostToken` issued when it creates the room           |
| Player       | `/play`                  | `sessionToken` issued on join, kept in `localStorage` |
| VIP          | the first player to join | same as player; the server tracks who is VIP          |

The TV and the VIP are both **leaders**: either can pick the game, start, skip ahead and quit.

## Phases (`Phase` in `packages/shared/src/phases.ts`)

```
LOBBY ──start (leader, ≥2 connected players)──► INTRO
INTRO ──intro timer or leader "next"──► PLAY                 (title card for the round)
PLAY ──everyone done, or deadline──► REVEAL                  (tap races always run to the deadline)
REVEAL ──reveal timer or leader "next"──► INTRO             (more rounds left)
REVEAL ──reveal timer or leader "next"──► FINAL             (last round)
FINAL ──leader "next"──► LOBBY
INTRO / PLAY / REVEAL / FINAL ──leader "quit"──► LOBBY
```

The room's `phase` mirrors the running game's phase. Every other transition is rejected without
changing state.

## Events

Every client request carries a Socket.IO acknowledgement and gets exactly one reply:
`{ ok: true, data }` or `{ ok: false, error: { code, message } }`. Requests without an
acknowledgement are ignored. `message` is friendly text safe to show on screen.

Client → server (intents):

| Event           | Payload                                        | Reply data                      | Who                                   | Milestone |
| --------------- | ---------------------------------------------- | ------------------------------- | ------------------------------------- | --------- |
| `host:create`   | none                                           | `{ roomCode, hostToken }`       | TV                                    | 2         |
| `host:resume`   | `{ roomCode, token }` (`resumeRequestSchema`)  | `{ roomCode, hostToken }`       | TV after refresh                      | 2         |
| `player:join`   | `{ roomCode, nickname }` (`joinRequestSchema`) | `{ roomCode, playerId, token }` | phone                                 | 2         |
| `player:resume` | `{ roomCode, token }` (`resumeRequestSchema`)  | `{ roomCode, playerId, token }` | phone after refresh/reconnect         | 2         |
| `player:leave`  | none                                           | `null`                          | phone                                 | 2         |
| `game:select`   | `{ gameId }` (`selectGameSchema`)              | `null`                          | leader, in `LOBBY`                    | P         |
| `game:start`    | none                                           | `null`                          | leader, in `LOBBY`                    | 3         |
| `game:action`   | `PlayerAction` (`playerActionSchema`)          | `null`                          | player, in `PLAY`                     | P         |
| `game:next`     | none                                           | `null`                          | leader, in `INTRO`, `REVEAL`, `FINAL` | 3         |
| `game:quit`     | none                                           | `null`                          | leader, during a game                 | P         |

P = Party Pack. `PlayerAction` is one of:

| `type`   | Fields                     | Round                                                      |
| -------- | -------------------------- | ---------------------------------------------------------- |
| `answer` | `round`, `choice` (0–3)    | question (trivia, true/false, emoji); first answer counts  |
| `pick`   | `round`, `option` (0–9)    | Category Clash, chooser only, while `picking`              |
| `guess`  | `round`, `value` (integer) | number; must be within the question's `min`–`max`          |
| `tap`    | `round`                    | reaction (one tap, before GO is a false start) or tap race |

`round` is the 0-based round index from the snapshot, so a late tap can't count for the next
round. In a tap race, taps less than 50 ms after that player's previous tap are rejected
(`TOO_FAST`); tap-race snapshots are throttled to one every 120 ms. `game:next` skips the rest of
an intro or reveal, or from `FINAL` returns everyone to the lobby for a rematch (which prefers
questions not asked yet in that room).

Server → client:

| Event         | Payload                                                                       | Notes                                                                                               |
| ------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `room:state`  | `RoomSnapshot` `{ code, phase, players, hostConnected, selectedGame, game? }` | Sent to the whole room after every change, including before the reply to the request that caused it |
| `room:closed` | none                                                                          | The room was removed; clients forget their stored session                                           |

Error codes: `INVALID_PAYLOAD`, `ROOM_NOT_FOUND`, `ROOM_FULL` (also: game already started),
`NICKNAME_TAKEN`, `SESSION_NOT_FOUND`, `NOT_IN_ROOM`, `NOT_VIP`, `NOT_ENOUGH_PLAYERS`, `WRONG_PHASE`,
`ALREADY_ANSWERED`, `TOO_LATE`, `NOT_YOUR_PICK`, `TOO_FAST`, `INTERNAL_ERROR`.

## Games (`GAMES` in `packages/shared/src/game/catalog.ts`)

| `gameId`         | Rounds                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `party-mix`      | 12 mixed: trivia, true/false, Quick Draw, emoji, closest number, Category Clash, tap races |
| `trivia`         | Trivia Chaos: 10 multiple-choice questions (`QUESTIONS_PER_GAME`)                          |
| `category-clash` | 8 trivia rounds; players take turns choosing one of 3 categories                           |
| `lightning`      | 12 true-or-false statements, 8 s each                                                      |
| `quick-draw`     | 5 reaction rounds: wait for GO at a random moment, then tap first                          |
| `tap-frenzy`     | 3 tap races (rocket, turtle, balloon), 8 s each                                            |
| `closest-wins`   | 6 number questions; the nearest guess wins                                                 |
| `emoji-riddles`  | 8 "which word do these emojis spell?" questions                                            |

Questions come from `content/packs/*.json`: multiple choice (`questionPackSchema`, 2–4 choices)
and number questions (`numberPackSchema`). Ids are unique across all packs.

## Game snapshot (`GameView`)

Present from `INTRO` to `FINAL`:

| Field                  | Meaning                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `gameId`, `phase`      | Which game, and `INTRO`, `PLAY`, `REVEAL` or `FINAL`                    |
| `round`, `totalRounds` | 0-based current round, and how many there are                           |
| `lineup`               | Kind of every round (`question`, `number`, `reaction`, `mash`)          |
| `current`              | `RoundView` for the current round (below)                               |
| `phaseEndsAt`          | Absolute server time (ms) the phase ends; `0` when hidden or open-ended |
| `phaseMs`              | Length of the phase, for countdown rings                                |
| `serverNow`            | Server clock when sent; clients shift deadlines to their own clock      |
| `doneIds`              | Players who have played this round (not what they chose)                |
| `scores`               | Running totals by player id                                             |
| `results`              | `REVEAL` only: `{ [id]: { points, value, falseStart? } }`               |
| `standings`            | `FINAL` only: `[{ playerId, score, place }]`, ties share a place        |

`RoundView` by kind:

- `question`: `style` (`trivia`, `truefalse`, `emoji`), `pickRound`, `picking?`
  (`{ chooserId, categories }` while the category is being chosen), `question?` (from PLAY, without
  the answer), `answerMs`, `answer?` (REVEAL only).
- `number`: `question?` (`{ prompt, unit, min, max, … }` from PLAY), `answer?` and `fact?` (REVEAL only).
- `reaction`: `status` `wait` or `go`. While waiting, `phaseEndsAt` is `0` so the GO moment can't be worked out.
- `mash`: `theme` and live `taps` per player.

## Scoring and timing

- Every round has a title card (`INTRO`, 4 s) and a reveal (7 s). Answer windows: trivia and emoji
  20 s, true/false 8 s, number 25 s, choosing a category 12 s, tap race 8 s. Quick Draw's GO comes
  2.5–6 s after the round opens, then players have 3 s. The server reads `QUESTIONS_PER_GAME`,
  `QUESTION_SECONDS` (trivia and emoji) and `REVEAL_SECONDS` from the environment.
- Questions: a correct answer earns 1000 points at once, sliding linearly to 500 at the deadline.
  Wrong or missing answers earn 0. Each player's first answer counts.
- Ranked rounds (closest guess, fastest reaction, most taps): 1000, 800, 650, 500, 400, 300, 250,
  200 points by place; ties share a place. An exact number guess earns 250 extra. A tap before GO
  is a false start and earns 0, as does not playing.
- A round closes at its deadline, or as soon as every connected player is done (tap races always
  run the full time). If the Category Clash chooser is away or runs out of time, the first category
  is used; a player who leaves hands their future turns to someone else.
- Choices are shuffled per game (True always comes before False).
- Mid-game, a dropped phone keeps its seat and score and can resume; nobody new can join. The 60 s
  lobby grace period starts once the room is back in the lobby. A player who leaves takes their
  score with them.

## Sessions and reconnects

- The TV keeps `{ roomCode, hostToken }` in `sessionStorage` (per tab) and resumes on refresh.
- A phone keeps `{ roomCode, playerId, token }` in `localStorage` and resumes on refresh, reconnect,
  or reopening the link. Opening a QR link for a different room starts a fresh join.
- Only the newest socket speaks for a seat; an older tab is silently detached.
- A disconnected player keeps their seat (shown as reconnecting) for 60 s in the lobby, then is
  removed. During a game they keep it until the room is back in the lobby.
- If the VIP leaves, the earliest remaining joiner becomes VIP. Seats are reused lowest-first.
- A room with no connected TV and no connected phones is deleted after 30 minutes of inactivity.
  A lobby with its TV still connected is never deleted.

Correct answers never appear in any payload before the `REVEAL` phase.

## Limits

- Room code: 4 letters from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I or O).
- Players: 2 to 8. Nickname: 1 to 16 characters after trimming, unique within a room (ignoring case).
- Room codes never spell a word from the blocklist in `apps/server/src/rooms/roomCode.ts`.
