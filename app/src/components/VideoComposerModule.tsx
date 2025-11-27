"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import NextImage from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ComposerMode,
  MediaAsset,
  TimelineClip,
  TransitionType,
  useAppStore,
} from "@/state/useAppStore";
import { voiceLibrary } from "@/lib/voices";

const TRANSITION_DURATION = 0.6;
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

type SortableClipCardProps = {
  clip: TimelineClip;
  media: MediaAsset | undefined;
  onRemove: () => void;
  onDurationChange: (value: number) => void;
  onTransitionChange: (value: TransitionType) => void;
};

function SortableClipCard({
  clip,
  media,
  onRemove,
  onDurationChange,
  onTransitionChange,
}: SortableClipCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: clip.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (!media) return null;

  const isImage = media.kind === "image";

  return (
    <div ref={setNodeRef} style={style}>
      <motion.div
        layout
        className="group flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-lg shadow-black/20"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs uppercase tracking-[0.3em] text-slate-200/70 transition group-hover:border-blue-400/50"
              {...attributes}
              {...listeners}
            >
              Drag
            </button>
            <div>
              <h4 className="text-sm font-semibold text-white">{media.name}</h4>
              <p className="text-xs text-slate-300/70">
                {isImage ? "Imagem estática" : "Vídeo"} • {clip.duration.toFixed(1)}s
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-slate-200/70 transition hover:border-red-400/40 hover:text-red-200"
          >
            Remover
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <label className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-300/70">
            <span>Duração do take</span>
            <span>{clip.duration.toFixed(1)}s</span>
          </label>
          <input
            type="range"
            min={isImage ? 2 : Math.max(2, clip.duration)}
            max={isImage ? 20 : clip.duration}
            step={0.1}
            disabled={!isImage}
            value={clip.duration}
            onChange={(event) => onDurationChange(Number(event.target.value))}
            className="accent-blue-400 disabled:opacity-60"
          />
          {!isImage && (
            <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400/70">
              A duração do vídeo é fixa e acompanha o arquivo original.
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <label className="text-xs uppercase tracking-[0.3em] text-slate-300/70">
            Transição de entrada
          </label>
          <div className="flex flex-wrap gap-2">
            {(["nenhuma", "fade-in", "crossfade", "cine-sweep", "white-flash"] as TransitionType[]).map(
              (option) => {
                const isActive = clip.transition === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onTransitionChange(option)}
                    className={`rounded-full px-3 py-2 text-[10px] uppercase tracking-[0.35em] transition ${isActive ? "bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 text-white shadow-[0_0_24px_rgba(93,118,255,0.45)]" : "border border-white/10 bg-slate-900/80 text-slate-200/70 hover:border-blue-400/40"}`}
                  >
                    {option}
                  </button>
                );
              },
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

async function getMediaMetadata(file: File): Promise<Partial<MediaAsset>> {
  const url = URL.createObjectURL(file);
  if (file.type.startsWith("image")) {
    return { url };
  }

  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 8;
      resolve({ url, duration });
    };
  });
}

function normalizeTimeline(clips: TimelineClip[]): TimelineClip[] {
  let cursor = 0;
  return clips.map((clip) => {
    const normalized: TimelineClip = { ...clip, start: cursor };
    cursor += clip.duration;
    return normalized;
  });
}

type RenderableMedia = {
  element: HTMLImageElement | HTMLVideoElement;
  asset: MediaAsset;
};

function drawMedia(
  ctx: CanvasRenderingContext2D,
  media: RenderableMedia,
  timestamp: number,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const { element, asset } = media;

  if (asset.kind === "video") {
    const video = element as HTMLVideoElement;
    if (video.readyState < 2) {
      ctx.restore();
      return;
    }
    if (!Number.isNaN(timestamp) && Number.isFinite(timestamp)) {
      const safeTime = Math.max(0, Math.min(timestamp, (asset.duration ?? video.duration) - 0.05));
      if (Math.abs(video.currentTime - safeTime) > 0.03) {
        video.currentTime = safeTime;
      }
    }
  } else {
    const image = element as HTMLImageElement;
    if (!image.complete) {
      ctx.restore();
      return;
    }
  }

  const width = asset.kind === "image" ? (element as HTMLImageElement).naturalWidth : (element as HTMLVideoElement).videoWidth;
  const height = asset.kind === "image" ? (element as HTMLImageElement).naturalHeight : (element as HTMLVideoElement).videoHeight;

  const aspect = width / height || 16 / 9;
  const targetAspect = CANVAS_WIDTH / CANVAS_HEIGHT;

  let drawWidth = CANVAS_WIDTH;
  let drawHeight = CANVAS_HEIGHT;

  if (aspect > targetAspect) {
    drawHeight = CANVAS_WIDTH / aspect;
  } else {
    drawWidth = CANVAS_HEIGHT * aspect;
  }

  const offsetX = (CANVAS_WIDTH - drawWidth) / 2;
  const offsetY = (CANVAS_HEIGHT - drawHeight) / 2;

  ctx.drawImage(element, offsetX, offsetY, drawWidth, drawHeight);
  ctx.restore();
}

function applyTransitionOverlay(
  ctx: CanvasRenderingContext2D,
  type: TransitionType,
  progress: number,
) {
  if (type === "white-flash") {
    const opacity = Math.max(0, 1 - progress * 2);
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${opacity.toFixed(2)})`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();
  } else if (type === "cine-sweep") {
    const sweep = progress;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
    const width = CANVAS_WIDTH * sweep;
    ctx.fillRect(-CANVAS_WIDTH + width, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();
  }
}

type PlayerState = {
  isPlaying: boolean;
  isExporting: boolean;
  currentTime: number;
};

export function VideoComposerModule() {
  const {
    audios,
    activeAudioId,
    setActiveAudio,
    mediaLibrary,
    addMedia,
    removeMedia,
    timeline,
    setTimeline,
    mode,
    setMode,
  } = useAppStore((state) => ({
    audios: state.audios,
    activeAudioId: state.activeAudioId,
    setActiveAudio: state.setActiveAudio,
    mediaLibrary: state.mediaLibrary,
    addMedia: state.addMedia,
    removeMedia: state.removeMedia,
    timeline: state.timeline,
    setTimeline: state.setTimeline,
    mode: state.mode,
    setMode: state.setMode,
  }));

  const activeAudio = audios.find((audio) => audio.id === activeAudioId) ?? audios[0];
  const normalizedTimeline = useMemo(() => normalizeTimeline(timeline), [timeline]);
  const compositionDuration = normalizedTimeline.reduce((total, clip) => total + clip.duration, 0);
  const durationMismatch =
    activeAudio && Math.abs((activeAudio.durationSeconds || activeAudio.durationEstimateSeconds) - compositionDuration) > 0.8;

  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    isExporting: false,
    currentTime: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const mediaCache = useRef<Map<string, HTMLImageElement | HTMLVideoElement>>(new Map());

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#04050B";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
  }, []);

  useEffect(() => {
    mediaLibrary.forEach((asset) => {
      if (mediaCache.current.has(asset.id)) return;
      if (asset.kind === "image") {
        const image = new Image();
        image.src = asset.url;
        image.crossOrigin = "anonymous";
        image.onload = () => mediaCache.current.set(asset.id, image);
      } else {
        const video = document.createElement("video");
        video.src = asset.url;
        video.muted = true;
        video.preload = "auto";
        video.crossOrigin = "anonymous";
        video.playsInline = true;
        video.onloadeddata = () => {
          mediaCache.current.set(asset.id, video);
        };
      }
    });
  }, [mediaLibrary]);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return undefined;
    const handleEnded = () => {
      setPlayerState((state) => ({ ...state, isPlaying: false, currentTime: 0 }));
      audioElement.currentTime = 0;
    };
    audioElement.addEventListener("ended", handleEnded);
    return () => {
      audioElement.removeEventListener("ended", handleEnded);
    };
  }, [activeAudio?.id]);

  const renderFrame = useCallback(
    (ctx: CanvasRenderingContext2D, time: number) => {
      ctx.fillStyle = "#050814";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      if (!normalizedTimeline.length) return;

    const currentIndex = normalizedTimeline.findIndex(
      (clip) => time >= clip.start && time < clip.start + clip.duration,
    );
    const safeIndex = currentIndex === -1 ? normalizedTimeline.length - 1 : currentIndex;
    const currentClip = normalizedTimeline[safeIndex];
    const previousClip = normalizedTimeline[safeIndex - 1];

    if (!currentClip) return;

    const localTime = time - currentClip.start;
    const mediaElement = mediaCache.current.get(currentClip.mediaId);
    const currentMedia = mediaElement
      ? { element: mediaElement, asset: mediaLibrary.find((asset) => asset.id === currentClip.mediaId)! }
      : null;

    if (!currentMedia) return;

    if (currentClip.transition === "crossfade" && previousClip) {
      const progress = Math.min(1, Math.max(0, localTime / TRANSITION_DURATION));
      const previousMediaElement = mediaCache.current.get(previousClip.mediaId);
      if (previousMediaElement) {
        drawMedia(
          ctx,
          { element: previousMediaElement, asset: mediaLibrary.find((asset) => asset.id === previousClip.mediaId)! },
          previousClip.duration - (TRANSITION_DURATION - localTime),
          1 - progress,
        );
      }
      drawMedia(ctx, currentMedia, localTime, progress);
      } else {
        drawMedia(ctx, currentMedia, localTime, 1);
        if (currentClip.transition === "fade-in") {
          const progress = Math.min(1, Math.max(0, localTime / TRANSITION_DURATION));
          ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${1 - progress})`;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.restore();
      } else if (currentClip.transition === "white-flash" || currentClip.transition === "cine-sweep") {
        const progress = Math.min(1, Math.max(0, localTime / TRANSITION_DURATION));
        applyTransitionOverlay(ctx, currentClip.transition, progress);
        }
      }
    },
    [normalizedTimeline, mediaLibrary],
  );

  useEffect(() => {
    if (!playerState.isPlaying) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const audioEl = audioRef.current;
    if (!canvas || !ctx || !audioEl) return;

    const loop = () => {
      if (!audioEl.paused) {
        renderFrame(ctx, audioEl.currentTime);
        setPlayerState((state) => ({ ...state, currentTime: audioEl.currentTime }));
        animationRef.current = requestAnimationFrame(loop);
      } else {
        renderFrame(ctx, audioEl.currentTime);
        setPlayerState((state) => ({ ...state, isPlaying: false }));
      }
    };

    animationRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [playerState.isPlaying, renderFrame]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    renderFrame(ctx, 0);
  }, [renderFrame, activeAudio?.id]);

  const handlePlayToggle = () => {
    if (!audioRef.current) return;
    if (playerState.isPlaying) {
      audioRef.current.pause();
      setPlayerState((state) => ({ ...state, isPlaying: false }));
    } else {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      setPlayerState((state) => ({ ...state, isPlaying: true, currentTime: 0 }));
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      const metadata = await getMediaMetadata(file);
      const mediaUrl = metadata.url ?? URL.createObjectURL(file);
      const asset: MediaAsset = {
        id: crypto.randomUUID(),
        name: file.name,
        kind: file.type.startsWith("image") ? "image" : "video",
        url: mediaUrl,
        duration: metadata.duration ?? 6,
        file,
      };
      addMedia(asset);
    }
    event.target.value = "";
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const oldIndex = timeline.findIndex((clip) => clip.id === activeId);
    const newIndex = timeline.findIndex((clip) => clip.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(timeline, oldIndex, newIndex);
    setTimeline(normalizeTimeline(reordered));
  };

  const handleAddToTimeline = (asset: MediaAsset) => {
    const total = timeline.reduce((acc, clip) => acc + clip.duration, 0);
    const duration =
      asset.kind === "image"
        ? Math.max(4, Math.min(12, asset.duration ?? 6))
        : asset.duration ?? 8;
    const clip: TimelineClip = {
      id: crypto.randomUUID(),
      mediaId: asset.id,
      start: total,
      duration,
      transition: timeline.length === 0 ? "fade-in" : "nenhuma",
    };
    setTimeline(normalizeTimeline([...timeline, clip]));
  };

  const handleApplySimpleImage = (asset: MediaAsset) => {
    if (!activeAudio) return;
    const totalDuration = activeAudio.durationSeconds || activeAudio.durationEstimateSeconds;
    const clip: TimelineClip = {
      id: crypto.randomUUID(),
      mediaId: asset.id,
      start: 0,
      duration: Math.max(1, totalDuration),
      transition: "fade-in",
    };
    setTimeline([clip]);
  };

  const handleExport = async () => {
    if (!canvasRef.current || !activeAudio || !timeline.length) return;
    if (!audioRef.current) return;

    const canvasStream = canvasRef.current.captureStream(30);
    const audioElement = audioRef.current;
    const audioContext = new AudioContext();
    const sourceNode = audioContext.createMediaElementSource(audioElement);
    const destinationNode = audioContext.createMediaStreamDestination();
    sourceNode.connect(destinationNode);
    sourceNode.connect(audioContext.destination);

    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destinationNode.stream.getAudioTracks(),
    ]);

    const recorder = new MediaRecorder(combinedStream, {
      mimeType: "video/webm;codecs=vp9,opus",
      videoBitsPerSecond: 4_000_000,
    });

    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const voiceLabel =
        voiceLibrary.find((voice) => voice.id === activeAudio.settings.voiceId)?.label ?? "voz";
      link.download = `aurora-video-${voiceLabel.toLowerCase()}-${Date.now()}.webm`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      audioElement.pause();
      audioElement.currentTime = 0;
      setPlayerState((state) => ({ ...state, isExporting: false, isPlaying: false, currentTime: 0 }));
    };

    setPlayerState((state) => ({ ...state, isExporting: true, isPlaying: true }));
    audioElement.currentTime = 0;
    await audioContext.resume();
    recorder.start(1000 / 30);
    await audioElement.play();

    const ctx = canvasRef.current.getContext("2d");
    const renderLoop = () => {
      if (!ctx) return;
      if (!audioElement.paused) {
        renderFrame(ctx, audioElement.currentTime);
        animationRef.current = requestAnimationFrame(renderLoop);
      } else {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        recorder.stop();
        sourceNode.disconnect();
        destinationNode.disconnect();
        audioContext.close();
      }
    };

    animationRef.current = requestAnimationFrame(renderLoop);
  };

  const handleRemoveClip = (id: string) => {
    const filtered = timeline.filter((clip) => clip.id !== id);
    setTimeline(normalizeTimeline(filtered));
  };

  const handleDurationChange = (id: string, duration: number) => {
    const updated = timeline.map((clip) =>
      clip.id === id ? { ...clip, duration } : clip,
    );
    setTimeline(normalizeTimeline(updated));
  };

  const handleTransitionChange = (id: string, transition: TransitionType) => {
    const updated = timeline.map((clip) =>
      clip.id === id ? { ...clip, transition } : clip,
    );
    setTimeline(updated);
  };

  const handleRemoveMedia = (asset: MediaAsset) => {
    removeMedia(asset.id);
    URL.revokeObjectURL(asset.url);
  };

  const handleModeChange = (value: ComposerMode) => {
    setMode(value);
    if (value === "simples" && timeline.length > 1) {
      setTimeline(timeline.slice(0, 1));
    }
  };

  return (
    <section className="rounded-3xl border border-white/5 bg-gradient-to-br from-slate-950 via-slate-900/80 to-slate-950 p-10 shadow-2xl shadow-purple-900/30">
      <header className="flex flex-col gap-3 pb-8">
        <span className="text-sm uppercase tracking-[0.4em] text-purple-300/70">
          Módulo 2
        </span>
        <h2 className="text-3xl font-semibold text-white md:text-4xl">
          Video Composer com Timeline Inteligente
        </h2>
        <p className="max-w-3xl text-base text-slate-200/85">
          Construa vídeos completos com áudio sincronizado, biblioteca de mídia drag-and-drop, timeline com transições
          cinematográficas e exportação em alta definição pronta para publicação.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <span className="text-xs uppercase tracking-[0.4em] text-slate-300/70">
          Modo de edição
        </span>
        <div className="flex gap-2">
          {(["simples", "avançado"] as ComposerMode[]).map((option) => {
            const isActive = mode === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => handleModeChange(option)}
                className={`rounded-full px-4 py-2 text-xs uppercase tracking-[0.4em] transition ${
                  isActive
                    ? "bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 text-white shadow-[0_0_30px_rgba(160,90,255,0.4)]"
                    : "border border-white/10 bg-slate-900/70 text-slate-200/80 hover:border-purple-400/40"
                }`}
              >
                {option === "simples" ? "Modo simples" : "Modo avançado"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <h3 className="text-lg font-semibold text-white">Trilha de áudio</h3>
            <p className="text-sm text-slate-300/75">
              Utilize qualquer locução gerada para sincronizar a composição visual.
            </p>
            <div className="mt-4 space-y-3">
              {audios.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-200/70">
                  Gere uma locução no módulo 1 para ativar a timeline.
                </div>
              )}
              {audios.map((audio) => {
                const isActive = activeAudio?.id === audio.id;
                return (
                  <button
                    key={audio.id}
                    type="button"
                    className={`flex w-full flex-col gap-2 rounded-xl border p-4 text-left transition ${
                      isActive
                        ? "border-purple-400/60 bg-purple-500/10"
                        : "border-white/10 bg-white/5 hover:border-purple-300/40"
                    }`}
                    onClick={() => setActiveAudio(audio.id)}
                  >
                    <span className="text-sm font-semibold text-white">{audio.name}</span>
                    <span className="text-xs text-slate-300/70">
                      {audio.durationSeconds.toFixed(1)}s •{" "}
                      {voiceLibrary.find((voice) => voice.id === audio.settings.voiceId)?.label ?? "Voz"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold text-white">Biblioteca de mídia</h3>
              <p className="text-sm text-slate-300/75">
                Faça upload de imagens (JPG, PNG, WebP) e vídeos (MP4, WebM). Arraste para composição.
              </p>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/5 p-6 text-sm text-slate-200/80 transition hover:border-purple-400/50">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-300/60">
                  Upload de mídia
                </span>
                <span className="text-sm text-slate-300/80">
                  Arraste arquivos ou clique para selecionar
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                  onChange={handleUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="mt-6 grid gap-4">
              {mediaLibrary.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-200/70">
                  Sua biblioteca ficará disponível aqui para arrastar e montar a sequência.
                </div>
              )}
              {mediaLibrary.map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-20 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                      {asset.kind === "image" ? (
                        <NextImage
                          src={asset.url}
                          alt={asset.name}
                          width={160}
                          height={112}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <video
                          src={asset.url}
                          className="h-full w-full object-cover"
                          muted
                          loop
                          playsInline
                        />
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">{asset.name}</h4>
                      <span className="text-xs text-slate-300/70">
                        {asset.kind === "image" ? "Imagem" : "Vídeo"} •{" "}
                        {(asset.duration ?? 6).toFixed(1)}s
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {mode === "simples" ? (
                      <button
                        type="button"
                        onClick={() => handleApplySimpleImage(asset)}
                        className="rounded-full border border-blue-400/50 px-4 py-2 text-xs uppercase tracking-[0.35em] text-blue-100 transition hover:shadow-[0_0_25px_rgba(88,141,255,0.45)]"
                      >
                        Aplicar ao áudio
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddToTimeline(asset)}
                        className="rounded-full border border-blue-400/50 px-4 py-2 text-xs uppercase tracking-[0.35em] text-blue-100 transition hover:shadow-[0_0_25px_rgba(88,141,255,0.45)]"
                      >
                        Enviar para timeline
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveMedia(asset)}
                      className="rounded-full border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.35em] text-slate-200/70 transition hover:border-red-400/50 hover:text-red-200"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Timeline</h3>
                <p className="text-sm text-slate-300/75">
                  Reordene, ajuste duração e configure transições para cada take.
                </p>
              </div>
              <span className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.4em] text-slate-200/70">
                {compositionDuration.toFixed(1)}s
              </span>
            </div>

            <div className="mt-6 space-y-4">
              <AnimatePresence initial={false}>
                {timeline.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    className="rounded-xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-200/70"
                  >
                    Sua timeline está vazia. Adicione mídia para começar a storyboard.
                  </motion.div>
                )}
              </AnimatePresence>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={timeline.map((clip) => clip.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-4">
                    {timeline.map((clip) => (
                      <SortableClipCard
                        key={clip.id}
                        clip={clip}
                        media={mediaLibrary.find((asset) => asset.id === clip.mediaId)}
                        onRemove={() => handleRemoveClip(clip.id)}
                        onDurationChange={(value) => handleDurationChange(clip.id, value)}
                        onTransitionChange={(value) => handleTransitionChange(clip.id, value)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {durationMismatch && (
                <div className="rounded-xl border border-amber-400/50 bg-amber-500/10 p-4 text-sm text-amber-100">
                  A duração total dos takes ({compositionDuration.toFixed(1)}s) não corresponde ao áudio (
                  {(activeAudio?.durationSeconds ?? 0).toFixed(1)}s). Ajuste as durações para sincronizar.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Preview & Export</h3>
                <p className="text-sm text-slate-300/75">
                  Visualize o resultado final com transições e exporte em alta definição (WebM 4Mbps).
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handlePlayToggle}
                  disabled={!activeAudio || !timeline.length || playerState.isExporting}
                  className="rounded-full border border-white/10 px-5 py-2 text-xs uppercase tracking-[0.35em] text-slate-100 transition hover:border-green-400/50 disabled:opacity-50"
                >
                  {playerState.isPlaying ? "Pausar preview" : "Preview"}
                </button>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={!activeAudio || !timeline.length || playerState.isExporting}
                  className="rounded-full border border-purple-400/60 px-5 py-2 text-xs uppercase tracking-[0.35em] text-purple-100 transition hover:shadow-[0_0_30px_rgba(160,90,255,0.45)] disabled:opacity-50"
                >
                  {playerState.isExporting ? "Renderizando..." : "Exportar vídeo"}
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/70">
                <canvas
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  className="aspect-video w-full bg-[#04050B]"
                />
              </div>
              <audio ref={audioRef} src={activeAudio?.url} className="hidden" />
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.35em] text-slate-300/70">
                <span>Tempo atual: {playerState.currentTime.toFixed(1)}s</span>
                <span>Total: {(activeAudio?.durationSeconds ?? 0).toFixed(1)}s</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
