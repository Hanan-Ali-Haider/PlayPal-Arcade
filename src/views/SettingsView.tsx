import React, { useEffect, useRef, useState } from 'react';
import { AtSign, Camera, Check, LogOut, Trash2, User, Volume2 } from 'lucide-react';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { useArcade } from '../state/arcadeStore';
import { AvatarEmblem, PlayerProfile } from '../types/arcade';
import { sound } from '../utils/sound';

const COLOR_PRESETS = [
  { label: 'Arcade Yellow', accent: '#FFE17C', secondary: '#171E19' },
  { label: 'Sage Mist', accent: '#B7C6C2', secondary: '#171E19' },
  { label: 'Charcoal Ink', accent: '#171E19', secondary: '#000000' },
  { label: 'Sky Blue', accent: '#0284C7', secondary: '#0369A1' },
  { label: 'Tangerine', accent: '#EA580C', secondary: '#C2410C' },
  { label: 'Pure White', accent: '#FFFFFF', secondary: '#171E19' },
];

const EMBLEMS: AvatarEmblem[] = ['arcade', 'rocket', 'crown', 'shield', 'star', 'swords'];

function compressImageToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const size = 144;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Could not initialize image canvas.'));
          return;
        }
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

        let dataUrl = canvas.toDataURL('image/webp', 0.82);
        if (dataUrl.length > 60000 || !dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        }
        if (dataUrl.length > 60000) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        }
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unsupported or unreadable image file.'));
    };
    img.src = objectUrl;
  });
}

