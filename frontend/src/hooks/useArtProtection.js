import { useEffect, useState } from "react";

const BLOCKED_CTRL_KEYS = new Set(["s", "c", "x", "u", "p"]);
const BLOCKED_DEVTOOLS_KEYS = new Set(["i", "j", "c", "s"]);

export function useArtProtection() {
  const [isProtected, setIsProtected] = useState(false);

  useEffect(() => {
    const blockEvent = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const onKeyDown = (e) => {
      const key = String(e.key || "").toLowerCase();
      const ctrlOrMeta = e.ctrlKey || e.metaKey;

      if (key === "printscreen" || e.keyCode === 44) {
        blockEvent(e);
        return;
      }

      if (e.key === "F12") {
        blockEvent(e);
        return;
      }

      if (ctrlOrMeta && BLOCKED_CTRL_KEYS.has(key)) {
        blockEvent(e);
        return;
      }

      if (ctrlOrMeta && e.shiftKey && BLOCKED_DEVTOOLS_KEYS.has(key)) {
        blockEvent(e);
      }
    };

    const onKeyUp = () => {};
    const onVisibility = () => setIsProtected(document.hidden);
    const onBlur = () => setIsProtected(true);
    const onFocus = () => setIsProtected(false);

    const blockedDomEvents = ["copy", "cut", "paste", "contextmenu", "dragstart", "selectstart"];
    const onBlockedDomEvent = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    blockedDomEvents.forEach((evt) => document.addEventListener(evt, onBlockedDomEvent));

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      blockedDomEvents.forEach((evt) => document.removeEventListener(evt, onBlockedDomEvent));
    };
  }, []);

  return { isProtected };
}

export default useArtProtection;
