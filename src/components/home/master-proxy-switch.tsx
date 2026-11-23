import { PowerSettingsNewRounded } from '@mui/icons-material'
import { Typography } from '@mui/material'
import { useLockFn } from 'ahooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BaseConfig } from 'tauri-plugin-mihomo-api'

import { Switch } from '@/components/base'
import { EnhancedCard } from '@/components/home/enhanced-card'
import { useClashMode, useRuntimeConfig } from '@/hooks/use-clash'
import {
  useAppRefreshers,
  useClashConfigData,
} from '@/providers/app-data-context'
import { patchClashMode } from '@/services/cmds'
import { mutate } from '@/services/mutate'
import { showNotice } from '@/services/notice-service'
import { setCacheData } from '@/services/query-client'

const CLASH_MODES = ['rule', 'global', 'direct'] as const
type ClashMode = (typeof CLASH_MODES)[number]

const isClashMode = (mode: string): mode is ClashMode =>
  (CLASH_MODES as readonly string[]).includes(mode)

const toClashMode = (mode?: string | null) => {
  const normalized = mode?.toLowerCase()
  return normalized && isClashMode(normalized) ? normalized : undefined
}

const LOCAL_STORAGE_MODE_KEY = 'clash-verge-master-switch-mode'

export const MasterProxySwitch = () => {
  const { t } = useTranslation()
  const { clashConfig } = useClashConfigData()
  const { refreshClashConfig } = useAppRefreshers()

  const [optimisticMode, setOptimisticMode] = useState<ClashMode | null>(null)

  const controllerMode = toClashMode(clashConfig?.mode)
  const needFallback = !controllerMode
  const { data: runtimeConfig } = useRuntimeConfig(needFallback)
  const runtimeMode = toClashMode(runtimeConfig?.mode)
  const {
    data: backendMode,
    refetch: refetchBackendMode,
  } = useClashMode(needFallback)
  // Saved config is refreshed on mode changes; runtime config may be stale.
  const fallbackMode = toClashMode(backendMode) ?? runtimeMode

  const resolvedMode = controllerMode ?? fallbackMode
  const currentMode = optimisticMode ?? resolvedMode

  const active = currentMode != null && currentMode !== 'direct'

  const applyMode = async (mode: ClashMode): Promise<boolean> => {
    if (mode === currentMode) return true

    setOptimisticMode(mode)
    try {
      await mutate(() => patchClashMode(mode), {
        id: 'patch-clash-mode',
        errorNotice: false,
      })
    } catch (error) {
      setOptimisticMode(null)
      showNotice.error(error)
      return false
    }

    // Write through the live cache to avoid flashing the old mode during refetch.
    setCacheData<BaseConfig>(['getClashConfig'], (old) =>
      old ? { ...old, mode } : old,
    )
    await Promise.allSettled([refreshClashConfig(), refetchBackendMode()])
    setOptimisticMode(null)
    return true
  }

  const handleToggle = useLockFn(async (value: boolean) => {
    if (!value) {
      if (currentMode === 'rule' || currentMode === 'global') {
        // No backend field stores the pre-direct mode, so it is kept
        // locally like the chain-mode state on the proxies page.
        localStorage.setItem(LOCAL_STORAGE_MODE_KEY, currentMode)
      }
      await applyMode('direct')
      return
    }

    const remembered = localStorage.getItem(LOCAL_STORAGE_MODE_KEY)
    const target: ClashMode = remembered === 'global' ? 'global' : 'rule'
    if (await applyMode(target)) {
      localStorage.removeItem(LOCAL_STORAGE_MODE_KEY)
    }
  })

  return (
    <EnhancedCard
      title={t('home.components.masterSwitch.title')}
      icon={<PowerSettingsNewRounded />}
      iconColor={active ? 'success' : 'primary'}
      action={
        <Switch
          checked={active}
          onChange={(_, value) => void handleToggle(value)}
        />
      }
    >
      <Typography variant="body2" color="text.secondary">
        {active
          ? t('home.components.masterSwitch.status.enabled')
          : t('home.components.masterSwitch.status.disabled')}
      </Typography>
    </EnhancedCard>
  )
}
