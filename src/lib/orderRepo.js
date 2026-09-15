import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export async function createOrder(data) {
  const result = await addDoc(collection(db, 'orders'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return result.id;
}

export async function listOrders() {
  const snapshot = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}
