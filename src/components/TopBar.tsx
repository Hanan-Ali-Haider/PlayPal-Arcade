import React, { useMemo } from 'react';
import { LogIn } from 'lucide-react';
import { useArcade } from '../state/arcadeStore';
import { PlayerProfile } from '../types/arcade';
import { sound } from '../utils/sound';
import { useDeviceMode } from '../utils/useDeviceMode';
import { ArcadeLogo } from './ArcadeLogo';
import { PlayerAvatar } from './PlayerAvatar';

export type HubTab = 'room' | 'friends' | 'rivalry' | 'history' | 'account';

interface TopBarProps {
  activeTab: HubTab;
  onSelectTab: (tab: HubTab) => void;
  inGame: boolean;
  onExitGame: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  inGame,
  onExitGame,
}) => {
  const {
    user,
    account,
    room,
    incomingRequests,
    roomInvites,
    signInWithGoogle,
  } = useArcade();

  const device = useDeviceMode();
  const friendAlertCount = incomingRequests.length + roomInvites.length;

  const myProfilePreview: PlayerProfile = useMemo(
    () => ({
      id: 'p1',
      name: account?.displayName ?? user?.displayName ?? 'Player',
      accentColor: account?.accentColor ?? '#ffe17c',
      secondaryColor: '#171e19',
      emblem: account?.emblem ?? 'arcade',
      photoUrl: account?.photoUrl || user?.photoURL || '',
      winTaunt: account?.winTaunt ?? 'Wins!',
      leadTaunt: 'Takes the lead!',
    }),
    [account, user]
  );

  const navItems: { id: HubTab; label: string; badge?: number }[] = [
    { id: 'room', label: room ? `Room ${room.roomCode}` : 'Rooms' },
    { id: 'friends', label: 'Friends', badge: friendAlertCount },
    { id: 'rivalry', label: 'Scores' },
    { id: 'history', label: 'Matches' },
    { id: 'account', label: 'Settings' },
  ];

  const handleNavClick = (tab: HubTab) => {
    sound.playClick();
    if (inGame) onExitGame();
    onSelectTab(tab);
  };

  return (
    <header className="sticky top-0 z-40 border-b-2 border-black bg-[#ffe17c]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-3 sm:h-20 sm:gap-8 sm:px-6">
        {/* Goofy Mascot Logo + Wordmark */}
        <button
          type="button"
          onClick={() =>
            user ? handleNavClick('room') : window.scrollTo({ top: 0, behavior: 'smooth' })
          }
          className="flex items-center gap-2.5 font-display text-lg font-extrabold tracking-tighter text-black whitespace-nowrap shrink-0 cursor-pointer sm:gap-3 sm:text-xl"
        >
          <ArcadeLogo size="md" />
          <span>PlayPal Arcade</span>
        </button>

        {/* Desktop Nav (Signed In Only) */}
        {user && !device.isMobile && (
          <nav
            aria-label="Primary navigation"
            className="flex items-center gap-6 text-sm font-bold"
          >
            {navItems.map((item) => {
              const isActive = !inGame && activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(e) => {
                    if (inGame) e.preventDefault();
                  }}
                  onClick={() => handleNavClick(item.id)}
                  className={`relative inline-flex items-center gap-1.5 py-1 whitespace-nowrap shrink-0 cursor-pointer transition-opacity ${
                    isActive ? 'text-black' : 'text-black/65 hover:text-black'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md border-2 border-black bg-white px-1 tabular-nums text-[10px] font-extrabold text-black">
                      {item.badge}
                    </span>
                  ) : null}
                  {isActive && (
                    <span
                      className="absolute inset-x-0 -bottom-0.5 h-[2px] bg-black"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </nav>
        )}

        {/* Right Action Button */}
        <div className="flex items-center shrink-0">
          {user ? (
            <button
              type="button"
              onClick={() => handleNavClick('account')}
              title="Open Profile & Settings"
              className={`neo-btn inline-flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer sm:px-3.5 ${
                !inGame && activeTab === 'account'
                  ? 'bg-white text-black'
                  : 'bg-black text-white'
              }`}
            >
              <PlayerAvatar profile={myProfilePreview} size="xs" />
              <span className="max-w-[96px] truncate sm:max-w-[130px]">
                {account?.displayName ?? user.displayName ?? 'Player'}
              </span>
              {account?.username && (
                <span
                  className={`hidden sm:inline ${
                    !inGame && activeTab === 'account' ? 'text-black/70' : 'text-[#ffe17c]'
                  }`}
                >
                  @{account.username}
                </span>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                signInWithGoogle();
              }}
              className="neo-btn inline-flex items-center gap-2 bg-black px-4 py-2 text-xs font-bold text-white whitespace-nowrap shrink-0 cursor-pointer sm:px-5 sm:py-2.5"
            >
              <LogIn className="h-3.5 w-3.5 text-[#ffe17c]" />
              Sign In with Google
            </button>
          )}
        </div>
      </div>

      {/* Mobile Nav when signed in */}
      {user && device.isMobile && (
        <nav
          aria-label="Mobile navigation"
          className="flex items-center justify-between gap-1 overflow-x-auto border-t-2 border-black bg-white px-2 py-1.5 text-[11px] font-bold"
        >
          {navItems.map((item) => {
            const isActive = !inGame && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-lg whitespace-nowrap shrink-0 ${
                  isActive ? 'bg-[#ffe17c] border-2 border-black text-black' : 'text-black/70'
                }`}
              >
                <span>{item.label}</span>
                {item.badge && item.badge > 0 ? (
                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded border border-black bg-black px-1 tabular-nums text-[9px] font-extrabold text-[#ffe17c]">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      )}
    </header>
  );
};
