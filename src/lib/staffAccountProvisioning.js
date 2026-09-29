import { deleteApp, getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  inMemoryPersistence,
  sendPasswordResetEmail,
  setPersistence,
  signOut,
} from 'firebase/auth';
import { auth, firebaseConfig } from './firebase';
import { saveStaffProfile } from './staffRepo';

const PROVISIONING_APP_NAME = 'martinpel-staff-provisioning';

function cleanEmailAddress(value) {
  return String(value || '').trim().toLowerCase();
}

function randomTemporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let random = '';
  for (const byte of bytes) random += alphabet[byte % alphabet.length];
  return `Mp!${random}7a`;
}

function authErrorMessage(error) {
  const code = error?.code || '';
  if (code === 'auth/email-already-in-use') {
    return 'Já existe uma conta de acesso com este e-mail. Se ela já aparece na equipe, use “Enviar nova senha”.';
  }
  if (code === 'auth/invalid-email') return 'Informe um e-mail válido.';
  if (code === 'auth/operation-not-allowed') {
    return 'O login por E-mail/Senha ainda não está habilitado no Firebase Authentication.';
  }
  if (code === 'auth/too-many-requests') {
    return 'O Firebase bloqueou temporariamente novas tentativas. Aguarde alguns minutos e tente novamente.';
  }
  return error?.message || 'Não foi possível criar a conta do funcionário.';
}

function getProvisioningApp() {
  return getApps().find((item) => item.name === PROVISIONING_APP_NAME)
    || initializeApp(firebaseConfig, PROVISIONING_APP_NAME);
}

export async function createStaffAccount({ name, email, role, active = true }) {
  const cleanEmail = cleanEmailAddress(email);
  if (!String(name || '').trim()) throw new Error('Informe o nome do funcionário.');
  if (!cleanEmail || !cleanEmail.includes('@')) throw new Error('Informe um e-mail válido.');

  const provisioningApp = getProvisioningApp();
  const provisioningAuth = getAuth(provisioningApp);
  let createdUser = null;

  try {
    await setPersistence(provisioningAuth, inMemoryPersistence);
    const credential = await createUserWithEmailAndPassword(
      provisioningAuth,
      cleanEmail,
      randomTemporaryPassword(),
    );
    createdUser = credential.user;

    try {
      await saveStaffProfile(createdUser.uid, {
        name: String(name || '').trim(),
        email: cleanEmail,
        role,
        active,
      });
    } catch (error) {
      await deleteUser(createdUser).catch(() => {});
      createdUser = null;
      throw error;
    }

    let resetEmailSent = true;
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
    } catch {
      resetEmailSent = false;
    }

    return {
      uid: createdUser.uid,
      email: cleanEmail,
      resetEmailSent,
    };
  } catch (error) {
    throw new Error(authErrorMessage(error));
  } finally {
    try { await signOut(provisioningAuth); } catch {}
    try { await deleteApp(provisioningApp); } catch {}
  }
}

export async function sendStaffPasswordReset(email) {
  const cleanEmail = cleanEmailAddress(email);
  if (!cleanEmail || !cleanEmail.includes('@')) throw new Error('Este funcionário não possui um e-mail válido cadastrado.');

  try {
    await sendPasswordResetEmail(auth, cleanEmail);
    return cleanEmail;
  } catch (error) {
    throw new Error(authErrorMessage(error));
  }
}
