import React, { useMemo } from 'react';
import { Award, Trophy } from 'lucide-react';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { GAME_REGISTRY } from '../games/registry';
import { useArcade } from '../state/arcadeStore';
import { GameId } from '../types/arcade';

const formatDuration = (sec: number | null) => {
  if (sec === null) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
};

export const RivalryView: React.FC = () => {
  const { room, matches, p1, p2 } = useArcade();

  const statsSummary = useMemo(() => {
    const perGame = new Map<
      GameId,
      { played: number; p1Wins: number; p2Wins: number; draws: number; fastest: number | null }
    >();
    GAME_REGISTRY.forEach(({ meta }) => {
      perGame.set(meta.id, {
        played: 0,
        p1Wins: 0,
        p2Wins: 0,
        draws: 0,
        fastest: null,
      });
    });

    let currentStreakPlayer: 'p1' | 'p2' | null = null;
    let currentStreakCount = 0;

    for (const m of matches) {
      const entry = perGame.get(m.gameId);
      if (entry) {
        entry.played += 1;
        if (m.winner === 'p1') entry.p1Wins += 1;
        else if (m.winner === 'p2') entry.p2Wins += 1;
        else entry.draws += 1;

        if ((m.winner === 'p1' || m.winner === 'p2') && m.durationSeconds > 0) {
          entry.fastest =
            entry.fastest === null ? m.durationSeconds : Math.min(entry.fastest, m.durationSeconds);
        }
      }
    }

    for (const m of matches) {
      if (m.winner !== 'p1' && m.winner !== 'p2') break;
      if (!currentStreakPlayer) {
        currentStreakPlayer = m.winner;
        currentStreakCount = 1;
      } else if (m.winner === currentStreakPlayer) {
        currentStreakCount += 1;
      } else {
        break;
      }
    }

    return { perGame, currentStreakPlayer, currentStreakCount };
  }, [matches]);

  const p1Wins = room?.p1Wins ?? 0;
  const p2Wins = room?.p2Wins ?? 0;
  const draws = room?.draws ?? 0;
  const totalMatches = p1Wins + p2Wins + draws;
  const decisive = p1Wins + p2Wins;
  const p1Pct = decisive > 0 ? Math.round((p1Wins / decisive) * 100) : 50;
  const p2Pct = decisive > 0 ? 100 - p1Pct : 50;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <span className="inline-block rounded-lg border-2 border-black bg-white px-3 py-1 text-xs font-bold text-black neo-shadow-sm">
          HEAD-TO-HEAD LEDGER
        </span>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tighter text-black">
          Room Scoreboard
        </h1>
        <p className="mt-1 text-sm font-medium text-black/75">
          {room
            ? `Head-to-head stats for Room ${room.roomCode} across all 6 arcade games.`
            : 'Enter or create a room to view live head-to-head match stats.'}
        </p>
      </div>

      {/* Overall Win Balance */}
      <section className="rounded-2xl border-2 border-black bg-white p-6 neo-shadow-lg">
        <div className="grid gap-6 md:grid-cols-3 md:items-center">
          <div className="flex items-center gap-3.5 min-w-0">
            <PlayerAvatar profile={p1} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-display text-xl font-extrabold text-black">{p1.name}</p>
              <p className="tabular-nums text-2xl font-extrabold text-black">
                {p1Wins} Wins{' '}
                <span className="text-sm font-bold text-black/60">({p1Pct}%)</span>
              </p>
              <p className="text-xs font-medium text-black/65">Side 1</p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2.5 text-center">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-black">
              <Trophy className="h-3.5 w-3.5" />
              {totalMatches} Matches <span aria-hidden="true">·</span> {draws} Draws
            </span>
            <div className="flex h-5 w-full overflow-hidden rounded-lg border-2 border-black bg-white">
              <div
                className="h-full border-r-2 border-black bg-[#ffe17c] transition-all duration-300"
                style={{ width: `${p1Pct}%` }}
              />
              <div
                className="h-full bg-[#b7c6c2] transition-all duration-300"
                style={{ width: `${p2Pct}%` }}
              />
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-lg border-2 border-black bg-[#171e19] px-3 py-1 text-xs font-bold text-white">
              <Award className="h-3.5 w-3.5 text-[#ffe17c]" />
              Current Streak:{' '}
              <strong className="tabular-nums text-[#ffe17c]">
                {statsSummary.currentStreakPlayer && statsSummary.currentStreakCount > 0
                  ? `${statsSummary.currentStreakPlayer === 'p1' ? p1.name : p2.name} · ${statsSummary.currentStreakCount}`
                  : 'None'}
              </strong>
            </span>
          </div>

          <div className="flex items-center justify-end gap-3.5 text-right min-w-0">
            <div className="min-w-0">
              <p className="truncate font-display text-xl font-extrabold text-black">{p2.name}</p>
              <p className="tabular-nums text-2xl font-extrabold text-black">
                {p2Wins} Wins{' '}
                <span className="text-sm font-bold text-black/60">({p2Pct}%)</span>
              </p>
              <p className="text-xs font-medium text-black/65">Side 2</p>
            </div>
            <PlayerAvatar profile={p2} size="lg" />
          </div>
        </div>
      </section>

      {/* Per-Game Breakdown Table */}
      <section className="overflow-hidden rounded-2xl border-2 border-black bg-white neo-shadow-sm">
        <div className="border-b-2 border-black bg-[#171e19] px-6 py-4">
          <h2 className="font-display text-lg font-extrabold text-white">Per-Game Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-black bg-[#b7c6c2] text-xs font-bold uppercase tracking-wider text-black">
                <th className="px-6 py-3">Game</th>
                <th className="px-4 py-3">Played</th>
                <th className="px-4 py-3">{p1.name} Wins</th>
                <th className="px-4 py-3">{p2.name} Wins</th>
                <th className="px-4 py-3">Draws</th>
                <th className="px-6 py-3 text-right">Fastest Win</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-black/15 tabular-nums text-xs sm:text-sm">
              {GAME_REGISTRY.map(({ meta }) => {
                const s = statsSummary.perGame.get(meta.id)!;
                return (
                  <tr key={meta.id} className="hover:bg-[#ffe17c]/30">
                    <td className="px-6 py-3.5 font-sans font-bold text-black">{meta.name}</td>
                    <td className="px-4 py-3.5 font-medium text-black/75">{s.played}</td>
                    <td className="px-4 py-3.5 font-extrabold text-black">{s.p1Wins}</td>
                    <td className="px-4 py-3.5 font-extrabold text-black">{s.p2Wins}</td>
                    <td className="px-4 py-3.5 font-medium text-black/75">{s.draws}</td>
                    <td className="px-6 py-3.5 text-right font-mono-num font-bold text-black">
                      {formatDuration(s.fastest)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
