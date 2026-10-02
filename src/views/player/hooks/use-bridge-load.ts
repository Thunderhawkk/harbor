import { useEffect, useRef, useState, type RefObject } from "react";
import type { PlayerBridge } from "@/lib/player/bridge";
import { cloudWriteId } from "@/lib/stremio";
import { resolveStartMs } from "@/lib/player/resume-start";
import type { PlayerSrc } from "@/lib/view";
import { videoIdFor } from "./use-stremio-sync";
import { useSettings } from "@/lib/settings";
import { playbackStartupProfile } from "@/lib/player/startup-profile";
import { isLivePlaybackSrc } from "@/lib/player/live-src";
import { releaseStreamProxy, retainStreamProxy } from "@/lib/stream-proxy";
import { playerLoadIdentity } from "@/lib/player/load-identity";

const RESUME_PROMPT_MIN_SEC = 30;
const RESTART_THRESHOLD = 0.8;

export function useBridgeLoad(params: {
  bridgeRef: RefObject<PlayerBridge | null>;
  inRoomRef: RefObject<boolean>;
  isHostRef: RefObject<boolean>;
  bridgeReady: boolean;
  bridgeKey: string;
  src: PlayerSrc;
  transcodedUrl: string | null;
  season: number | undefined;
  episode: number | undefined;
  authKey: string | null;
}): {
  pendingResumeSec: number | null;
  acknowledgeResume: (action: "resume" | "start-over") => void;
  pendingSeekSec: number | null;
  clearPendingSeek: () => void;
} {
  const {
    bridgeRef,
    inRoomRef,
    isHostRef,
    bridgeReady,
    bridgeKey,
    src,
    transcodedUrl,
    season,
    episode,
    authKey,
  } = params;

  const { settings } = useSettings();
  const resumePromptRef = useRef(settings.resumePrompt);
  resumePromptRef.current = settings.resumePrompt;
  const resumePlaybackRef = useRef(settings.resumePlayback);
  resumePlaybackRef.current = settings.resumePlayback;

  const lastLoadedUrlRef = useRef<string | null>(null);
  const firstLoadRef = useRef(true);
  const [pendingResumeSec, setPendingResumeSec] = useState<number | null>(null);
  const [pendingSeekSec, setPendingSeekSec] = useState<number | null>(null);
  const ackRef = useRef<((action: "resume" | "start-over") => void) | null>(null);
  const sourceIdentity = playerLoadIdentity(src, transcodedUrl ?? src.url, season, episode);

  useEffect(() => {
    const sessionId = src.proxySessionId;
    if (!sessionId) return;
    retainStreamProxy(sessionId);
    return () => {
      releaseStreamProxy(sessionId);
    };
  }, [src.proxySessionId]);

  useEffect(() => {
    if (!bridgeReady) return;
    const bridge = bridgeRef.current;
    if (!bridge) return;
    const playUrl = transcodedUrl ?? src.url;
    const loadKey = `${bridgeKey}|${sourceIdentity}`;
    if (lastLoadedUrlRef.current === loadKey) return;
    lastLoadedUrlRef.current = loadKey;
    const isFirstLoad = firstLoadRef.current;
    firstLoadRef.current = false;
    const isAutoRetry = (src.attempt ?? 0) > 0;
    const isLive = isLivePlaybackSrc(src);
    let cancelled = false;
    (async () => {
      const openingVid = videoIdFor(
        src,
        cloudWriteId(src.meta.id, src.imdbId ?? null, src.imdbIdVerified === true),
      );
      const resumeIdentity = {
        metaId: src.meta.id,
        authKey,
        imdbId: src.imdbId ?? null,
        imdbVerified: src.imdbIdVerified === true,
      };
      const shouldResolveResume =
        !isLive && !src.startFromZero && (resumePlaybackRef.current || resumePromptRef.current);
      const resumePromise = !shouldResolveResume
        ? Promise.resolve({ ms: 0, fromRemote: false, finished: false })
        : resolveStartMs({
            ...resumeIdentity,
            season,
            episode,
            openingVid,
          });
      let resolved: Awaited<typeof resumePromise>;
      // The start position must be known before the media loads: both bridges
      // honour `startAtSec` natively (mpv's `start`, the html5 element's initial
      // seek), while a seek issued while the media is still loading can be
      // dropped or land behind the request, losing the resume.
      try {
        resolved = shouldResolveResume
          ? await resumePromise
          : { ms: 0, fromRemote: false, finished: false };
      } catch (e) {
        if (cancelled) return;
        console.warn("[player] resume resolve failed", e);
        resolved = { ms: 0, fromRemote: false, finished: false };
      }
      if (cancelled) return;
      const startMs = src.startPositionMs ?? resolved.ms;
      const runtimeMin = src.episode?.runtime ?? null;
      const durationMs = runtimeMin && runtimeMin > 0 ? runtimeMin * 60_000 : 0;
      const finishedNearEnd =
        resolved.finished || (durationMs > 0 && startMs / durationMs >= RESTART_THRESHOLD);
      // A source replacement (for example a home-server quality switch) carries
      // an explicit position and must preserve it regardless of the user's
      // automatic resume preference. That preference only governs stored resume
      // progress when opening an item normally.
      const hasExplicitStart = src.startPositionMs != null;
      const startSec =
        (hasExplicitStart ? startMs : !resumePlaybackRef.current || finishedNearEnd ? 0 : startMs) /
        1000;
      const guestInRoom = inRoomRef.current && !isHostRef.current;
      const eligibleForPrompt =
        isFirstLoad &&
        !isAutoRetry &&
        !isLive &&
        resumePromptRef.current &&
        startSec > RESUME_PROMPT_MIN_SEC &&
        !guestInRoom;
      // A pending prompt must start from the beginning and seek once answered.
      const loadStartSec = eligibleForPrompt ? 0 : startSec;
      try {
        await bridge.load({
          url: playUrl,
          traceId: src.playbackTraceId,
          startupProfile: playbackStartupProfile(src.streamRef),
          subtitles: src.subtitles,
          notWebReady: src.notWebReady,
          isLive,
          headers: src.headers,
          startAtSec: loadStartSec > 5 ? loadStartSec : undefined,
        });
      } catch (e) {
        if (cancelled) return;
        console.warn("[player] load failed", e);
        return;
      }
      if (cancelled) return;
      if (eligibleForPrompt) {
        bridge.pause();
        setPendingResumeSec(startSec);
        ackRef.current = (action) => {
          ackRef.current = null;
          setPendingResumeSec(null);
          if (action === "resume") {
            setPendingSeekSec(startSec);
          } else {
            setPendingSeekSec(0);
          }
        };
        return;
      }
      if (loadStartSec > 5) {
        // The media already started at the saved position.
        if (!inRoomRef.current && !src.startPaused) {
          bridge.play().catch(() => {});
        } else if (src.startPaused) {
          bridge.pause();
        }
        return;
      }
      if (!guestInRoom && startSec > 5) {
        setPendingSeekSec(startSec);
        return;
      }
      if (!inRoomRef.current && !src.startPaused) {
        bridge.play().catch(() => {});
      } else if (src.startPaused) {
        bridge.pause();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bridgeReady,
    bridgeKey,
    sourceIdentity,
    src.url,
    src.notWebReady,
    src.playbackTraceId,
    src.meta.id,
    src.subtitles,
    src.startPositionMs,
    src.startPaused,
    season,
    episode,
    transcodedUrl,
    authKey,
  ]);

  useEffect(() => {
    lastLoadedUrlRef.current = null;
  }, [bridgeKey]);

  const acknowledgeResume = (action: "resume" | "start-over") => {
    ackRef.current?.(action);
  };

  const clearPendingSeek = () => setPendingSeekSec(null);

  return { pendingResumeSec, acknowledgeResume, pendingSeekSec, clearPendingSeek };
}
