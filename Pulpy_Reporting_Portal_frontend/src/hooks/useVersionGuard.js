import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import versionService from '../services/versionService';

const POLL_INTERVAL_MS = 60000;

const getInitialState = () => ({
    currentVersion: versionService.getCurrentVersion(),
    latestVersion: null,
    minRequiredVersion: null,
    releaseNotes: '',
    isSoftUpdateVisible: false,
    isForceUpdateMode: versionService.isApiBlockedByVersionGuard(),
    retryMessage: '',
});

export default function useVersionGuard() {
    const [state, setState] = useState(getInitialState);
    const forceTimerRef = useRef(null);

    const clearForceTimer = useCallback(() => {
        if (forceTimerRef.current) {
            window.clearTimeout(forceTimerRef.current);
            forceTimerRef.current = null;
        }
    }, []);

    const activateForceMode = useCallback(() => {
        versionService.onForceUpdateFromServer();
        setState((prev) => ({
            ...prev,
            isSoftUpdateVisible: false,
            isForceUpdateMode: true,
        }));
    }, []);

    const scheduleForceMode = useCallback(() => {
        clearForceTimer();
        forceTimerRef.current = window.setTimeout(() => {
            activateForceMode();
        }, versionService.forceAfterMs);
    }, [activateForceMode, clearForceTimer]);

    const runVersionCheck = useCallback(async () => {
        try {
            const next = await versionService.checkVersion();

            setState((prev) => {
                if (next.isForceUpdateRequired) {
                    return {
                        ...prev,
                        ...next,
                        isSoftUpdateVisible: false,
                        isForceUpdateMode: true,
                        retryMessage: '',
                    };
                }

                const shouldShowSoft = next.isUpdateAvailable && !prev.isForceUpdateMode;
                if (!shouldShowSoft) {
                    clearForceTimer();
                } else if (!prev.isSoftUpdateVisible) {
                    scheduleForceMode();
                }

                return {
                    ...prev,
                    ...next,
                    isSoftUpdateVisible: shouldShowSoft,
                    retryMessage: '',
                };
            });
        } catch (error) {
            // Edge-case requirement: do not block if version endpoint fails.
        }
    }, [clearForceTimer, scheduleForceMode]);

    const dismissSoftUpdate = useCallback(() => {
        scheduleForceMode();
        setState((prev) => ({
            ...prev,
            isSoftUpdateVisible: false,
        }));
    }, [scheduleForceMode]);

    const refreshNow = useCallback(() => {
        const reloaded = versionService.reloadApp();
        if (!reloaded) {
            setState((prev) => ({
                ...prev,
                retryMessage: 'Please wait a few seconds before refreshing again.',
            }));
        }
    }, []);

    useEffect(() => {
        runVersionCheck();

        const intervalId = window.setInterval(runVersionCheck, POLL_INTERVAL_MS);
        const visibilityHandler = () => {
            if (document.visibilityState === 'visible') {
                runVersionCheck();
            }
        };

        const outdatedHandler = () => {
            activateForceMode();
        };

        const unsubscribe = versionService.subscribe(({ forceUpdateMode }) => {
            if (forceUpdateMode) {
                setState((prev) => ({
                    ...prev,
                    isSoftUpdateVisible: false,
                    isForceUpdateMode: true,
                }));
            }
        });

        document.addEventListener('visibilitychange', visibilityHandler);
        window.addEventListener('app-version-outdated', outdatedHandler);

        return () => {
            clearForceTimer();
            unsubscribe();
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', visibilityHandler);
            window.removeEventListener('app-version-outdated', outdatedHandler);
        };
    }, [activateForceMode, clearForceTimer, runVersionCheck]);

    return useMemo(() => ({
        ...state,
        dismissSoftUpdate,
        refreshNow,
        runVersionCheck,
    }), [dismissSoftUpdate, refreshNow, runVersionCheck, state]);
}

