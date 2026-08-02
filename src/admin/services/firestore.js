import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

function getApp() {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

/**
 * Écoute les changements de statut de sièges pour un événement via Firestore.
 * La collection cible : events/{eventId}/seats
 *
 * @param {string} eventId
 * @param {(changes: Array<{seatKey: string, status: string}>) => void} onChanges
 * @returns {() => void} unsubscribe
 */
export function subscribeToSeatStatuses(eventId, onChanges) {
  const db = getFirestore(getApp());
  const seatsRef = collection(db, 'events', eventId, 'seats');

  return onSnapshot(seatsRef, (snapshot) => {
    const changes = snapshot.docChanges()
      .filter(change => change.type === 'added' || change.type === 'modified')
      .map(change => ({
        seatKey: change.doc.data().seatKey,
        status:  change.doc.data().status,
      }));

    if (changes.length > 0) {
      onChanges(changes);
    }
  });
}
