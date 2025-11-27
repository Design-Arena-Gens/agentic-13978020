"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { emotions, voiceLibrary } from "@/lib/voices";
import { base64ToBlob, getAudioDuration } from "@/utils/audio";
import { useAppStore } from "@/state/useAppStore";

type ProgressState = "idle" | "preparing" | "processing" | "finalizing";

const MAX_CHARACTERS = 100_000;

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function TextToSpeechModule() {
  const {
    audios,
    addAudio,
    activeAudioId,
    setActiveAudio,
  } = useAppStore((state) => ({
    audios: state.audios,
    addAudio: state.addAudio,
    activeAudioId: state.activeAudioId,
    setActiveAudio: state.setActiveAudio,
  }));
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState(voiceLibrary[0].id);
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [emotion, setEmotion] = useState(voiceLibrary[0].defaultEmotion);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<ProgressState>("idle");
  const [error, setError] = useState<string | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
      }
    };
  }, []);

  const groupedVoices = useMemo(() => {
    return {
      masculino: voiceLibrary.filter((voice) => voice.gender === "masculino"),
      feminino: voiceLibrary.filter((voice) => voice.gender === "feminino"),
    };
  }, []);

  const currentVoice = useMemo(
    () => voiceLibrary.find((voice) => voice.id === voiceId) ?? voiceLibrary[0],
    [voiceId],
  );

  useEffect(() => {
    setEmotion(currentVoice.defaultEmotion);
  }, [currentVoice]);

  const beginProgress = () => {
    setProgress(10);
    setStatus("preparing");
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => {
      setProgress((value) => {
        if (value >= 85) {
          if (progressTimer.current) clearInterval(progressTimer.current);
          return value;
        }
        const increment = Math.random() * 5;
        return Math.min(value + increment, 85);
      });
    }, 500);
  };

  const finalizeProgress = () => {
    if (progressTimer.current) clearInterval(progressTimer.current);
    setStatus("finalizing");
    setProgress(100);
    setTimeout(() => setStatus("idle"), 800);
  };

  const handleSubmit = async () => {
    if (!text.trim()) {
      setError("Informe um texto para gerar a locução.");
      return;
    }
    if (text.length > MAX_CHARACTERS) {
      setError(`O texto deve ter no máximo ${MAX_CHARACTERS.toLocaleString("pt-BR")} caracteres.`);
      return;
    }

    try {
      setError(null);
      beginProgress();

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          voiceId,
          speed,
          pitch,
          emotion,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Não foi possível processar o áudio. Tente novamente.",
        );
      }

      setStatus("processing");
      const payload = await response.json();

      const blob = base64ToBlob(payload.audio, payload.mimeType);
      const url = URL.createObjectURL(blob);
      const durationSeconds = await getAudioDuration(blob);

      addAudio({
        id: crypto.randomUUID(),
        name: payload.fileName,
        blob,
        url,
        durationEstimateSeconds: payload.durationEstimateSeconds,
        durationSeconds,
        createdAt: Date.now(),
        settings: {
          emotion,
          pitch,
          speed,
          voiceId,
        },
      });

      finalizeProgress();
    } catch (err) {
      if (progressTimer.current) clearInterval(progressTimer.current);
      setStatus("idle");
      setProgress(0);
      setError(err instanceof Error ? err.message : "Erro inesperado. Tente novamente.");
    }
  };

  return (
    <section className="rounded-3xl border border-white/5 bg-white/5 p-10 shadow-2xl shadow-blue-900/20 backdrop-blur-2xl">
      <header className="flex flex-col gap-3 pb-8">
        <span className="text-sm uppercase tracking-[0.4em] text-blue-300/70">
          Módulo 1
        </span>
        <h2 className="text-3xl font-semibold text-white md:text-4xl">
          Conversão Texto-para-Áudio Premium
        </h2>
        <p className="max-w-2xl text-base text-slate-200/80">
          Gere locuções cinematográficas com vozes premium, controle de emoção, pitch, velocidade e exportação MP3 em 320kbps.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr),minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <label className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-100">Script</span>
              <span className="text-slate-300/70">
                {text.length.toLocaleString("pt-BR")} / {MAX_CHARACTERS.toLocaleString("pt-BR")}
              </span>
            </div>
            <textarea
              placeholder="Cole seu roteiro completo aqui (até 100.000 caracteres)..."
              className="min-h-[220px] rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-sm text-slate-100 outline-none transition focus:border-blue-400/80 focus:ring-2 focus:ring-blue-400/40"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </label>

          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Biblioteca de Vozes</h3>
                <p className="text-sm text-slate-300/70">
                  Escolha entre vozes masculinas e femininas com curadoria profissional.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              {(["masculino", "feminino"] as const).map((gender) => (
                <div key={gender} className="space-y-3">
                  <h4 className="text-xs uppercase tracking-[0.3em] text-slate-400/70">
                    {gender === "masculino" ? "Masculinas" : "Femininas"}
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {groupedVoices[gender].map((voice) => {
                      const isActive = voice.id === voiceId;
                      return (
                        <button
                          key={voice.id}
                          type="button"
                          onClick={() => setVoiceId(voice.id)}
                          className={`group flex flex-col gap-2 rounded-2xl border bg-gradient-to-br p-4 text-left transition ${isActive ? "border-blue-400/60 from-blue-500/30 to-blue-400/10 shadow-lg shadow-blue-900/40" : "border-white/5 from-slate-800/80 to-slate-900/40 hover:border-blue-300/40 hover:shadow-lg hover:shadow-blue-900/20"}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-base font-semibold text-white">
                              {voice.label}
                            </span>
                            <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-widest text-slate-200/70">
                              {voice.tone}
                            </span>
                          </div>
                          <p className="text-sm text-slate-300/80">{voice.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="flex justify-between text-sm text-slate-300/80">
                <span className="font-medium text-slate-100">Velocidade</span>
                <span>{speed.toFixed(2)}x</span>
              </label>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.01}
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
                className="accent-blue-400"
              />
              <p className="text-xs text-slate-400/70">Controle fino de 0.5x até 2.0x.</p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex justify-between text-sm text-slate-300/80">
                <span className="font-medium text-slate-100">Pitch / Tom</span>
                <span>{pitch.toFixed(0)}</span>
              </label>
              <input
                type="range"
                min={-10}
                max={10}
                step={1}
                value={pitch}
                onChange={(event) => setPitch(Number(event.target.value))}
                className="accent-purple-400"
              />
              <p className="text-xs text-slate-400/70">
                Ajuste de -10 a +10 semitons para adaptar timbre e impacto.
              </p>
            </div>
            <div className="md:col-span-2">
              <span className="text-sm font-medium text-slate-100">Emoção</span>
              <div className="mt-3 flex flex-wrap gap-2">
                {emotions.map((item) => {
                  const isActive = emotion === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setEmotion(item.id)}
                      className={`rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] transition ${isActive ? "bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 text-white shadow-[0_0_30px_rgba(76,106,255,0.35)]" : "border border-white/10 bg-white/5 text-slate-200/80 hover:border-blue-400/40"}`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col gap-4 rounded-2xl border border-blue-400/30 bg-blue-500/10 p-6">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-200/80">
                Exportação MP3 320kbps
              </span>
              <p className="text-sm text-slate-200/80">
                Processamento assíncrono otimizado com codificação em alta fidelidade e metadados prontos para distribuição profissional.
              </p>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-blue-500/20">
              <motion.div
                className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500"
                animate={{ width: `${progress}%` }}
                transition={{ ease: "easeInOut", duration: 0.3 }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-blue-100/80">
              <span>
                Status:{" "}
                {status === "idle"
                  ? "Pronto para gerar"
                  : status === "preparing"
                    ? "Preparando síntese..."
                    : status === "processing"
                      ? "Processando e refinando áudio..."
                      : "Finalizando saída em 320kbps..."}
              </span>
              <span>{progress.toFixed(0)}%</span>
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={status !== "idle"}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 px-6 py-3 text-sm font-semibold uppercase tracking-[0.4em] text-white shadow-[0_12px_40px_rgba(66,105,255,0.35)] transition hover:shadow-[0_18px_50px_rgba(66,105,255,0.55)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Gerar locução
            </button>
          </div>
        </div>

        <aside className="flex flex-col gap-6">
          <div className="rounded-3xl border border-white/5 bg-slate-900/80 p-6 shadow-inner shadow-black/50">
            <h3 className="text-lg font-semibold text-white">Renderizações recentes</h3>
            <p className="text-sm text-slate-300/80">
              Gerencie suas locuções e envie rapidamente para o módulo de vídeo.
            </p>
            <div className="mt-5 space-y-4">
              <AnimatePresence initial={false}>
                {audios.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-300/70"
                  >
                    Seus áudios aparecerão aqui após a conversão.
                  </motion.div>
                )}

                {audios.map((audio) => {
                  const isActive = audio.id === activeAudioId;
                  return (
                    <motion.div
                      key={audio.id}
                      layout
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -16 }}
                      className={`flex flex-col gap-3 rounded-2xl border p-4 transition ${isActive ? "border-blue-400/50 bg-blue-500/10" : "border-white/10 bg-slate-900/70 hover:border-blue-300/40"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-white">
                            {audio.name}
                          </span>
                          <span className="text-xs text-slate-300/70">
                            {formatDuration(audio.durationSeconds)} •{" "}
                            {voiceLibrary.find((voice) => voice.id === audio.settings.voiceId)?.label ?? "Voz customizada"}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-slate-200/70 transition hover:border-blue-400/50"
                          onClick={() => setActiveAudio(audio.id)}
                        >
                          {isActive ? "Seleção ativa" : "Utilizar"}
                        </button>
                      </div>
                      <audio controls src={audio.url} className="w-full rounded-xl" />
                      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.3em] text-slate-400/80">
                        <span>Vel {audio.settings.speed.toFixed(2)}x</span>
                        <span>Pitch {audio.settings.pitch}</span>
                        <span>Emoção {audio.settings.emotion}</span>
                        <span>
                          Exportação: 320kbps • {new Date(audio.createdAt).toLocaleTimeString("pt-BR")}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
