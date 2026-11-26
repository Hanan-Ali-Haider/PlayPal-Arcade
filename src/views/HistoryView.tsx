import React, { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { GAME_REGISTRY } from '../games/registry';
import { useArcade } from '../state/arcadeStore';
import { GameId } from '../types/arcade';

export const HistoryView: React.FC = () => {
  const { room, matches, p1, p2 } = useArcade();
  const [gameFilter, setGameFilter] = useState<GameId | 'all'>('all');

  const filtered = useMemo(() => {
    if (gameFilter === 'all') return matches;
    return matches.filter((m) => m.gameId === gameFilter);
  }, [matches, gameFilter]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="inline-block rounded-lg border-2 border-black bg-white px-3 py-1 text-xs font-bold text-black neo-shadow-sm">
            MATCH LOG
          </span>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tighter text-black">
            Match History
          </h1>
          <p className="mt-1 text-sm font-medium text-black/75">
            {room
              ? `Recent games finished inside Room ${room.roomCode}.`
              : 'Enter a room to view its recent matches.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setGameFilter('all')}
            className={`neo-btn px-3 py-1.5 text-xs font-bold cursor-pointer ${
              gameFilter === 'all' ? 'bg-black text-white' : 'bg-white text-black'
            }`}
          >
            All Games
          </button>
          {GAME_REGISTRY.map(({ meta }) => (
            <button
              key={meta.id}
              type="button"
              onClick={() => setGameFilter(meta.id)}
              className={`neo-btn px-3 py-1.5 text-xs font-bold cursor-pointer ${
                gameFilter === meta.id ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              {meta.name}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-black bg-white py-16 text-center neo-shadow-lg">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-black bg-[#b7c6c2]">
            <History className="h-7 w-7 text-black" />
          </div>
          <p className="mt-4 font-display text-lg font-extrabold text-black">
            No matches recorded yet
          </p>
          <p className="mt-1 text-xs font-medium text-black/70">
            {room
              ? 'Finish any match in this room and it will appear right here.'
              : 'Join or create a room first to start tracking matches.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border-2 border-black bg-white neo-shadow-lg">
          <div className="divide-y-2 divide-black/15">
            {filtered.map((m) => {
              const winnerName =
                m.winner === 'p1' ? p1.name : m.winner === 'p2' ? p2.name : 'Draw';
              const badgeBg =
                m.winner === 'p1'
                  ? 'bg-[#ffe17c] text-black'
                  : m.winner === 'p2'
                    ? 'bg-[#b7c6c2] text-black'
                    : 'bg-[#f4f4f5] text-black';

              return (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 hover:bg-[#ffe17c]/20"
                >
                  <div>
                    <p className="text-xs font-bold text-black/65">
                      {m.gameName} <span aria-hidden="true">·</span>{' '}
                      {new Date(m.createdAtMs).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      <span aria-hidden="true">·</span>{' '}
                      <span className="tabular-nums">{m.durationSeconds}s</span>
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-black">{m.summary}</p>
                  </div>

                  <div className="flex flex-col items-end gap-1 text-right">
                    <span
                      className={`inline-block rounded-lg border-2 border-black px-2.5 py-0.5 font-display text-xs font-extrabold ${badgeBg}`}
                    >
                      {winnerName}
                    </span>
                    <p className="tabular-nums text-xs font-bold text-black/65">{m.scoreLabel}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
