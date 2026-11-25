import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <div className="text-5xl font-semibold text-brand">404</div>
        <h1 className="mt-2 text-xl font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted">It may have moved, or you may not have access to it.</p>
        <Link href="/dashboard" className="btn-primary mt-6">Back to dashboard</Link>
      </div>
    </div>
  );
}
