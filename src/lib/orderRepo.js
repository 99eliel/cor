import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';

export async function createOrder(data) {
  const result = await addDoc(collection(db, 'orders'), {
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  return result.id;
}

export async function listOrders() {
  const snapshot = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function setOrderCompleted(orderId, completed) {
  await updateDoc(doc(db, 'orders', orderId), {
    status: completed ? 'completed' : 'pending',
    completedAt: completed ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
}

export async function saveOrderQuote(orderId, quote) {
  await updateDoc(doc(db, 'orders', orderId), {
    quote: {
      unitPrice: Number(quote.unitPrice) || 0,
      estimatedTime: quote.estimatedTime || '',
      notes: quote.notes || '',
      total: Number(quote.total) || 0,
      generatedAt: new Date().toISOString(),
    },
    updatedAt: serverTimestamp(),
  });
}

export async function deleteOrder(orderId) {
  await deleteDoc(doc(db, 'orders', orderId));
}
