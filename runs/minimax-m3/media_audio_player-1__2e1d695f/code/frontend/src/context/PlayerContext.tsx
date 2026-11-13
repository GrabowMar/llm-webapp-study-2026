import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { api } from "../api";
import { durationToSeconds } from "../lib/format";
import type { Track } from "../types";

type PlayerContextValue = {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  error: string | null;
  hasNext: boolean;
  hasPrevious: boolean;
  playTrack: (track: Track) => void;
  togglePlay: () => void;
  playNext: () => void;
  playPrevious: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
  stop: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

type PlayerProviderProps = {
  queue: Track[];
  onPlayed?: (track: Track) => void;
  children: ReactNode;
};

export function PlayerProvider({ queue, onPlayed, children }: PlayerProviderProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [error, setError] = useState<string | null>(null);
  const countedRef = useRef<number | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.volume = 0.8;
    audioRef.current = audio;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      const value = audio.duration;
      setDuration(Number.isFinite(value) ? value : 0);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleError = () => {
      setIsPlaying(false);
      setError("This track could not be played.");
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("error", handleError);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    };
  }, []);

  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const onPlayedRef = useRef(onPlayed);
  useEffect(() => {
    onPlayedRef.current = onPlayed;
  }, [onPlayed]);

  const start = useCallback((track: Track) => {
    const audio = audioRef.current;
    setCurrent(track);
    setError(null);
    setCurrentTime(0);
    setDuration(durationToSeconds(track.duration) ?? 0);
    if (!audio) return;
    audio.src = track.url;
    audio.currentTime = 0;
    const promise = audio.play();
    if (promise) {
      promise.catch(() => setIsPlaying(false));
    }
    if (countedRef.current !== track.id) {
      countedRef.current = track.id;
      api
        .registerPlay(track.id)
        .then((updated) => onPlayedRef.current?.(updated))
        .catch(() => undefined);
    }
  }, []);

  const playTrack = useCallback(
    (track: Track) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (current && current.id === track.id) {
        if (audio.paused) {
          const promise = audio.play();
          if (promise) promise.catch(() => setIsPlaying(false));
        } else {
          audio.pause();
        }
        return;
      }
      start(track);
    },
    [current, start],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      const promise = audio.play();
      if (promise) promise.catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [current]);

  const step = useCallback(
    (offset: number) => {
      const items = queueRef.current;
      if (items.length === 0) return;
      const currentId = current?.id ?? null;
      const index = items.findIndex((item) => item.id === currentId);
      if (index === -1) {
        start(items[0]);
        return;
      }
      const nextIndex = (index + offset + items.length) % items.length;
      start(items[nextIndex]);
    },
    [current, start],
  );

  const playNext = useCallback(() => step(1), [step]);
  const playPrevious = useCallback(() => step(-1), [step]);

  const playNextRef = useRef(playNext);
  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleEnded = () => playNextRef.current();
    audio.addEventListener("ended", handleEnded);
    return () => audio.removeEventListener("ended", handleEnded);
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const value = Math.max(0, seconds);
    if (Number.isFinite(audio.duration)) {
      audio.currentTime = Math.min(value, audio.duration);
    } else {
      audio.currentTime = value;
    }
    setCurrentTime(audio.currentTime);
  }, []);

  const setVolume = useCallback((value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    countedRef.current = null;
    setCurrent(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
  }, []);

  const value = useMemo<PlayerContextValue>(
    () => ({
      currentTrack: current,
      isPlaying,
      currentTime,
      duration,
      volume,
      error,
      hasNext: queue.length > 0,
      hasPrevious: queue.length > 0,
      playTrack,
      togglePlay,
      playNext,
      playPrevious,
      seek,
      setVolume,
      stop,
    }),
    [
      current,
      isPlaying,
      currentTime,
      duration,
      volume,
      error,
      queue.length,
      playTrack,
      togglePlay,
      playNext,
      playPrevious,
      seek,
      setVolume,
      stop,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used inside a PlayerProvider");
  return context;
}
