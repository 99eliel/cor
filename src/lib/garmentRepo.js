import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

function serializeRegions(regions = []) {
  return regions.map((region) => ({
    ...region,
    polygons: (region.polygons ?? []).map((polygon) => ({
      points: Array.isArray(polygon) ? polygon : (polygon?.points ?? []),
    })),
  }));
}

function deserializeRegions(regions = []) {
  return regions.map((region) => ({
    ...region,
    polygons: (region.polygons ?? []).map((polygon) => (
      Array.isArray(polygon) ? polygon : (Array.isArray(polygon?.points) ? polygon.points : [])
    )),
  }));
}

function normalizeGarment(id, data) {
  return {
    id,
    ...data,
    regions: deserializeRegions(data?.regions ?? []),
  };
}

export async function getGarment(id) {
  const snapshot = await getDoc(doc(db, 'garments', id));
  return snapshot.exists() ? normalizeGarment(snapshot.id, snapshot.data()) : null;
}

export async function listGarments() {
  const snapshot = await getDocs(query(collection(db, 'garments'), orderBy('name')));
  return snapshot.docs.map((item) => normalizeGarment(item.id, item.data()));
}

export async function saveGarment(id, data) {
  await setDoc(doc(db, 'garments', id), {
    ...data,
    regions: serializeRegions(data.regions ?? []),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function createGarmentId(name) {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'peca';
  return `${slug}-${Date.now().toString(36)}`;
}
