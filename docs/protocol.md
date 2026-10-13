# Game protocol

The server is the only source of truth. Clients send **intents**; the server validates each one
with a Zod schema from `packages/shared`, applies it, and broadcasts **snapshots**. A client never
sends a score, a phase, or another player's id.

Status: milestone 1 defines the phases and the join payload. Socket events are implemented in
milestone 2 and the game events in milestone 3; this file is updated in the same change.

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

## Planned events

Client → server (intents):

| Event         | Payload                                        | Who         | Milestone |
| ------------- | ---------------------------------------------- | ----------- | --------- |
| `room:create` | `{}`                                           | TV          | 2         |
| `room:join`   | `{ roomCode, nickname }` (`joinRequestSchema`) | phone       | 2         |
| `room:resume` | `{ roomCode, token }`                          | TV or phone | 2         |
| `room:leave`  | `{}`                                           | phone       | 2         |
| `game:start`  | `{}`                                           | VIP         | 3         |
| `game:answer` | `{ questionId, choice }`                       | player      | 3         |
| `game:next`   | `{}`                                           | VIP         | 3         |

Server → client:

| Event        | Payload                | Notes                                                                   |
| ------------ | ---------------------- | ----------------------------------------------------------------------- |
| `room:state` | role-specific snapshot | TV gets the public view; each phone also gets its own private data      |
| `error`      | `{ code, message }`    | e.g. `ROOM_NOT_FOUND`, `NICKNAME_TAKEN`, `ROOM_FULL`, `INVALID_PAYLOAD` |

Correct answers never appear in any payload before the `REVEAL` phase.

## Limits

- Room code: 4 letters from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I or O).
- Players: 2 to 8. Nickname: 1 to 16 characters after trimming, unique within a room.
