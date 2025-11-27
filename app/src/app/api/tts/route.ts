import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { Readable } from "stream";

import { voiceLibrary } from "@/lib/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

const requestSchema = z.object({
  text: z.string().min(1, "O texto é obrigatório.").max(100_000),
  voiceId: z.string(),
  speed: z.number().min(0.5).max(2),
  pitch: z.number().min(-10).max(10),
  emotion: z.string(),
});

function findVoice(voiceId: string) {
  return voiceLibrary.find((voice) => voice.id === voiceId);
}

function splitTempoRatio(ratio: number): number[] {
  const factors: number[] = [];
  let rest = ratio;
  while (rest > 2) {
    factors.push(2);
    rest /= 2;
  }
  while (rest < 0.5) {
    factors.push(0.5);
    rest /= 0.5;
  }
  if (Math.abs(rest - 1) > 1e-6) {
    factors.push(rest);
  }
  return factors;
}

function buildFilters(speed: number, pitch: number) {
  const filters: string[] = [];
  const pitchFactor = Math.pow(2, pitch / 12);
  const baseSampleRate = 44100;

  if (Math.abs(pitch) > 0.01) {
    filters.push(`asetrate=${baseSampleRate * pitchFactor}`);
    filters.push(`aresample=${baseSampleRate}`);
    const correction = splitTempoRatio(1 / pitchFactor);
    correction.forEach((factor) => filters.push(`atempo=${factor.toFixed(5)}`));
  }

  if (Math.abs(speed - 1) > 0.01) {
    const tempoFactors = splitTempoRatio(speed);
    tempoFactors.forEach((factor) => filters.push(`atempo=${factor.toFixed(5)}`));
  }

  return filters;
}

async function processAudio(
  buffer: Buffer,
  speed: number,
  pitch: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const filters = buildFilters(speed, pitch);
    const chunks: Buffer[] = [];
    const stream = Readable.from(buffer);

    const command = ffmpeg(stream).inputFormat("wav");

    if (filters.length) {
      command.audioFilters(filters);
    }

    command
      .audioCodec("libmp3lame")
      .audioBitrate("320k")
      .format("mp3")
      .on("error", (error) => reject(error))
      .on("end", () => resolve(Buffer.concat(chunks)));

    const output = command.pipe();

    output.on("data", (chunk) => chunks.push(chunk));
    output.on("error", (error) => reject(error));
  });
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY não definido. Configure a variável de ambiente para utilizar o conversor.",
        },
        { status: 500 },
      );
    }

    const body = await request.json();
    const parseResult = requestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { text, voiceId, speed, pitch } = parseResult.data;
    const voice = findVoice(voiceId);

    if (!voice) {
      return NextResponse.json(
        { error: "Voz selecionada não encontrada." },
        { status: 404 },
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: voice.voiceId,
      input: text,
      response_format: "wav",
      speed: 1,
    });

    const arrayBuffer = await response.arrayBuffer();
    const wavBuffer = Buffer.from(arrayBuffer);
    const mp3Buffer = await processAudio(wavBuffer, speed, pitch);
    const base64 = mp3Buffer.toString("base64");

    return NextResponse.json({
      audio: base64,
      mimeType: "audio/mpeg",
      fileName: `aurora-${voice.id}-${Date.now()}.mp3`,
      durationEstimateSeconds: Math.ceil(text.length / 18 / speed),
    });
  } catch (error) {
    console.error("[TTS_ERROR]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao processar o áudio.",
      },
      { status: 500 },
    );
  }
}
