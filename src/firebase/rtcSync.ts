import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './client';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export interface RtcChannelHandle {
  send: (payload: unknown) => boolean;
  isOpen: () => boolean;
  close: () => void;
}

export function createRoomRtcChannel(params: {
  roomCode: string;
  myUid: string;
  isHost: boolean;
  sessionKey: string;
  onMessage: (data: unknown) => void;
  onStatusChange?: (open: boolean) => void;
}): RtcChannelHandle {
  const { roomCode, myUid, isHost, sessionKey, onMessage, onStatusChange } = params;
  let closed = false;
  let dc: RTCDataChannel | null = null;
  let pc: RTCPeerConnection | null = null;
  let unsubSignal: (() => void) | null = null;
  let handledRemoteSeq = -1;

  const setupChannel = (channel: RTCDataChannel) => {
    dc = channel;
    channel.onopen = () => {
      if (!closed) onStatusChange?.(true);
    };
    channel.onclose = () => {
      if (!closed) onStatusChange?.(false);
    };
    channel.onmessage = (evt) => {
      if (closed) return;
      try {
        onMessage(JSON.parse(evt.data));
      } catch {
        // Ignore malformed packets
      }
    };
  };

  const gatherCandidates = (peer: RTCPeerConnection): Promise<RTCIceCandidateInit[]> => {
    return new Promise((resolve) => {
      const list: RTCIceCandidateInit[] = [];
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve(list);
      };
      peer.onicecandidate = (e) => {
        if (e.candidate) {
          list.push(e.candidate.toJSON());
        } else {
          finish();
        }
      };
      setTimeout(finish, 750);
    });
  };

  const start = async () => {
    if (typeof RTCPeerConnection === 'undefined') return;
    pc = new RTCPeerConnection(ICE_SERVERS);

    if (isHost) {
      const channel = pc.createDataChannel('arcade', {
        ordered: false,
        maxRetransmits: 0,
      });
      setupChannel(channel);

      try {
        const candPromise = gatherCandidates(pc);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const candidates = await candPromise;
        if (closed) return;

        const offerPath = `rooms/${roomCode}/sync/rtc_offer`;
        await setDoc(doc(db, 'rooms', roomCode, 'sync', 'rtc_offer'), {
          docId: 'rtc_offer',
          gameId: sessionKey,
          seq: Date.now(),
          updatedByUid: myUid,
          payload: {
            sdp: offer.sdp ?? '',
            type: offer.type,
            candidates,
          },
          updatedAt: serverTimestamp(),
        }).catch((err) => handleFirestoreError(err, OperationType.WRITE, offerPath));

        const answerPath = `rooms/${roomCode}/sync/rtc_answer`;
        unsubSignal = onSnapshot(
          doc(db, 'rooms', roomCode, 'sync', 'rtc_answer'),
          async (snap) => {
            if (closed || !snap.exists() || !pc) return;
            const d = snap.data();
            if (d.gameId !== sessionKey || d.seq <= handledRemoteSeq) return;
            handledRemoteSeq = d.seq;
            const p = d.payload as {
              sdp: string;
              type: RTCSdpType;
              candidates?: RTCIceCandidateInit[];
            };
            if (!p?.sdp) return;
            try {
              if (pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription({ type: p.type, sdp: p.sdp });
                for (const c of p.candidates ?? []) {
                  await pc.addIceCandidate(c).catch(() => {});
                }
              }
            } catch {
              // Ignore negotiation race
            }
          },
          (err) => handleFirestoreError(err, OperationType.GET, answerPath)
        );
      } catch {
        // Fallback to Firestore sync silently if WebRTC fails
      }
    } else {
      pc.ondatachannel = (evt) => {
        if (!closed) setupChannel(evt.channel);
      };

      const offerPath = `rooms/${roomCode}/sync/rtc_offer`;
      unsubSignal = onSnapshot(
        doc(db, 'rooms', roomCode, 'sync', 'rtc_offer'),
        async (snap) => {
          if (closed || !snap.exists() || !pc) return;
          const d = snap.data();
          if (d.gameId !== sessionKey || d.seq <= handledRemoteSeq) return;
          handledRemoteSeq = d.seq;
          const p = d.payload as {
            sdp: string;
            type: RTCSdpType;
            candidates?: RTCIceCandidateInit[];
          };
          if (!p?.sdp) return;
          try {
            const candPromise = gatherCandidates(pc);
            await pc.setRemoteDescription({ type: p.type, sdp: p.sdp });
            for (const c of p.candidates ?? []) {
              await pc.addIceCandidate(c).catch(() => {});
            }
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            const candidates = await candPromise;
            if (closed) return;

            const answerPath = `rooms/${roomCode}/sync/rtc_answer`;
            await setDoc(doc(db, 'rooms', roomCode, 'sync', 'rtc_answer'), {
              docId: 'rtc_answer',
              gameId: sessionKey,
              seq: Date.now(),
              updatedByUid: myUid,
              payload: {
                sdp: answer.sdp ?? '',
                type: answer.type,
                candidates,
              },
              updatedAt: serverTimestamp(),
            }).catch((err) => handleFirestoreError(err, OperationType.WRITE, answerPath));
          } catch {
            // Fallback to Firestore sync silently
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, offerPath)
      );
    }
  };

  start();

  return {
    send: (payload: unknown) => {
      if (dc && dc.readyState === 'open') {
        try {
          dc.send(JSON.stringify(payload));
          return true;
        } catch {
          return false;
        }
      }
      return false;
    },
    isOpen: () => Boolean(dc && dc.readyState === 'open'),
    close: () => {
      closed = true;
      unsubSignal?.();
      try {
        dc?.close();
      } catch {}
      try {
        pc?.close();
      } catch {}
    },
  };
}
