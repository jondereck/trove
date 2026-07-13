import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useShareIntentContext } from 'expo-share-intent'
import QuickSave, { type Draft } from '../components/QuickSave'
import SaveToast from '../components/SaveToast'
import ShareSaveAnimation from '../components/ShareSaveAnimation'
import type { SaveOutcome } from '../lib/chestLoaderTimeline'
import { ColorPalette, FONTS, SPACING } from '../constants/theme'
import { useThemedStyles } from '../contexts/ThemeContext'
import { UNSORTED_LABEL } from '../constants/labels'
import { createSave, upsertCollectionByName } from '../lib/db'
import { extractSharedUrl, exitAfterShare } from '../lib/shareIntent'
import { quickSaveSharedUrl } from '../lib/shareSave'
import { getSettings } from '../lib/settings'
import { isLimitError, showLimitAlert } from '../lib/upgradeAlert'

type ToastTone = 'success' | 'neutral' | 'error'
type ToastState = { id: number; message: string; tone: ToastTone }

export default function ShareScreen() {
  const styles = useThemedStyles(createStyles)
  const router = useRouter()
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext()
  const [sharedUrl, setSharedUrl] = useState<string | undefined>()
  const [showModal, setShowModal] = useState(false)
  const [invalidShare, setInvalidShare] = useState(false)
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  const [saveCompleted, setSaveCompleted] = useState(false)
  const [saveOutcome, setSaveOutcome] = useState<SaveOutcome>('pending')
  const [toast, setToast] = useState<ToastState | null>(null)
  const initialized = useRef(false)
  const pendingToast = useRef<ToastState | null>(null)

  const finishShare = useCallback(() => {
    setSharedUrl(undefined)
    setShowModal(false)
    setInvalidShare(false)
    setIsAutoSaving(false)
    setSaveCompleted(false)
    setSaveOutcome('pending')
    pendingToast.current = null
    setToast(null)
    initialized.current = false
    resetShareIntent()
    router.replace('/(tabs)')
    exitAfterShare()
  }, [resetShareIntent, router])

  const handleLoaderFinished = useCallback(() => {
    setIsAutoSaving(false)
    const next = pendingToast.current
    pendingToast.current = null
    if (next) {
      setToast(next)
    } else {
      finishShare()
    }
  }, [finishShare])

  const runAutoSave = useCallback(async (url: string) => {
    setIsAutoSaving(true)
    setSaveCompleted(false)
    setSaveOutcome('pending')
    pendingToast.current = null

    try {
      const result = await quickSaveSharedUrl(url)
      if (result === 'saved') {
        pendingToast.current = {
          id: Date.now(),
          message: `Saved to ${UNSORTED_LABEL}`,
          tone: 'success',
        }
        setSaveOutcome('saved')
      } else if (result === 'duplicate') {
        pendingToast.current = {
          id: Date.now(),
          message: 'Already in Trove',
          tone: 'neutral',
        }
        setSaveOutcome('duplicate')
      } else {
        pendingToast.current = {
          id: Date.now(),
          message: 'Could not save this link',
          tone: 'error',
        }
        setSaveOutcome('error')
      }
      setSaveCompleted(true)
    } catch (e) {
      if (isLimitError(e)) {
        setSaveOutcome('error')
        setSaveCompleted(true)
        setIsAutoSaving(false)
        showLimitAlert(e)
        finishShare()
        return
      }
      pendingToast.current = {
        id: Date.now(),
        message: 'Could not save this link',
        tone: 'error',
      }
      setSaveOutcome('error')
      setSaveCompleted(true)
    }
  }, [finishShare])

  useEffect(() => {
    if (!hasShareIntent) {
      initialized.current = false
      setSharedUrl(undefined)
      setShowModal(false)
      setInvalidShare(false)
      return
    }

    if (initialized.current) return
    initialized.current = true

    const url = extractSharedUrl(shareIntent?.webUrl, shareIntent?.text)
    if (!url) {
      setInvalidShare(true)
      const timer = setTimeout(finishShare, 1800)
      return () => clearTimeout(timer)
    }

    void getSettings().then(settings => {
      if (settings.shareReviewModal) {
        setSharedUrl(url)
        setShowModal(true)
      } else {
        void runAutoSave(url)
      }
    })
  }, [hasShareIntent, shareIntent, finishShare, runAutoSave])

  const handleSave = async (draft: Draft) => {
    try {
      const name = draft.collection?.trim()
      let collectionId: string | undefined
      let isInbox = true
      if (name) {
        try {
          collectionId = (await upsertCollectionByName(name)) ?? undefined
          isInbox = false
        } catch (e) {
          if (!isLimitError(e)) throw e
        }
      }

      const save = await createSave({
        url: draft.url || undefined,
        title: draft.title,
        description: draft.description || undefined,
        type: draft.type,
        content: draft.type === 'note' ? draft.description : undefined,
        image_url: draft.imageUrl || undefined,
        collection_id: collectionId,
        tags: draft.tags,
        is_inbox: isInbox,
      })
      if (!save) throw new Error('Could not save this link')
    } catch (e) {
      if (isLimitError(e)) {
        showLimitAlert(e)
      }
      throw e
    }
  }

  if (!hasShareIntent) return null

  return (
    <View style={styles.container}>
      {invalidShare && (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Share a valid link to Trove</Text>
        </View>
      )}

      <ShareSaveAnimation
        active={isAutoSaving}
        saveCompleted={saveCompleted}
        outcome={saveOutcome}
        onFinished={handleLoaderFinished}
      />

      <QuickSave
        visible={showModal && !!sharedUrl}
        onClose={finishShare}
        onSave={handleSave}
        initialUrl={sharedUrl}
      />

      {toast && (
        <SaveToast
          key={toast.id}
          message={toast.message}
          tone={toast.tone}
          onHide={finishShare}
        />
      )}
    </View>
  )
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
    },
    errorWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.xl,
    },
    errorText: {
      fontSize: 15,
      fontFamily: FONTS.sansMed,
      color: c.textSub,
      textAlign: 'center',
    },
  })
}
