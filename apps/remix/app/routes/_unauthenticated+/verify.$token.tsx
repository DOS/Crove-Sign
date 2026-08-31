import { redirect } from 'react-router';

export function loader({ params }: { params: { token?: string } }) {
  const { token } = params;
  if (!token) {
    throw redirect('/verify');
  }

  // Redirect to verify overview with token param
  throw redirect(`/verify?token=${encodeURIComponent(token)}`);
}

export default function VerifyTokenPage() {
  return null;
}
