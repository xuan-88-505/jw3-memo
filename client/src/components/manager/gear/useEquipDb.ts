import { useCallback, useEffect, useState } from "react";
import { getEquipDb, loadEquipDb, type EquipDb } from "@/data/equip";
import type { Attr } from "@/data/gear";

/** 按主属性加载内功或外功装备库；已加载过的直接返回 */
export function useEquipDb(main: Attr) {
  const [db, setDb] = useState<EquipDb | null>(() => getEquipDb(main));
  const [failed, setFailed] = useState(false);
  const [n, setN] = useState(0);

  useEffect(() => {
    let alive = true;
    const ready = getEquipDb(main);
    setDb(ready);
    setFailed(false);
    if (ready) return;
    loadEquipDb(main)
      .then(d => alive && setDb(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [main, n]);

  const retry = useCallback(() => setN(x => x + 1), []);
  return { db, failed, retry };
}
