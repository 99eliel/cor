import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: 'AIzaSyCKdNkD-eQPEdxCCLyb1PZHaQlEAvZkE98',
  authDomain: 'app-da-cidade-7759b.firebaseapp.com',
  databaseURL: 'https://app-da-cidade-7759b-default-rtdb.firebaseio.com',
  projectId: 'app-da-cidade-7759b',
  storageBucket: 'app-da-cidade-7759b.firebasestorage.app',
  messagingSenderId: '819870324220',
  appId: '1:819870324220:web:6f49bb3fd35622686fce79',
  measurementId: 'G-0N7CTQM5G2',
};

const app = getApps()[0] ?? initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const isFirebaseConfigured = true;
export { app };
