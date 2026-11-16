import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore, type Firestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const typedConfig = firebaseConfig as {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
};

const app = initializeApp(typedConfig);
export const auth = getAuth(app);
export const db: Firestore | null = typedConfig.firestoreDatabaseId
  ? getFirestore(app, typedConfig.firestoreDatabaseId)
  : getFirestore(app);

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

const googleLoginProvider = new GoogleAuthProvider();
googleLoginProvider.setCustomParameters({ prompt: 'select_account' });

const workspaceProvider = new GoogleAuthProvider();
for (const scope of WORKSPACE_SCOPES) {
  workspaceProvider.addScope(scope);
}
workspaceProvider.setCustomParameters({ prompt: 'consent select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<void> {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore hors ligne : bascule sur le mode local.');
    }
  }
}

export async function signInWithGooglePopup(): Promise<string> {
  const result = await signInWithPopup(auth, googleLoginProvider);
  return result.user.getIdToken(true);
}

// Stockage strictement en mémoire du jeton OAuth Google Workspace (jamais localStorage/sessionStorage)
let inMemoryWorkspaceAccessToken: string | null = null;

export function getInMemoryWorkspaceToken(): string | null {
  return inMemoryWorkspaceAccessToken;
}

export function clearInMemoryWorkspaceToken(): void {
  inMemoryWorkspaceAccessToken = null;
}

export async function authorizeGoogleWorkspacePopup(): Promise<{
  idToken: string;
  accessToken: string;
}> {
  const result = await signInWithPopup(auth, workspaceProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error(
      "Impossible d'obtenir le jeton d'accès Google Sheets / Drive. Veuillez réessayer."
    );
  }
  inMemoryWorkspaceAccessToken = credential.accessToken;
  const idToken = await result.user.getIdToken(true);
  return { idToken, accessToken: credential.accessToken };
}

export async function signOutFirebase(): Promise<void> {
  clearInMemoryWorkspaceToken();
  await signOut(auth);
}
