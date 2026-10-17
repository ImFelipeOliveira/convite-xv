export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <span
        aria-hidden="true"
        className="font-script text-7xl text-seal"
        style={{ fontFamily: "var(--font-pinyon), cursive" }}
      >
        I
      </span>
      <p className="max-w-xs text-lg text-wine">
        Este convite é pessoal. Use o link que você recebeu.
      </p>
    </main>
  );
}
