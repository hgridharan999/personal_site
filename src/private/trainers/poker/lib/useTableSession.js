// src/private/trainers/poker/lib/useTableSession.js
// React binding for the table driver: owns the BotRunner and driver for one mounted table.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createLocalRunner } from '../bots/runner.js';
import { BOT_VERSION } from '../bots/index.js';
import { listPersonas } from '../bots/personas.js';
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
    const runner = createLocalRunner({ rng: Math.random });
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
      onHandComplete: (...args) => callbacks.current.onHandComplete(...args),
      onSessionEnd: (...args) => callbacks.current.onSessionEnd(...args),
    });
    driverRef.current = driver;
    setSession(tableSnapshot(initial));
    // Deferred so React StrictMode's development mount, unmount and remount starts only one session:
    // the first driver is abandoned before it starts, which emits nothing.
    const timer = setTimeout(() => driver.start(), 0);
    return () => {
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
