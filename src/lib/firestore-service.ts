import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, isFirebaseConfigured } from './firebase';

export interface FirestorePost {
  id: string;
  boardType: string;
  boardName: string;
  boardId: string;
  nttSn: string;
  title: string;
  registeredDate: string;
  views: number;
  author?: string;
  originalUrl: string;
  thumbnailUrl?: string | null;
  cardImages?: string | null;
  attachments?: string | null;
  rawContent?: string;
  summary: string;
  easyExplanation: string;
  voiceScript: string;
  qnaPairs?: string | null;
  isSafetyOrPolicy: boolean;
  policyKeywords?: string | null;
  inspectionStatus: string; // AUTO_PUBLISHED, PENDING_REVIEW, APPROVED, REJECTED, UNPUBLISHED
  aiModelUsed: string;
  isDemo: boolean;
  isExpired?: boolean;
  isDeletedOnSource?: boolean;
  lastCheckedAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

const POSTS_COLLECTION = 'fipa_posts';
const LOGS_COLLECTION = 'fipa_sync_logs';

/**
 * 1. Firestore에서 게시물 목록 조회
 */
export async function getFirestorePosts(options?: {
  boardType?: string;
  forAdmin?: boolean;
  search?: string;
  status?: string;
}): Promise<FirestorePost[]> {
  if (!db || !isFirebaseConfigured()) return [];

  try {
    const postsRef = collection(db, POSTS_COLLECTION);
    let q = query(postsRef, orderBy('registeredDate', 'desc'), limit(100));

    if (options?.boardType && options.boardType !== 'ALL') {
      q = query(postsRef, where('boardType', '==', options.boardType), orderBy('registeredDate', 'desc'), limit(100));
    }

    const snapshot = await getDocs(q);
    let posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestorePost));

    if (!options?.forAdmin) {
      // 일반 대국민 공개용: 자동발행 및 승인 건만 필터
      posts = posts.filter(p => p.inspectionStatus === 'AUTO_PUBLISHED' || p.inspectionStatus === 'APPROVED');
    } else if (options?.status && options.status !== 'ALL') {
      posts = posts.filter(p => p.inspectionStatus === options.status);
    }

    if (options?.search) {
      const s = options.search.toLowerCase();
      posts = posts.filter(p =>
        (p.title && p.title.toLowerCase().includes(s)) ||
        (p.summary && p.summary.toLowerCase().includes(s)) ||
        (p.easyExplanation && p.easyExplanation.toLowerCase().includes(s))
      );
    }

    return posts;
  } catch (error) {
    console.error('Firestore getFirestorePosts 에러:', error);
    return [];
  }
}

/**
 * 2. Firestore 단일 게시물 조회
 */
export async function getFirestorePostById(id: string): Promise<FirestorePost | null> {
  if (!db || !isFirebaseConfigured()) return null;

  try {
    const docRef = doc(db, POSTS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    return { id: docSnap.id, ...docSnap.data() } as FirestorePost;
  } catch (error) {
    console.error('Firestore getFirestorePostById 에러:', error);
    return null;
  }
}

/**
 * 3. Firestore 단일 게시물 저장 또는 업데이트
 */
export async function savePostToFirestore(post: Partial<FirestorePost> & { id: string }): Promise<boolean> {
  if (!db || !isFirebaseConfigured()) return false;

  try {
    const docRef = doc(db, POSTS_COLLECTION, post.id);
    await setDoc(
      docRef,
      {
        ...post,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error('Firestore savePostToFirestore 에러:', error);
    return false;
  }
}

/**
 * 4. 관리자: 게시물 검수 상태 업데이트 (승인, 보류, 비공개)
 */
export async function updatePostStatusInFirestore(
  id: string,
  inspectionStatus: string,
  extraUpdates?: { summary?: string; easyExplanation?: string; voiceScript?: string }
): Promise<boolean> {
  if (!db || !isFirebaseConfigured()) return false;

  try {
    const docRef = doc(db, POSTS_COLLECTION, id);
    await updateDoc(docRef, {
      inspectionStatus,
      ...extraUpdates,
      updatedAt: Timestamp.now(),
    });
    return true;
  } catch (error) {
    console.error('Firestore updatePostStatusInFirestore 에러:', error);
    return false;
  }
}

/**
 * 5. 다중 게시물 일괄 Firestore 동기화 (배치 작업)
 */
export async function bulkSyncPostsToFirestore(posts: FirestorePost[]): Promise<{ count: number }> {
  if (!db || !isFirebaseConfigured() || posts.length === 0) return { count: 0 };

  try {
    const batch = writeBatch(db);
    posts.forEach(post => {
      const docRef = doc(db, POSTS_COLLECTION, post.id);
      batch.set(
        docRef,
        {
          ...post,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
    });

    await batch.commit();
    return { count: posts.length };
  } catch (error) {
    console.error('Firestore bulkSyncPostsToFirestore 에러:', error);
    return { count: 0 };
  }
}

/**
 * 6. Cloud Storage for Firebase 이미지 업로드 헬퍼
 */
export async function uploadImageToStorage(
  fileBuffer: ArrayBuffer | Blob | Uint8Array,
  fileName: string,
  contentType: string = 'image/png'
): Promise<string | null> {
  if (!storage || !isFirebaseConfigured()) return null;

  try {
    const storageRef = ref(storage, `fipa_images/${Date.now()}_${fileName}`);
    const metadata = { contentType };
    const snapshot = await uploadBytes(storageRef, fileBuffer as any, metadata);
    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (error) {
    console.error('Firebase Storage uploadImageToStorage 에러:', error);
    return null;
  }
}

/**
 * 7. 수집 동기화 로그 기록
 */
export async function saveSyncLogToFirestore(log: {
  boardId: string;
  boardName: string;
  status: string;
  itemsFound: number;
  itemsNew: number;
  itemsUpdated: number;
  errorMessage?: string;
}): Promise<boolean> {
  if (!db || !isFirebaseConfigured()) return false;

  try {
    const logsRef = collection(db, LOGS_COLLECTION);
    const docRef = doc(logsRef);
    await setDoc(docRef, {
      ...log,
      timestamp: Timestamp.now(),
    });
    return true;
  } catch (error) {
    console.error('Firestore saveSyncLogToFirestore 에러:', error);
    return false;
  }
}
