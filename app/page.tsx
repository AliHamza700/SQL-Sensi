import { redirect } from 'next/navigation';

/**
 * Root page — redirects to login.
 * Authentication guard will be added in Phase 2.
 */
export default function RootPage() {
  redirect('/login');
}
