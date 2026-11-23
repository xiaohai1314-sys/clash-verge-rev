import { PowerSettingsNewRounded } from '@mui/icons-material'
import { Typography } from '@mui/material'
import { useLockFn } from 'ahooks'
import { useTranslation } from 'react-i18next'

import { Switch } from '@/components/base'
import { EnhancedCard } from '@/components/home/enhanced-card'
import { useSystemProxyState } from '@/hooks/use-system-proxy-state'
import { useSystemState } from '@/hooks/use-system-state'
import { useVerge } from '@/hooks/use-verge'
import { showNotice } from '@/services/notice-service'
import { requestService } from '@/services/service-request'

const LOCAL_STORAGE_TUN_KEY = 'clash-verge-master-switch-tun'

export const MasterProxySwitch = () => {
  const { t } = useTranslation()
  const { verge, mutateVerge, patchVerge } = useVerge()
  const { toggleSystemProxy } = useSystemProxyState()
  const { runState, isTunModeAvailable, isLoading } = useSystemState()

  const { enable_system_proxy, enable_tun_mode } = verge ?? {}
  const active = Boolean(enable_system_proxy || enable_tun_mode)

  const setTunMode = async (value: boolean) => {
    mutateVerge((prev) => ({ ...prev, enable_tun_mode: value }))
    await patchVerge({ enable_tun_mode: value })
  }

  const handleToggle = useLockFn(async (value: boolean) => {
    try {
      if (!value) {
        // No combined setting exists, so the TUN state to restore on the
        // next master-on is kept locally.
        localStorage.setItem(
          LOCAL_STORAGE_TUN_KEY,
          enable_tun_mode ? '1' : '0',
        )
        if (enable_tun_mode) await setTunMode(false)
        if (enable_system_proxy) await toggleSystemProxy(false)
        return
      }
      // Enabling needs a running core; disabling only writes OS state and must stay available.
      if (!isLoading && runState.mode === 'NotRunning') {
        showNotice.error('settings.feedback.errors.sysproxy.coreNotReady')
        return
      }
      await toggleSystemProxy(true)
      if (localStorage.getItem(LOCAL_STORAGE_TUN_KEY) === '1') {
        if (!isTunModeAvailable) {
          requestService({
            reason: 'tunNeedsService',
            restore: { enable_tun_mode: true },
          })
        } else {
          await setTunMode(true)
        }
      }
    } catch (err) {
      showNotice.error(err)
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
