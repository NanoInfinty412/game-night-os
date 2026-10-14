# Game protocol

The server is the only source of truth. Clients send **intents**; the server validates each one
with a Zod schema from `packages/shared`, applies it, and broadcasts **snapshots**. A client never
sends a score, a phase, or another player's id.

Status: room membership (milestone 2) is implemented in `apps/server/src/socket/roomSockets.ts`
and `apps/server/src/rooms/roomManager.ts`. Game events arrive in milestone 3; this file is updated
in the same change.

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
| `game:start`    | `{}`                                           |                                 | VIP                           | 3         |
| `game:answer`   | `{ questionId, choice }`                       |                                 | player                        | 3         |
| `game:next`     | `{}`                                           |                                 | VIP                           | 3         |

Server → client:

| Event         | Payload                                                  | Notes                                                                                               |
| ------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `room:state`  | `RoomSnapshot` `{ code, phase, players, hostConnected }` | Sent to the whole room after every change, including before the reply to the request that caused it |
| `room:closed` | none                                                     | The room was removed; clients forget their stored session                                           |

Error codes: `INVALID_PAYLOAD`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `NICKNAME_TAKEN`, `SESSION_NOT_FOUND`,
`NOT_IN_ROOM`, `INTERNAL_ERROR`.

## Sessions and reconnects

- The TV keeps `{ roomCode, hostToken }` in `sessionStorage` (per tab) and resumes on refresh.
- A phone keeps `{ roomCode, playerId, token }` in `localStorage` and resumes on refresh, reconnect,
  or reopening the link. Opening a QR link for a different room starts a fresh join.
- Only the newest socket speaks for a seat; an older tab is silently detached.
- A disconnected player keeps their seat (shown as reconnecting) for 60 s in the lobby, then is removed.
- If the VIP leaves, the earliest remaining joiner becomes VIP. Seats are reused lowest-first.
- A room with no connected TV and no connected phones is deleted after 30 minutes of inactivity.
  A lobby with its TV still connected is never deleted.

Correct answers never appear in any payload before the `REVEAL` phase.

## Limits

- Room code: 4 letters from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I or O).
- Players: 2 to 8. Nickname: 1 to 16 characters after trimming, unique within a room (ignoring case).
- Room codes never spell a word from the blocklist in `apps/server/src/rooms/roomCode.ts`.
