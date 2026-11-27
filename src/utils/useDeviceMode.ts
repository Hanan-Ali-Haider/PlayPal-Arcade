import { useEffect, useState } from 'react';

export type DeviceType = 'mobile' | 'desktop';

export interface DeviceModeInfo {
  deviceType: DeviceType;
  isMobile: boolean;
  isDesktop: boolean;
  isTouch: boolean;
  isPortrait: boolean;
  isCompact: boolean;
  width: number;
  height: number;
}

function readDeviceInfo(): DeviceModeInfo {
  if (typeof window === 'undefined') {
    return {
      deviceType: 'desktop',
      isMobile: false,
      isDesktop: true,
      isTouch: false,
      isPortrait: false,
      isCompact: false,
      width: 1280,
      height: 800,
    };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const coarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const hasTouch =
    'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0 || coarsePointer;
  const uaMobile =
    typeof navigator !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Treat narrow screens (< 768px) or touch-first phones/tablets (< 1024px) or mobile UAs (< 1180px) as mobile-optimized
  const isMobile = width < 768 || (hasTouch && width < 1024) || (uaMobile && width < 1180);

  return {
    deviceType: isMobile ? 'mobile' : 'desktop',
    isMobile,
    isDesktop: !isMobile,
    isTouch: hasTouch,
    isPortrait: height >= width,
    isCompact: width < 640,
    width,
    height,
  };
}

export function useDeviceMode(): DeviceModeInfo {
  const [info, setInfo] = useState<DeviceModeInfo>(() => readDeviceInfo());

  useEffect(() => {
    const sync = () => {
      const next = readDeviceInfo();
      document.documentElement.dataset.device = next.deviceType;
      setInfo((prev) => {
        if (
          prev.deviceType === next.deviceType &&
          prev.isTouch === next.isTouch &&
          prev.isPortrait === next.isPortrait &&
          prev.isCompact === next.isCompact &&
          prev.width === next.width &&
          prev.height === next.height
        ) {
          return prev;
        }
        return next;
      });
    };

    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);

    const mq =
      typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null;
    if (mq?.addEventListener) {
      mq.addEventListener('change', sync);
    }

    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      if (mq?.removeEventListener) {
        mq.removeEventListener('change', sync);
      }
    };
  }, []);

  return info;
}
