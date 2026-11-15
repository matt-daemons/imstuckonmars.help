export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-foreground">
      <h1 className="font-heading text-2xl">Page not found</h1>
      <p>This address does not exist. Return to the mission map.</p>
      <a href="/" className="text-primary underline underline-offset-4">
        Return to mission map
      </a>
    </main>
  );
}
