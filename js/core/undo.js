// Löschen mit "Rückgängig"-Toast.
import { store } from './store.js';
import { toast } from './ui.js';

/** Entfernt ein Element aus einer Liste und bietet Rückgängig an. */
export function removeWithUndo(getList, id, message = 'Gelöscht') {
  let removed = null, index = -1;
  store.update((s) => {
    const list = getList(s);
    index = list.findIndex((x) => x.id === id);
    if (index >= 0) [removed] = list.splice(index, 1);
  });
  if (!removed) return;
  toast(message, {
    iconName: 'trash',
    action: {
      label: 'Rückgängig',
      onClick: () => store.update((s) => {
        const list = getList(s);
        if (!list.some((x) => x.id === removed.id)) list.splice(Math.min(index, list.length), 0, removed);
      }),
    },
  });
}

/** Für kaskadierende Löschungen: kompletter Snapshot vorher. */
export function withUndo(fn, message = 'Gelöscht') {
  const snap = store.snapshot();
  store.update(fn);
  toast(message, { iconName: 'trash', action: { label: 'Rückgängig', onClick: () => store.replace(snap) } });
}
