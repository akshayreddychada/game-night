/* Data layer. One small interface, two implementations:
   - Firebase (Firestore + anonymous auth) for the real app
   - an in-memory stand-in used only by the local test harness (?mock=1) */
import { firebaseConfig } from './config.js';

const OPEN_WINDOW_MS = 12 * 3600 * 1000;

export async function createBackend() {
  const params = new URLSearchParams(location.search);
  if (params.get('mock') === '1') {
    let mock = null;
    try { mock = window.parent && window.parent.__GN_MOCK__; } catch (e) { mock = null; }
    if (mock) return mock.connect(params.get('as') || 'u_test');
  }
  if (!firebaseConfig) return null;
  const fb = await import('../vendor/firebase.js');
  return firebaseBackend(fb, firebaseConfig);
}

function firebaseBackend(fb, cfg) {
  const app = fb.initializeApp(cfg);
  const auth = fb.getAuth(app);
  const db = fb.getFirestore(app);
  let uid = null;
  const roomRef = id => fb.doc(db, 'rooms', id);

  return {
    kind: 'firebase',
    async init() {
      await auth.authStateReady();
      if (!auth.currentUser) await fb.signInAnonymously(auth);
      uid = auth.currentUser.uid;
      return uid;
    },
    uid() { return uid; },
    async getMember() {
      try {
        const s = await fb.getDoc(fb.doc(db, 'members', uid));
        return s.exists() ? s.data() : null;
      } catch (e) { return null; }
    },
    async join(name, code) {
      try {
        await fb.setDoc(fb.doc(db, 'members', uid), { name, code, joinedAt: Date.now() });
      } catch (e) {
        if (e && e.code === 'permission-denied') throw { code: 'bad_code' };
        throw e;
      }
    },
    async rename(name) { await fb.updateDoc(fb.doc(db, 'members', uid), { name }); },
    watchRoom(id, next, fail) {
      return fb.onSnapshot(roomRef(id), s => next(s.exists() ? s.data() : null), e => fail && fail(e));
    },
    watchOpenRooms(next, fail) {
      const q = fb.query(fb.collection(db, 'rooms'), fb.where('updatedAt', '>', Date.now() - OPEN_WINDOW_MS), fb.orderBy('updatedAt', 'desc'), fb.limit(30));
      return fb.onSnapshot(q, s => next(s.docs.map(d => d.data())), e => fail && fail(e));
    },
    async createRoom(id, data) {
      return fb.runTransaction(db, async t => {
        const s = await t.get(roomRef(id));
        if (s.exists()) return false;
        t.set(roomRef(id), data);
        return true;
      });
    },
    /* fn(currentRoom) returns null to abort, or {room, history:{id,data}} */
    async txRoom(id, fn) {
      return fb.runTransaction(db, async t => {
        const s = await t.get(roomRef(id));
        const out = fn(s.exists() ? s.data() : null);
        if (!out) return false;
        t.set(roomRef(id), out.room);
        if (out.history) t.set(fb.doc(db, 'games', out.history.id), out.history.data);
        return true;
      });
    },
    async listGames(n) {
      const s = await fb.getDocs(fb.query(fb.collection(db, 'games'), fb.orderBy('endedAt', 'desc'), fb.limit(n || 200)));
      return s.docs.map(d => d.data());
    }
  };
}
