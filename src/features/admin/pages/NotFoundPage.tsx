import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-sm py-3xl text-center">
      <h1 className="text-2xl font-semibold text-text-primary">Page not found</h1>
      <p className="text-sm text-text-secondary">The page you're looking for doesn't exist.</p>
      <Link to="/" className="text-sm text-primary hover:underline">
        Back to Executive Overview
      </Link>
    </div>
  );
}