export const SettingsView: React.FC = () => {
  const { user, account, updateAccount, audio, setAudio, logout } = useArcade();

  const [displayName, setDisplayName] = useState(account?.displayName ?? '');
  const [username, setUsername] = useState(account?.username ?? '');
  const [accentColor, setAccentColor] = useState(account?.accentColor ?? '#FFE17C');
  const [emblem, setEmblem] = useState<AvatarEmblem>(account?.emblem ?? 'arcade');
  const [photoUrl, setPhotoUrl] = useState(account?.photoUrl ?? '');
  const [winTaunt, setWinTaunt] = useState(account?.winTaunt ?? '');
  const [saveStatus, setSaveStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!account) return;
    setDisplayName(account.displayName);
    setUsername(account.username);
    setAccentColor(account.accentColor);
    setEmblem(account.emblem);
    setPhotoUrl(account.photoUrl ?? '');
    setWinTaunt(account.winTaunt);
  }, [account]);

  const previewProfile: PlayerProfile = {
    id: 'p1',
    name: displayName || 'Player',
    accentColor,
    secondaryColor:
      COLOR_PRESETS.find((c) => c.accent === accentColor)?.secondary ?? '#171E19',
    emblem,
    photoUrl,
    winTaunt: winTaunt || 'Wins the match!',
    leadTaunt: 'Takes the lead!',
  };

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSaveStatus({ ok: false, msg: 'Please select an image file (PNG, JPG, WebP).' });
      return;
    }
    try {
      const compressed = await compressImageToAvatarDataUrl(file);
      if (compressed.length > 64000) {
        setSaveStatus({ ok: false, msg: 'Image is still too large after compression. Try another photo.' });
        return;
      }
      sound.playSwap();
      setPhotoUrl(compressed);
      setSaveStatus({ ok: true, msg: 'Photo ready! Click Save Profile to update everywhere.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not load photo.';
      setSaveStatus({ ok: false, msg });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account || saving) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await updateAccount({
        displayName: displayName.trim().slice(0, 40) || account.displayName,
        username: username.trim().toLowerCase(),
        accentColor,
        emblem,
        photoUrl,
        winTaunt: winTaunt.trim().slice(0, 60) || account.winTaunt,
      });
      if (res.ok) {
        sound.playPowerUp();
        setSaveStatus({ ok: true, msg: 'Profile picture, name & @username saved!' });
        setTimeout(() => setSaveStatus(null), 2600);
      } else {
        sound.playFoul();
        setSaveStatus({ ok: false, msg: res.error ?? 'Could not save profile.' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="inline-block rounded-lg border-2 border-black bg-white px-3 py-1 text-xs font-bold text-black neo-shadow-sm">
            PLAYER PROFILE
          </span>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tighter text-black">
            Account &amp; Settings
          </h1>
          <p className="mt-1 text-sm font-medium text-black/75">
            Customize your profile picture, display name, unique @username handle, badge, and sound.
          </p>
        </div>

        <button
          type="button"
          onClick={logout}
          className="neo-btn inline-flex items-center gap-2 bg-white px-4 py-2 text-xs font-bold text-black cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <form
          onSubmit={handleSave}
          className="space-y-5 rounded-2xl border-2 border-black bg-white p-6 neo-shadow-lg"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-black pb-4">
            <div className="flex items-center gap-3.5">
              <PlayerAvatar profile={previewProfile} size="lg" />
              <div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-black" />
                  <h2 className="font-display text-xl font-extrabold text-black">
                    Profile Picture &amp; Identity
                  </h2>
                </div>
                <p className="text-xs font-medium text-black/70">
                  Friends see your photo, name, and @username in rooms and friend lists.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  fileInputRef.current?.click();
                }}
                className="neo-btn inline-flex items-center gap-1.5 bg-[#ffe17c] px-3 py-1.5 text-xs font-bold text-black cursor-pointer"
              >
                <Camera className="h-3.5 w-3.5" />
                Upload Photo
              </button>
              {user?.photoURL && photoUrl !== user.photoURL && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setPhotoUrl((user.photoURL ?? '').slice(0, 2000));
                  }}
                  className="neo-btn bg-white px-3 py-1.5 text-xs font-bold text-black cursor-pointer"
                >
                  Use Google Photo
                </button>
              )}
              {photoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setPhotoUrl('');
                  }}
                  title="Remove custom profile picture and use emblem"
                  className="neo-btn inline-flex items-center gap-1 bg-[#f4f4f5] px-2.5 py-1.5 text-xs font-bold text-black cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="acc-username" className="block text-xs font-bold text-black">
                Username Handle (for Friend Requests)
              </label>
              <div className="relative mt-1.5">
                <AtSign className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-black/50" />
                <input
                  id="acc-username"
                  type="text"
                  value={username}
                  maxLength={24}
                  onChange={(e) =>
                    setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                  }
                  placeholder="your_username"
                  className="w-full rounded-xl border-2 border-black bg-[#f4f4f5] py-2.5 pl-8 pr-3.5 font-mono-num text-xs font-bold text-black focus:bg-white focus:outline-none"
                />
              </div>
              <p className="mt-1 text-[11px] font-medium text-black/60">
                3–24 chars: lowercase letters, numbers, underscores.
              </p>
            </div>

            <div>
              <label htmlFor="acc-name" className="block text-xs font-bold text-black">
                Display Name
              </label>
              <input
                id="acc-name"
                type="text"
                value={displayName}
                maxLength={40}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border-2 border-black bg-[#f4f4f5] px-3.5 py-2.5 text-xs font-bold text-black focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="acc-taunt" className="block text-xs font-bold text-black">
              Victory Message
            </label>
            <input
              id="acc-taunt"
              type="text"
              value={winTaunt}
              maxLength={50}
              onChange={(e) => setWinTaunt(e.target.value)}
              className="mt-1.5 w-full rounded-xl border-2 border-black bg-[#f4f4f5] px-3.5 py-2.5 text-xs font-bold text-black focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <p className="text-xs font-bold text-black">Badge Color</p>
            <div className="mt-2 flex flex-wrap gap-2.5">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setAccentColor(c.accent);
                  }}
                  title={c.label}
                  className={`h-9 w-9 rounded-lg border-2 border-black transition-transform cursor-pointer ${
                    accentColor === c.accent ? 'scale-110 neo-shadow-sm' : 'opacity-85 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.accent }}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-black">
              Fallback Emblem {photoUrl ? '(used when photo is removed)' : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {EMBLEMS.map((emb) => (
                <button
                  key={emb}
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setEmblem(emb);
                  }}
                  className={`neo-btn px-3 py-1.5 text-xs font-bold capitalize cursor-pointer ${
                    emblem === emb ? 'bg-black text-[#ffe17c]' : 'bg-white text-black'
                  }`}
                >
                  {emb}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            {saveStatus ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg border-2 border-black px-3 py-1 text-xs font-bold text-black ${
                  saveStatus.ok ? 'bg-[#b7c6c2]' : 'bg-[#ffe17c]'
                }`}
              >
                {saveStatus.ok && <Check className="h-4 w-4" />}
                {saveStatus.msg}
              </span>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={saving}
              className="neo-btn bg-[#ffe17c] px-5 py-2.5 text-xs font-bold text-black disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>

        {/* Sound Settings */}
        <section className="h-fit space-y-5 rounded-2xl border-2 border-black bg-[#b7c6c2] p-6 neo-shadow-lg">
          <div className="flex items-center gap-2 border-b-2 border-black pb-4">
            <Volume2 className="h-4 w-4 text-black" />
            <h2 className="font-display text-xl font-extrabold text-black">Sound Effects</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-bold text-black">
              <span>Master Volume</span>
              <span className="tabular-nums font-extrabold">
                {audio.muted ? 'Muted' : `${Math.round(audio.volume * 100)}%`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audio.volume}
              onChange={(e) => setAudio({ volume: Number(e.target.value), muted: false })}
              className="w-full accent-black cursor-pointer"
            />

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setAudio({ muted: !audio.muted })}
                className="neo-btn bg-white px-4 py-2 text-xs font-bold text-black cursor-pointer"
              >
                {audio.muted ? 'Unmute Audio' : 'Mute Audio'}
              </button>
              <button
                type="button"
                onClick={() => sound.playVictory()}
                className="neo-btn bg-[#ffe17c] px-4 py-2 text-xs font-bold text-black cursor-pointer"
              >
                Test Chime
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
