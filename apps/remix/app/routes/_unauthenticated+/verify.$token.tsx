import { redirect } from 'react-router';
import type { Route } from './+types/verify.$token';

export function loader({ params }: Route.LoaderArgs) {
  const { token } = params;
  if (!token) {
    throw redirect('/verify');
  }

  // Redirect to document view if authenticated or to verify overview with token param
  throw redirect(`/verify?token=${encodeURIComponent(token)}`);
}

export default function VerifyTokenPage() {
  return null;
}
