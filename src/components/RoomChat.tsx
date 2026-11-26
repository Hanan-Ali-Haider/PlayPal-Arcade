import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MessageCircle, Mic, Pause, Play, Send, Smile, Square, Trash2 } from 'lucide-react';
import { useArcade } from '../state/arcadeStore';
import { sound } from '../utils/sound';

const QUICK_CHATS = ['GG!', 'Nice shot!', 'Watch this!', 'Rematch?', 'Too fast!'];

const CHAT_EMOJIS = [
  '😂', '🤣', '💀', '🤡', '🤪', '😜',
  '🤖', '🏆', '🎉', '🥳', '🤯', '👾',
  '❤️', '💖', '😭', '🥺', '👀', '😎',
  '🙌', '💪', '🥶', '👻', '💩', '🐸',
  '🦖', '🚀', '🏎️', '🏒', '⚽', '🎯',
];

const MAX_VOICE_SECONDS = 20;
const MAX_AUDIO_DATA_CHARS = 175000;

function getGraphemes(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const SegmenterCtor = (Intl as unknown as {
      Segmenter: new (locale: string, opts: { granularity: 'grapheme' }) => {
        segment: (s: string) => Iterable<{ segment: string }>;
      };
    }).Segmenter;
    const seg = new SegmenterCtor('en', { granularity: 'grapheme' });
    return Array.from(seg.segment(clean), (x) => x.segment);
  }
  return Array.from(clean);
}

function isSingleEmoji(text: string): boolean {
  const graphemes = getGraphemes(text);
  if (graphemes.length !== 1) return false;
  return /\p{Extended_Pictographic}/u.test(graphemes[0]);
}

function pickGoofyAnimClass(emoji: string): string {
  if ('😂🤣🤡💀😭🤪😜'.includes(emoji)) return 'animate-emoji-laugh';
  if ('❤️💖💘😍🥰💓💕🥺'.includes(emoji)) return 'animate-emoji-heartbeat';
  if ('🏆🎉🤯🙌💪🥳🚀🎯'.includes(emoji)) return 'animate-emoji-pop-spin';
  if ('👻🐸🦖💩🏎️🏒⚽🤖👾'.includes(emoji)) return 'animate-emoji-tornado';
  return 'animate-emoji-jelly';
}

function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

function pickSupportedAudioMime(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read recorded audio.'));
    };
    reader.onerror = () => reject(new Error('Failed to encode audio message.'));
    reader.readAsDataURL(blob);
  });
}

const WAVE_BARS = [45, 80, 60, 95, 50, 88, 70, 100, 65, 85, 55, 75, 42, 68];

