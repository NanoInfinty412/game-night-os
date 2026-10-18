# Game protocol

The server is the only source of truth. Clients send **intents**; the server validates each one
with a Zod schema from `packages/shared`, applies it, and broadcasts **snapshots**. A client never
sends a score, a phase, or another player's id.

Status: room membership (milestone 2) and Trivia Chaos (milestone 3) are implemented. Rules are
pure functions in `packages/shared/src/trivia/engine.ts`; `apps/server/src/rooms/roomManager.ts`
applies them to rooms and `apps/server/src/socket/roomSockets.ts` wires sockets and timers.
`PAUSED` is reserved and not used yet: the game keeps running if the TV drops off.

## Roles

| Role         | Client                   | Identifies itself with                                |
| ------------ | ------------------------ | ----------------------------------------------------- |
| Host display | `/tv`                    | `hostToken` issued when it creates the room           |
| Player       | `/play`                  | `sessionToken` issued on join, kept in `localStorage` |
| VIP          | the first player to join | same as player; the server tracks who is VIP          |

## Phases (`Phase` in `packages/shared/src/phases.ts`)

```
LOBBY ──start (VIP, ≥2 players)──► QUESTION
QUESTION ──all connected players answered, or deadline──► REVEAL
REVEAL ──timer or VIP "next"──► QUESTION         (more questions left)
REVEAL ──timer or VIP "next"──► FINAL            (last question)
FINAL ──VIP "play again"──► LOBBY
any phase except LOBBY ──TV disconnects──► PAUSED ──TV reconnects──► previous phase, deadlines shifted
```

Every other transition is illegal and is rejected without changing state.

## Events

Every client request carries a Socket.IO acknowledgement and gets exactly one reply:
`{ ok: true, data }` or `{ ok: false, error: { code, message } }`. Requests without an
acknowledgement are ignored. `message` is friendly text safe to show on screen.

Client → server (intents):

| Event           | Payload                                        | Reply data                      | Who                           | Milestone |
| --------------- | ---------------------------------------------- | ------------------------------- | ----------------------------- | --------- |
| `host:create`   | none                                           | `{ roomCode, hostToken }`       | TV                            | 2         |
| `host:resume`   | `{ roomCode, token }` (`resumeRequestSchema`)  | `{ roomCode, hostToken }`       | TV after refresh              | 2         |
| `player:join`   | `{ roomCode, nickname }` (`joinRequestSchema`) | `{ roomCode, playerId, token }` | phone                         | 2         |
| `player:resume` | `{ roomCode, token }` (`resumeRequestSchema`)  | `{ roomCode, playerId, token }` | phone after refresh/reconnect | 2         |
| `player:leave`  | none                                           | `null`                          | phone                         | 2         |
| `game:start`    | none                                           | `null`                          | VIP, in `LOBBY`               | 3         |
| `game:answer`   | `{ round, choice }` (`answerRequestSchema`)    | `null`                          | player, in `QUESTION`         | 3         |
| `game:next`     | none                                           | `null`                          | VIP, in `REVEAL` or `FINAL`   | 3         |

`round` is the 0-based question index from the snapshot, so a late tap can't count for the next
question. `choice` is 0 to 3. `game:next` skips the rest of a reveal, or from `FINAL` returns
everyone to the lobby for a rematch (which picks questions not asked yet in that room).

Server → client:

| Event         | Payload                                                         | Notes                                                                                               |
| ------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `room:state`  | `RoomSnapshot` `{ code, phase, players, hostConnected, game? }` | Sent to the whole room after every change, including before the reply to the request that caused it |
| `room:closed` | none                                                            | The room was removed; clients forget their stored session                                           |

Error codes: `INVALID_PAYLOAD`, `ROOM_NOT_FOUND`, `ROOM_FULL` (also: game already started),
`NICKNAME_TAKEN`, `SESSION_NOT_FOUND`, `NOT_IN_ROOM`, `NOT_VIP`, `NOT_ENOUGH_PLAYERS`, `WRONG_PHASE`,
`ALREADY_ANSWERED`, `TOO_LATE`, `INTERNAL_ERROR`.

## Game snapshot (`GameView`)

Present in `QUESTION`, `REVEAL` and `FINAL`:

| Field                      | Meaning                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `round`, `totalRounds`     | 0-based current question, and how many there are                           |
| `question`                 | `{ id, category, prompt, choices }`: never the answer                      |
| `questionMs`               | Length of the answer window                                                |
| `deadline`, `revealEndsAt` | Absolute server times (ms) when the question closes and the reveal ends    |
| `serverNow`                | Server clock when sent; clients shift deadlines to their own clock         |
| `answeredIds`              | Players who locked in this round (not what they picked)                    |
| `scores`                   | Running totals by player id                                                |
| `reveal`                   | `REVEAL` only: `{ answer, results: { [id]: { choice \| null, points } } }` |
| `standings`                | `FINAL` only: `[{ playerId, score, place }]`, ties share a place           |

## Scoring and timing

- Defaults: 10 questions, 20 s to answer, 7 s reveal. The server reads `QUESTIONS_PER_GAME`,
  `QUESTION_SECONDS` and `REVEAL_SECONDS` from the environment to change them.
- A correct answer earns 1000 points at once, sliding linearly to 500 at the deadline. Wrong or
  missing answers earn 0. Each player's first answer counts; changing it is rejected.
- A question closes at its deadline, or as soon as every connected player has answered.
- Choices are shuffled per game, so the answer position differs every time.
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
