import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from './firebase'
import type { DebateConfig } from './debateConfig'

type DebateTemplate = {
  id: string
  name: string
  description?: string
  config: DebateConfig
  createdAt: unknown
  updatedAt: unknown
}

function templateCollection(userId: string) {
  return collection(db, 'users', userId, 'debateTemplates')
}

async function saveDebateTemplate(
  userId: string,
  template: { id?: string; name: string; description?: string; config: DebateConfig },
): Promise<string> {
  const templateId = template.id ?? crypto.randomUUID()
  const ref = doc(db, 'users', userId, 'debateTemplates', templateId)

  await setDoc(ref, {
    name: template.name,
    description: template.description ?? '',
    config: JSON.parse(JSON.stringify(template.config)),
    createdAt: template.id ? undefined : serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true })

  return templateId
}

async function loadDebateTemplates(userId: string): Promise<DebateTemplate[]> {
  const q = query(templateCollection(userId), orderBy('updatedAt', 'desc'))
  const snapshot = await getDocs(q)

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data()
    return {
      id: docSnap.id,
      name: data.name ?? 'Untitled',
      description: data.description,
      config: data.config as DebateConfig,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    }
  })
}

async function deleteDebateTemplate(userId: string, templateId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId, 'debateTemplates', templateId))
}

export {
  deleteDebateTemplate,
  loadDebateTemplates,
  saveDebateTemplate,
}

export type { DebateTemplate }
