import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

const ORDER_CACHE_MS = 10 * 1000;
const DEFAULT_ORDER_LIMIT = 80;
let orderCache = { at: 0, maxItems: 0, items: null };

function invalidateOrderCache() {
  orderCache = { at: 0, maxItems: 0, items: null };
}

function lightweightDesignSnapshot(data) {
  return {
    garmentId: data.garmentId,
    garmentName: data.garmentName,
    colorChoices: data.colorChoices ?? {},
    logos: data.logos ?? [],
    sizeGrid: data.sizeGrid ?? {},
    quantity: data.quantity ?? null,
    notes: data.notes ?? '',
  };
}

function approvalToken() {
  const random = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${random.replace(/[^a-zA-Z0-9-]/g, '')}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function createOrder(data) {
  const now = new Date();
  const expireAt = Timestamp.fromDate(new Date(now.getTime() + (90 * 24 * 60 * 60 * 1000)));
  const snapshot = lightweightDesignSnapshot(data);
  const token = approvalToken();
  const orderRef = doc(collection(db, 'orders'));
  const previewRef = doc(db, 'approvalPreviews', token);
  const batch = writeBatch(db);

  batch.set(orderRef, {
    ...data,
    status: 'pending',
    approvalStatus: 'pending',
    approvalToken: token,
    designVersion: 1,
    designHistory: [{
      version: 1,
      savedAt: now.toISOString(),
      ...snapshot,
    }],
    productionChecklist: {
      garmentChecked: false,
      colorsChecked: false,
      logosChecked: false,
      sizesChecked: false,
      finalChecked: false,
    },
    expireAt,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(previewRef, {
    orderId: orderRef.id,
    customerName: data.customerName || '',
    garmentName: data.garmentName || data.garmentId || '',
    quantity: Number(data.quantity) || 0,
    designVersion: 1,
    finalImageUrl: data.finalImageUrl || '',
    sellerUid: data.sellerUid || '',
    status: 'pending',
    expireAt,
    createdAt: serverTimestamp(),
  });

  await batch.commit();
  invalidateOrderCache();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('martinpel:order-created', {
      detail: { id: orderRef.id, approvalToken: token },
    }));
  }

  return orderRef.id;
}

export async function listOrders({ force = false, maxItems = DEFAULT_ORDER_LIMIT } = {}) {
  if (
    !force
    && orderCache.items
    && orderCache.maxItems >= maxItems
    && Date.now() - orderCache.at < ORDER_CACHE_MS
  ) {
    return orderCache.items.slice(0, maxItems);
  }

  const snapshot = await getDocs(query(
    collection(db, 'orders'),
    orderBy('createdAt', 'desc'),
    limit(maxItems),
  ));
  const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  orderCache = { at: Date.now(), maxItems, items };
  return items;
}

export async function setOrderStatus(orderId, status) {
  const allowed = new Set(['pending', 'quoted', 'approval', 'approved', 'production', 'quality', 'ready', 'completed']);
  if (!allowed.has(status)) throw new Error('Status de pedido inválido.');

  await updateDoc(doc(db, 'orders', orderId), {
    status,
    completedAt: status === 'completed' ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
  invalidateOrderCache();
}

export async function setOrderCompleted(orderId, completed) {
  return setOrderStatus(orderId, completed ? 'completed' : 'pending');
}

export async function saveProductionChecklist(orderId, checklist) {
  await updateDoc(doc(db, 'orders', orderId), {
    productionChecklist: {
      garmentChecked: Boolean(checklist.garmentChecked),
      colorsChecked: Boolean(checklist.colorsChecked),
      logosChecked: Boolean(checklist.logosChecked),
      sizesChecked: Boolean(checklist.sizesChecked),
      finalChecked: Boolean(checklist.finalChecked),
    },
    updatedAt: serverTimestamp(),
  });
  invalidateOrderCache();
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
  invalidateOrderCache();
}

export async function deleteOrder(orderId) {
  await deleteDoc(doc(db, 'orders', orderId));
  invalidateOrderCache();
}
