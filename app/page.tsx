import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-6">
      <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
        I&apos;m stuck on Mars
      </h1>
      <Button render={<a href="/api/health" />} variant="outline">
        API status
      </Button>
    </main>
  );
}
