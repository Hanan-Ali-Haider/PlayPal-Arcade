/**
 * Security Rules Verification Suite (Dirty Dozen Adversarial Payloads)
 * Maps each attack payload from security_spec.md to expected PERMISSION_DENIED behavior.
 */
export const dirtyDozenSecurityMatrix = [
  { id: 1, description: 'Unauthenticated read/write to /rooms/AB12CD or /friendRequests/u1_u2', expected: 'PERMISSION_DENIED' },
  { id: 2, description: 'Unverified email user creating /users/{uid} or /handles/{handle}', expected: 'PERMISSION_DENIED' },
  { id: 3, description: 'User A reading or writing /users/{userB} or listing /users', expected: 'PERMISSION_DENIED' },
  { id: 4, description: 'Creating /users/{uid} with shadow field isAdmin: true', expected: 'PERMISSION_DENIED' },
  { id: 5, description: 'Listing /handles to scrape usernames', expected: 'PERMISSION_DENIED' },
  { id: 6, description: 'Creating /handles/{handle} pointing uid to another user', expected: 'PERMISSION_DENIED' },
  { id: 7, description: 'Creating /friendRequests/{id} directly as accepted or spoofing fromUid', expected: 'PERMISSION_DENIED' },
  { id: 8, description: 'Sender accepting their own pending friend request', expected: 'PERMISSION_DENIED' },
  { id: 9, description: 'Third-party User C reading or modifying /friendRequests between A and B', expected: 'PERMISSION_DENIED' },
  { id: 10, description: 'Creating /rooms/invalid_lowercase or mutating hostUid/createdAt', expected: 'PERMISSION_DENIED' },
  { id: 11, description: 'Non-member User C listing /rooms or posting to /rooms/AB12CD/messages', expected: 'PERMISSION_DENIED' },
  { id: 12, description: 'Spoofing senderUid, mutating RoomMatch, or spoofing sync updatedAt', expected: 'PERMISSION_DENIED' },
];
