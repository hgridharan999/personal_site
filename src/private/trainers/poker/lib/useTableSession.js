// src/private/trainers/poker/lib/useTableSession.js
// React binding for the table driver: owns the BotRunner and driver for one mounted table.
import { useCallback, useEffect, useRef, useState } from 'react';
import { BOT_VERSION } from '../bots/version.js';
import { listPersonas } from '../bots/personas.js';
import { createWorkerRunner } from '../worker/workerClient.js';
import { createFallbackRunner } from './fallbackRunner.js';
import { sharedAnalysisClient } from '../analysis/worker/analysisClient.js';
import { createSession } from './tableCore.js';
import { createTableDriver, realScheduler } from './tableDriver.js';
import { foldHandIntoProfile } from './profile.js';
import { tableSnapshot } from './tableSnapshot.js';

/**
 * @param {{ id:string, config:{tableMode:'random'|'custom', speed:'fast'|'normal', lineup:object[]},
 *   profile:object|null, onSessionStart:(info:object) => void, onHandComplete:(record:object, analysis?:object) => void,
 *   onSessionEnd:(summary:object) => void }} args
 * @returns {{ session:ReturnType<typeof tableSnapshot>|null, act:(choice:object) => void, rebuy:() => void, getUp:() => void }}
 *   `session` is a hero-safe snapshot (lib/tableSnapshot.js), never the driver's raw TableSession,
 *   which carries every seat's hole cards and the undealt board.
 */
export function useTableSession({ id, config, profile, onSessionStart, onHandComplete, onSessionEnd }) {
  const [session, setSession] = useState(null);
  const driverRef = useRef(null);
  const callbacks = useRef({ onSessionStart, onHandComplete, onSessionEnd });
  callbacks.current = { onSessionStart, onHandComplete, onSessionEnd };

  useEffect(() => {
    // Bots decide in a Web Worker. If it cannot start or breaks, the rest of the session decides on the
    // main thread; that code is imported only then, so the table chunk stays free of brains and chart data.
    const runner = createFallbackRunner({
      createPrimary: () => createWorkerRunner(),
      loadFallback: () => import('../bots/runner.js').then(({ createLocalRunner }) => createLocalRunner({ rng: Math.random })),
    });
    const initial = createSession({
      id, tableMode: config.tableMode, lineup: config.lineup, startedAt: new Date().toISOString(),
    });
    const driver = createTableDriver({
      session: initial,
      runner,
      scheduler: realScheduler,
      rng: Math.random,
      personas: listPersonas(),
      botVersion: BOT_VERSION,
      speed: config.speed,
      profile,
      accumulateProfile: foldHandIntoProfile,
      onChange: (next) => setSession(tableSnapshot(next)),
      // Every argument is forwarded, so Phase 5's onHandComplete(record, analysis) reaches the page.
      onSessionStart: (...args) => callbacks.current.onSessionStart(...args),
      analyzeHand: (record) => sharedAnalysisClient().analyze(record),
      onHandComplete: (...args) => callbacks.current.onHandComplete(...args),
      onSessionEnd: (...args) => callbacks.current.onSessionEnd(...args),
    });
    driverRef.current = driver;
    setSession(tableSnapshot(initial));
    // Deferred so React StrictMode's development mount, unmount and remount starts only one session:
    // the first driver is abandoned before it starts, which emits nothing.
    const timer = setTimeout(() => driver.start(), 0);
    // Closing the tab skips React cleanup: hand any hand still being graded to the outbox now.
    const onPageHide = () => driver.flushAnalyses();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      clearTimeout(timer);
      driver.abandon();
      runner.dispose();
      driverRef.current = null;
    };
    // One table per mount: TablePage keys TableScreen by session id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const act = useCallback((choice) => {
    driverRef.current?.act(choice);
  }, []);
  const rebuy = useCallback(() => {
    driverRef.current?.rebuy();
  }, []);
  const getUp = useCallback(() => {
    driverRef.current?.getUp();
  }, []);

  return { session, act, rebuy, getUp };
}
