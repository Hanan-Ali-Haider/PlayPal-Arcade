import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GameWrapper } from './components/GameWrapper';
import { LegalModal, LegalTab } from './components/LegalModal';
import { HubTab, TopBar } from './components/TopBar';
import { getGameById } from './games/registry';
import { ArcadeProvider, useArcade } from './state/arcadeStore';
import { FriendsView } from './views/FriendsView';
import { HistoryView } from './views/HistoryView';
import { RivalryView } from './views/RivalryView';
import { RoomLobbyView } from './views/RoomLobbyView';
import { SettingsView } from './views/SettingsView';

const ArcadeShell: React.FC = () => {
  const { authReady, user, room, exitRoomGameToLobby } = useArcade();
  const [activeTab, setActiveTab] = useState<HubTab>('room');
  const [legalTab, setLegalTab] = useState<LegalTab | null>(null);

  useEffect(() => {
    if (!user) {
      setActiveTab('room');
    }
  }, [user]);

  const activeGame =
    user && room && room.activeGame !== 'lobby' ? getGameById(room.activeGame) : undefined;

  return (
    <div className="min-h-screen flex flex-col bg-dot-yellow text-black overflow-x-hidden">
      <TopBar
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        inGame={Boolean(activeGame)}
        onExitGame={() => exitRoomGameToLobby()}
      />

      <main className="flex-1">
        {!authReady ? (
          <div className="flex min-h-[60vh] items-center justify-center px-4">
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-black bg-white px-8 py-6 neo-shadow-sm text-center">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-black border-t-transparent" />
              <p className="text-xs font-bold text-black">Loading PlayPal Arcade...</p>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {activeGame ? (
              <motion.div
                key={`game-${activeGame.meta.id}-${room?.roomCode}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                <GameWrapper
                  meta={activeGame.meta}
                  onExit={() => exitRoomGameToLobby()}
                >
                  {({ p1: player1, p2: player2, online, onMatchEnd, matchSeed }) => (
                    <activeGame.Component
                      p1={player1}
                      p2={player2}
                      online={online}
                      onMatchEnd={onMatchEnd}
                      matchSeed={matchSeed}
                    />
                  )}
                </GameWrapper>
              </motion.div>
            ) : (
              <motion.div
                key={`tab-${user ? activeTab : 'signin'}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                {(!user || activeTab === 'room') && (
                  <RoomLobbyView
                    onOpenFriends={() => setActiveTab('friends')}
                  />
                )}
                {user && activeTab === 'friends' && (
                  <FriendsView onOpenRoomTab={() => setActiveTab('room')} />
                )}
                {user && activeTab === 'rivalry' && <RivalryView />}
                {user && activeTab === 'history' && <HistoryView />}
                {user && activeTab === 'account' && <SettingsView />}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      {!activeGame && (
        <footer className="border-t-2 border-black bg-[#171e19] py-6 px-4 text-xs font-medium text-[#b7c6c2]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <span>
              PlayPal Arcade <span aria-hidden="true">·</span>{' '}
              <strong className="font-bold text-[#ffe17c]">Made By Hanan Ali Haider</strong>
            </span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setLegalTab('privacy')}
                className="hover:text-[#ffe17c] underline underline-offset-4 cursor-pointer"
              >
                Privacy Policy
              </button>
              <button
                type="button"
                onClick={() => setLegalTab('terms')}
                className="hover:text-[#ffe17c] underline underline-offset-4 cursor-pointer"
              >
                Terms &amp; Conditions
              </button>
            </div>
          </div>
        </footer>
      )}

      {legalTab && (
        <LegalModal initialTab={legalTab} onClose={() => setLegalTab(null)} />
      )}
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <ArcadeProvider>
        <ArcadeShell />
      </ArcadeProvider>
    </ErrorBoundary>
  );
}
