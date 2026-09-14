import { signInAnonymously } from 'firebase/auth';
import { auth } from './firebase';

export async function ensureClientUser() {
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}
