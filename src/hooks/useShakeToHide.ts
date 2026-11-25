// src/hooks/useShakeToHide.ts
import { useEffect, useCallback, useRef } from "react";

interface ShakeConfig {
  threshold?: number;
  timeout?: number;
}

export function useShakeToHide(
  onShake: () => void,
  config: ShakeConfig = {}
) {
  const { threshold = 20, timeout = 1500 } = config;
  const lastShake = useRef(0);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const lastZ = useRef(0);

  const handleMotion = useCallback(
    (event: DeviceMotionEvent) => {
      const acceleration = event.accelerationIncludingGravity;
      if (!acceleration) return;

      const x = acceleration.x ?? 0;
      const y = acceleration.y ?? 0;
      const z = acceleration.z ?? 0;
      const now = Date.now();

      if (now - lastShake.current < timeout) return;

      const deltaX = Math.abs(x - lastX.current);
      const deltaY = Math.abs(y - lastY.current);
      const deltaZ = Math.abs(z - lastZ.current);

      if (deltaX > threshold || deltaY > threshold || deltaZ > threshold) {
        lastShake.current = now;
        onShake();
      }

      lastX.current = x;
      lastY.current = y;
      lastZ.current = z;
    },
    [threshold, timeout, onShake]
  );

  useEffect(() => {
    if (!window.DeviceMotionEvent) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      if (typeof (DeviceMotionEvent as any).requestPermission === "function") {
        (DeviceMotionEvent as any).requestPermission()
          .then((state: string) => {
            if (state === "granted") {
              window.addEventListener("devicemotion", handleMotion);
            }
          })
          .catch(console.error);
      } else {
        window.addEventListener("devicemotion", handleMotion);
      }
    } else {
      window.addEventListener("devicemotion", handleMotion);
    }

    return () => {
      window.removeEventListener("devicemotion", handleMotion);
    };
  }, [handleMotion]);

  return { isSupported: "DeviceMotionEvent" in window };
}
