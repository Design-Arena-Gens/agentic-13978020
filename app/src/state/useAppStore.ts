import { create } from "zustand";
import { Emotion } from "@/lib/voices";

export type AudioSettings = {
  voiceId: string;
  speed: number;
  pitch: number;
  emotion: Emotion;
};

export type GeneratedAudio = {
  id: string;
  name: string;
  url: string;
  blob: Blob;
  durationEstimateSeconds: number;
  durationSeconds: number;
  createdAt: number;
  settings: AudioSettings;
};

export type MediaKind = "image" | "video";

export type MediaAsset = {
  id: string;
  kind: MediaKind;
  name: string;
  url: string;
  file: File;
  duration?: number;
  previewFrame?: string;
};

export type TransitionType =
  | "nenhuma"
  | "crossfade"
  | "fade-in"
  | "cine-sweep"
  | "white-flash";

export type TimelineClip = {
  id: string;
  mediaId: string;
  start: number;
  duration: number;
  transition: TransitionType;
};

export type ComposerMode = "simples" | "avançado";

type AppState = {
  audios: GeneratedAudio[];
  mediaLibrary: MediaAsset[];
  timeline: TimelineClip[];
  mode: ComposerMode;
  activeAudioId: string | null;
  addAudio: (audio: GeneratedAudio) => void;
  setActiveAudio: (id: string | null) => void;
  removeAudio: (id: string) => void;
  addMedia: (asset: MediaAsset) => void;
  removeMedia: (id: string) => void;
  updateMediaDuration: (id: string, duration: number) => void;
  setTimeline: (clips: TimelineClip[]) => void;
  setMode: (mode: ComposerMode) => void;
  reset: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  audios: [],
  mediaLibrary: [],
  timeline: [],
  mode: "simples",
  activeAudioId: null,
  addAudio: (audio) =>
    set((state) => ({
      audios: [audio, ...state.audios],
      activeAudioId: audio.id,
    })),
  setActiveAudio: (id) => set({ activeAudioId: id }),
  removeAudio: (id) =>
    set((state) => {
      const remaining = state.audios.filter((audio) => audio.id !== id);
      const nextActive =
        state.activeAudioId === id ? remaining[0]?.id ?? null : state.activeAudioId;
      return {
        audios: remaining,
        activeAudioId: nextActive,
      };
    }),
  addMedia: (asset) =>
    set((state) => ({
      mediaLibrary: [asset, ...state.mediaLibrary],
    })),
  removeMedia: (id) =>
    set((state) => ({
      mediaLibrary: state.mediaLibrary.filter((asset) => asset.id !== id),
      timeline: state.timeline.filter((clip) => clip.mediaId !== id),
    })),
  updateMediaDuration: (id, duration) =>
    set((state) => ({
      mediaLibrary: state.mediaLibrary.map((asset) =>
        asset.id === id ? { ...asset, duration } : asset,
      ),
      timeline: state.timeline.map((clip) =>
        clip.mediaId === id ? { ...clip, duration } : clip,
      ),
    })),
  setTimeline: (clips) => set({ timeline: clips }),
  setMode: (mode) => set({ mode }),
  reset: () =>
    set({
      audios: [],
      mediaLibrary: [],
      timeline: [],
      mode: "simples",
      activeAudioId: null,
    }),
}));
