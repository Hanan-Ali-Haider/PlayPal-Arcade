# Security Specification — PlayPal Online Arcade

## 1. Data Invariants
1. A private `UserProfile` at `/users/{userId}` can only be read, created, or updated by `request.auth.uid == userId` with a verified email.
2. Public handle lookup docs at `/handles/{handle}` expose only non-PII display metadata (`handle`, `uid`, `displayName`, `accentColor`, `emblem`) for exact single-doc `get` lookups; `list` is disabled to prevent user directory scraping.
3. `FriendRelation` documents at `/friendRequests/{reqId}` are readable and listable only when `request.auth.uid` equals `fromUid` or `toUid`, require `toUid` to exist in `/users`, and split status transitions (`pending` -> `accepted`/`declined`) from room invites (`inviteRoomCode`).
4. An `ArcadeRoom` at `/rooms/{roomCode}` requires a 6-character uppercase alphanumeric `roomCode`, an immutable `hostUid` matching `request.auth.uid` on creation, and server timestamps (`request.time`).
5. Only `hostUid` or `guestUid` can list their own rooms, read subcollections (`messages`, `matches`, `sync`), send chat messages, record matches, or push game sync updates.
6. `RoomMessage` and `RoomMatch` documents are immutable after creation and enforce `senderUid == request.auth.uid` / `recordedByUid == request.auth.uid`.

## 2. Dirty Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read/write to `/rooms/AB12CD` or `/friendRequests/u1_u2`.
2. Unverified email user creating `/users/{uid}` or `/handles/{handle}`.
3. User A reading or writing `/users/{userB}` or listing `/users`.
4. Creating `/users/{uid}` with a mismatched `uid` field or shadow field `isAdmin: true`.
5. Listing `/handles` to scrape all player usernames.
6. Creating `/handles/bob` pointing `uid` to someone else's account.
7. Creating `/friendRequests/{id}` with `status: 'accepted'` directly or spoofing `fromUid != request.auth.uid`.
8. User A accepting their own outgoing friend request (must be `toUid == request.auth.uid`).
9. User C reading, listing, or inviting on a `/friendRequests/{id}` doc between User A and User B.
10. Creating `/rooms/invalid_lowercase` or mutating immutable `hostUid` / `createdAt`.
11. Non-member User C listing `/rooms` or posting to `/rooms/AB12CD/messages/{id}`.
12. Member spoofing `senderUid` in `RoomMessage`, mutating a `RoomMatch`, or writing `/rooms/AB12CD/sync/{docId}` with a client-spoofed `updatedAt`.
