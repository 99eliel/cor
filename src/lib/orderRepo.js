import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export async function createOrder(data) {
  const result = await addDoc(collection(db, 'orders'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return result.id;
}
