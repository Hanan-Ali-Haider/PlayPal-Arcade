import React, { useState } from 'react';
import { FileText, ShieldCheck, X } from 'lucide-react';
import { sound } from '../utils/sound';

export type LegalTab = 'privacy' | 'terms';

interface LegalModalProps {
  initialTab: LegalTab;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ initialTab, onClose }) => {
  const [tab, setTab] = useState<LegalTab>(initialTab);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-2 border-black bg-white neo-shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-2 border-black bg-[#ffe17c] px-5 py-4">
          <div className="flex items-center gap-2.5">
            {tab === 'privacy' ? (
              <ShieldCheck className="h-5 w-5 text-black" />
            ) : (
              <FileText className="h-5 w-5 text-black" />
            )}
            <h2 className="font-display text-xl font-extrabold tracking-tight text-black">
              {tab === 'privacy' ? 'Privacy Policy' : 'Terms & Conditions'}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            aria-label="Close legal dialog"
            className="neo-btn bg-white p-1.5 text-black cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b-2 border-black bg-[#f4f4f5] px-5 py-2.5">
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setTab('privacy');
            }}
            className={`neo-btn px-3.5 py-1.5 text-xs font-bold cursor-pointer ${
              tab === 'privacy' ? 'bg-black text-[#ffe17c]' : 'bg-white text-black'
            }`}
          >
            Privacy Policy
          </button>
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setTab('terms');
            }}
            className={`neo-btn px-3.5 py-1.5 text-xs font-bold cursor-pointer ${
              tab === 'terms' ? 'bg-black text-[#ffe17c]' : 'bg-white text-black'
            }`}
          >
            Terms &amp; Conditions
          </button>
          <span className="ml-auto hidden sm:inline text-[11px] font-bold text-black/65">
            Made By Hanan Ali Haider
          </span>
        </div>

        <div className="overflow-y-auto p-5 sm:p-6 space-y-4 text-xs leading-relaxed text-black/80 sm:text-sm">
          {tab === 'privacy' ? (
            <>
              <p className="font-bold text-black">
                PlayPal Arcade — Made By Hanan Ali Haider
              </p>
              <section className="space-y-1.5">
                <h3 className="font-display text-base font-extrabold text-black">
                  1. Information We Collect
                </h3>
                <p>
                  When you sign in with Google, we store your account UID, customizable display name, unique @username handle, optional profile picture, avatar badge preferences, and sound settings in Cloud Firestore so your profile persists across desktop and mobile devices.
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-display text-base font-extrabold text-black">
                  2. Friend Requests &amp; Online Rooms
                </h3>
                <p>
                  Your @username handle is searchable by friends who type your exact handle to send a friend request. Room text chat, voice messages, game match histories, and room scores are stored securely inside each private room and are accessible only to members of that room.
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-display text-base font-extrabold text-black">
                  3. Real-Time Gameplay Connections
                </h3>
                <p>
                  Live games such as Street Dash Racing, Smash Air Hockey, Headball, and Football establish direct peer-to-peer WebRTC DataChannels (or encrypted Cloud Firestore fallback) exclusively between room participants to synchronize game physics.
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-display text-base font-extrabold text-black">
                  4. Data Control &amp; Deletion
                </h3>
                <p>
                  You can update or remove your profile picture, display name, @username, and badge anytime in Account Settings, unfriend or cancel friend requests from the Friends tab, and delete rooms you created. Audio preferences stay locally in your browser&apos;s localStorage.
                </p>
              </section>
            </>
          ) : (
            <>
              <p className="font-bold text-black">
                PlayPal Arcade — Made By Hanan Ali Haider
              </p>
              <section className="space-y-1.5">
                <h3 className="font-display text-base font-extrabold text-black">
                  1. Acceptance of Terms
                </h3>
                <p>
                  By signing in and playing on PlayPal Arcade, you agree to follow fair-play guidelines and respectful conduct in rooms, usernames, and live room chat.
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-display text-base font-extrabold text-black">
                  2. Usernames &amp; Community Conduct
                </h3>
                <p>
                  Players must choose respectful @username handles (3–24 characters, lowercase letters, numbers, and underscores) and display names. Harassment, spam, or abusive chat inside rooms is prohibited.
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-display text-base font-extrabold text-black">
                  3. Fair Play &amp; Room Integrity
                </h3>
                <p>
                  All multiplayer games run real-time host/turn synchronization. Attempting to tamper with network packets, exploit bugs, or disrupt another player&apos;s room session is not permitted.
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-display text-base font-extrabold text-black">
                  4. Service Availability
                </h3>
                <p>
                  PlayPal Arcade is provided &ldquo;as-is&rdquo; for friendly casual 2-player entertainment across mobile and desktop browsers. Credits belong to Hanan Ali Haider.
                </p>
              </section>
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t-2 border-black bg-[#f4f4f5] px-5 py-3">
          <span className="text-[11px] font-bold text-black/65">
            Made By Hanan Ali Haider
          </span>
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            className="neo-btn bg-black px-5 py-2 text-xs font-bold text-white cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
