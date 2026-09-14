import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function validateImage(file) {
  if (!file) throw new Error('Selecione uma imagem.');
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('Use PNG, JPG ou WEBP.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('A imagem deve ter no máximo 5 MB.');
}

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function uploadGarmentImage(file, garmentId, view) {
  validateImage(file);
  const objectRef = ref(storage, `garments/${garmentId}/${view}-${Date.now()}-${safeName(file.name)}`);
  await uploadBytes(objectRef, file, { contentType: file.type });
  return getDownloadURL(objectRef);
}

export async function uploadClientLogo(file, uid) {
  validateImage(file);
  const objectRef = ref(storage, `logos/${uid}/${Date.now()}-${safeName(file.name)}`);
  await uploadBytes(objectRef, file, { contentType: file.type });
  return getDownloadURL(objectRef);
}

export async function uploadFinalRender(blob, uid) {
  if (!blob || blob.size > 10 * 1024 * 1024) throw new Error('Render final inválido.');
  const objectRef = ref(storage, `final-renders/${uid}/${Date.now()}.png`);
  await uploadBytes(objectRef, blob, { contentType: 'image/png' });
  return getDownloadURL(objectRef);
}