const VoiceMessageBubble: React.FC<{
  msgId: string;
  audioData: string;
  durationSec: number;
  isMe: boolean;
  activePlayId: string | null;
  onRequestPlay: (id: string | null) => void;
}> = ({ msgId, audioData, durationSec, isMe, activePlayId, onRequestPlay }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);
  const isPlaying = activePlayId === msgId;

  useEffect(() => {
    const el = new Audio(audioData);
    el.preload = 'metadata';
    audioRef.current = el;

    const handleTime = () => {
      const total = el.duration && Number.isFinite(el.duration) ? el.duration : durationSec;
      if (total > 0) setProgress(Math.min(1, el.currentTime / total));
    };
    const handleEnded = () => {
      setProgress(0);
      onRequestPlay(null);
    };

    el.addEventListener('timeupdate', handleTime);
    el.addEventListener('ended', handleEnded);

    return () => {
      el.pause();
      el.removeEventListener('timeupdate', handleTime);
      el.removeEventListener('ended', handleEnded);
      audioRef.current = null;
    };
  }, [audioData, durationSec, onRequestPlay]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.play().catch(() => {
        onRequestPlay(null);
      });
    } else {
      el.pause();
    }
  }, [isPlaying, onRequestPlay]);

  const togglePlay = () => {
    if (isPlaying) {
      onRequestPlay(null);
    } else {
      onRequestPlay(msgId);
    }
  };

  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border-2 border-black px-3 py-2 ${
        isMe ? 'bg-[#ffe17c] text-black' : 'bg-[#f4f4f5] text-black'
      }`}
    >
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-black bg-black text-[#ffe17c] cursor-pointer"
      >
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
      </button>

      <div className="flex items-center gap-0.5 h-6">
        {WAVE_BARS.map((pct, i) => {
          const filled = i / WAVE_BARS.length <= progress;
          return (
            <span
              key={i}
              className={`w-1 rounded-full transition-colors ${
                filled || isPlaying ? 'bg-black' : 'bg-black/35'
              }`}
              style={{ height: `${Math.max(25, pct)}%` }}
            />
          );
        })}
      </div>

      <span className="ml-1 font-mono-num text-[11px] font-extrabold text-black">
        {formatSeconds(durationSec)}
      </span>
    </div>
  );
};

interface BurstParticle {
  id: string;
  emoji: string;
  xOffset: number;
  yPeak: number;
  rotate: number;
  scale: number;
}

export const RoomChat: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { messages, sendChatMessage, sendVoiceMessage, user, p1, p2 } = useArcade();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [replayMap, setReplayMap] = useState<Record<string, number>>({});
  const [bursts, setBursts] = useState<BurstParticle[]>([]);
  const [activePlayId, setActivePlayId] = useState<string | null>(null);

  // Voice recording state
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartRef = useRef<number>(0);
  const shouldSendOnStopRef = useRef<boolean>(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastProcessedIdRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (messages.length === 0) return;
    const latest = messages[messages.length - 1];

    if (!hydratedRef.current) {
      hydratedRef.current = true;
      lastProcessedIdRef.current = latest.id;
      return;
    }

    if (latest.id !== lastProcessedIdRef.current) {
      lastProcessedIdRef.current = latest.id;
      if (latest.msgType !== 'voice' && isSingleEmoji(latest.text)) {
        const cleanEmoji = latest.text.trim();
        sound.playPowerUp();
        const spawned: BurstParticle[] = Array.from({ length: 9 }, (_, i) => ({
          id: `${latest.id}-${i}`,
          emoji: cleanEmoji,
          xOffset: (i - 4) * 30 + (Math.random() * 20 - 10),
          yPeak: -90 - Math.random() * 90,
          rotate: (Math.random() - 0.5) * 260,
          scale: 0.9 + Math.random() * 0.75,
        }));
        setBursts(spawned);
        const timer = window.setTimeout(() => {
          setBursts((prev) => prev.filter((b) => !b.id.startsWith(latest.id)));
        }, 1450);
        return () => window.clearTimeout(timer);
      }
    }
  }, [messages]);

  const cleanupRecorderResources = () => {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    setRecording(false);
  };

  useEffect(() => {
    return () => {
      shouldSendOnStopRef.current = false;
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {}
      }
      cleanupRecorderResources();
    };
  }, []);

  const submitText = async (text: string) => {
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true);
    setDraft('');
    setPickerOpen(false);
    setVoiceError(null);
    if (!isSingleEmoji(clean)) {
      sound.playClick();
    }
    try {
      await sendChatMessage(clean);
    } finally {
      setSending(false);
    }
  };

  const handleEmojiPick = (emoji: string) => {
    if (draft.trim().length === 0) {
      submitText(emoji);
    } else {
      sound.playClick();
      setDraft((prev) => `${prev}${emoji}`);
      setPickerOpen(false);
    }
  };

  const startVoiceRecording = async () => {
    if (recording || sending) return;
    setVoiceError(null);
    setPickerOpen(false);
    setActivePlayId(null);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceError('Voice messages are not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const mimeType = pickSupportedAudioMime();
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 16000,
      });

      chunksRef.current = [];
      shouldSendOnStopRef.current = true;
      recordStartRef.current = Date.now();
      setRecordSec(0);
      setRecording(true);
      sound.playClick();

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const shouldSend = shouldSendOnStopRef.current;
        const elapsedSec = Math.max(1, Math.round((Date.now() - recordStartRef.current) / 1000));
        const recordedMime = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: recordedMime });
        chunksRef.current = [];
        cleanupRecorderResources();

        if (!shouldSend || blob.size < 120) return;
        setSending(true);
        try {
          const dataUrl = await blobToDataUrl(blob);
          if (dataUrl.length > MAX_AUDIO_DATA_CHARS) {
            setVoiceError('Voice clip was too large to send. Keep clips under 20s.');
            return;
          }
          sound.playPowerUp();
          await sendVoiceMessage(dataUrl, Math.min(MAX_VOICE_SECONDS, elapsedSec));
        } catch (err) {
          setVoiceError(err instanceof Error ? err.message : 'Failed to send voice message.');
        } finally {
          setSending(false);
        }
      };

      recorderRef.current = recorder;
      recorder.start(250);

      recordTimerRef.current = window.setInterval(() => {
        const secs = Math.floor((Date.now() - recordStartRef.current) / 1000);
        setRecordSec(secs);
        if (secs >= MAX_VOICE_SECONDS && recorder.state === 'recording') {
          shouldSendOnStopRef.current = true;
          recorder.stop();
        }
      }, 250);
    } catch {
      cleanupRecorderResources();
      setVoiceError('Microphone permission denied or unavailable.');
    }
  };

  const stopAndSendVoice = () => {
    if (!recorderRef.current || recorderRef.current.state === 'inactive') return;
    shouldSendOnStopRef.current = true;
    recorderRef.current.stop();
  };

  const cancelVoiceRecording = () => {
    sound.playClick();
    shouldSendOnStopRef.current = false;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    } else {
      cleanupRecorderResources();
    }
  };

  return (
    <div
      className={`relative flex flex-col rounded-2xl border-2 border-black bg-white neo-shadow-sm ${
        compact ? 'h-full' : 'h-[480px]'
      }`}
    >
      <div className="flex items-center justify-between border-b-2 border-black bg-[#b7c6c2] px-4 py-3 rounded-t-[14px]">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-black" />
          <h3 className="font-display text-sm font-extrabold text-black">Room Chat</h3>
        </div>
        <span className="max-w-[160px] truncate text-xs font-bold text-black/75">
          {p1.name} &amp; {p2.name}
        </span>
      </div>

      {/* Chat Messages Feed */}
      <div className="relative flex-1 overflow-y-auto p-3.5 space-y-3 bg-white">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center px-4">
            <p className="text-xs font-medium text-black/55">
              No messages yet. Say hi, send a voice note, or drop a single emoji for a goofy burst.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.senderUid === user?.uid;
            const isVoice = m.msgType === 'voice' && Boolean(m.audioData);
            const singleEmoji = !isVoice && isSingleEmoji(m.text);
            const seatLabel =
              m.senderSide === 'p1' ? 'Side 1' : m.senderSide === 'p2' ? 'Side 2' : 'Guest';
            const replayKey = replayMap[m.id] ?? 0;

            return (
              <div
                key={m.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[11px]">
                  <span className="font-extrabold text-black">{m.senderName}</span>
                  <span className="text-black/50">{seatLabel}</span>
                </div>

                {isVoice && m.audioData ? (
                  <VoiceMessageBubble
                    msgId={m.id}
                    audioData={m.audioData}
                    durationSec={m.audioDurationSec ?? 1}
                    isMe={isMe}
                    activePlayId={activePlayId}
                    onRequestPlay={setActivePlayId}
                  />
                ) : singleEmoji ? (
                  <button
                    key={`${m.id}-${replayKey}`}
                    type="button"
                    onClick={() => {
                      sound.playPowerUp();
                      setReplayMap((prev) => ({
                        ...prev,
                        [m.id]: (prev[m.id] ?? 0) + 1,
                      }));
                    }}
                    title="Tap to replay goofy animation"
                    className={`px-1 py-0.5 text-5xl leading-none select-none cursor-pointer focus-visible:outline-none ${pickGoofyAnimClass(
                      m.text.trim()
                    )}`}
                  >
                    {m.text.trim()}
                  </button>
                ) : (
                  <div
                    className={`max-w-[85%] rounded-xl border-2 border-black px-3.5 py-2 text-xs leading-relaxed font-medium ${
                      isMe ? 'bg-[#ffe17c] text-black' : 'bg-[#f4f4f5] text-black'
                    }`}
                  >
                    {m.text}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Goofy Floating Emoji Reaction Burst */}
        <div
          className="pointer-events-none sticky bottom-4 inset-x-0 flex justify-center overflow-visible"
          aria-hidden="true"
        >
          <AnimatePresence>
            {bursts.map((b) => (
              <motion.span
                key={b.id}
                initial={{ opacity: 0, x: 0, y: 12, scale: 0.35, rotate: 0 }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  x: b.xOffset,
                  y: b.yPeak,
                  scale: [0.4, b.scale * 1.4, b.scale],
                  rotate: b.rotate,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }}
                className="absolute text-4xl select-none"
              >
                {b.emoji}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>

        <div ref={bottomRef} />
      </div>

      {/* Footer Quick Chats, Goofy Emoji Picker, Voice Recorder & Input */}
      <div className="relative border-t-2 border-black bg-[#f4f4f5] p-3 space-y-2.5 rounded-b-[14px]">
        {voiceError && (
          <div className="flex items-center justify-between gap-2 rounded-lg border-2 border-black bg-[#ffe17c] px-2.5 py-1.5 text-[11px] font-bold text-black">
            <span>{voiceError}</span>
            <button
              type="button"
              onClick={() => setVoiceError(null)}
              className="underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {pickerOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 z-20 max-h-60 overflow-y-auto rounded-xl border-2 border-black bg-white p-3 neo-shadow-sm">
            <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-black">
              <span>Tap an emoji to send a goofy burst</span>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-black/60 hover:text-black cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {CHAT_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => handleEmojiPick(em)}
                  className="flex h-10 items-center justify-center rounded-lg border-2 border-transparent text-2xl hover:border-black hover:bg-[#ffe17c] active:scale-125 transition-all cursor-pointer"
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {QUICK_CHATS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => submitText(q)}
              className="rounded-lg border-2 border-black bg-white px-2.5 py-1 text-[11px] font-bold text-black hover:bg-[#ffe17c] transition-colors cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>

        {recording ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-black bg-[#ffe17c] px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse border border-black" />
              <span className="font-mono-num text-xs font-extrabold text-black">
                Recording {formatSeconds(recordSec)} / {formatSeconds(MAX_VOICE_SECONDS)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={cancelVoiceRecording}
                aria-label="Cancel voice recording"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border-2 border-black bg-white text-black hover:bg-black hover:text-white cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={stopAndSendVoice}
                aria-label="Send voice message"
                className="inline-flex h-8 items-center gap-1 rounded-lg border-2 border-black bg-black px-2.5 text-xs font-bold text-[#ffe17c] cursor-pointer"
              >
                <Square className="h-3 w-3 fill-current" />
                Send
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitText(draft);
            }}
            className="flex items-center gap-1.5"
          >
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setPickerOpen((o) => !o);
              }}
              aria-label="Open goofy emoji reactions"
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-black transition-colors cursor-pointer ${
                pickerOpen ? 'bg-[#ffe17c] text-black' : 'bg-white text-black hover:bg-[#b7c6c2]'
              }`}
            >
              <Smile className="h-4 w-4" />
            </button>

            <input
              type="text"
              value={draft}
              maxLength={400}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message or single emoji..."
              className="flex-1 min-w-0 rounded-lg border-2 border-black bg-white px-3 py-2 text-xs font-medium text-black placeholder:text-black/45 focus:bg-[#ffe17c]/30 focus:outline-none"
            />

            <button
              type="button"
              disabled={sending}
              onClick={startVoiceRecording}
              aria-label="Record voice message"
              title="Record voice message (up to 20s)"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-black bg-[#b7c6c2] text-black hover:bg-[#ffe17c] disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Mic className="h-4 w-4" />
            </button>

            <button
              type="submit"
              disabled={!draft.trim() || sending}
              aria-label="Send message"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-black bg-black text-white hover:bg-[#171e19] disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Send className="h-4 w-4 text-[#ffe17c]" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
