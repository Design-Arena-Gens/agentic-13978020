import { TextToSpeechModule } from "@/components/TextToSpeechModule";
import { VideoComposerModule } from "@/components/VideoComposerModule";

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(92,144,255,0.25),_transparent_55%)]" />
        <div className="absolute -left-32 top-32 h-72 w-72 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="absolute right-0 top-72 h-[420px] w-[420px] rounded-full bg-purple-500/30 blur-3xl" />
      </div>
      <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-16 px-6 pb-24 pt-20 md:px-10">
        <header className="flex flex-col gap-6">
          <span className="w-fit rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.4em] text-blue-200/80">
            Aurora Studio
          </span>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-white md:text-5xl">
            Plataforma completa de produção audiovisual com inteligência criativa ponta a ponta.
          </h1>
          <p className="max-w-2xl text-base text-slate-200/85">
            Converta roteiros extensos em locuções premium, pilote emoções e timbres avançados e componha narrativas visuais com um editor visual inspirado em estúdios profissionais.
          </p>
          <div className="flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.35em] text-slate-300/70">
            <span>MP3 320kbps</span>
            <span>Timeline inteligente</span>
            <span>Exportação 4Mbps WebM</span>
            <span>Transições cinematográficas</span>
          </div>
        </header>

        <TextToSpeechModule />
        <VideoComposerModule />
      </main>
    </div>
  );
}
