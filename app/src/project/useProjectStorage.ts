import { useEffect, useRef } from 'react';
import { useStudio } from '../state/store';
import { getLastOpened, loadProject, rememberLastOpened, saveProject } from './db';
import { hydrate, serialize } from './serialize';

const DEBOUNCE_MS = 1200;

/**
 * Restores the last project on start, then writes it back whenever anything
 * meaningful changes. Debounced, because encoding the layer bitmaps to PNG is
 * not something to do on every brush stroke.
 */
export function useProjectStorage() {
  const ready = useRef(false);

  const projectId = useStudio((s) => s.projectId);
  const projectName = useStudio((s) => s.projectName);
  const layers = useStudio((s) => s.layers);
  const regions = useStudio((s) => s.regions);
  const sliders = useStudio((s) => s.sliders);
  const templateId = useStudio((s) => s.templateId);
  const pixelVersion = useStudio((s) => s.pixelVersion);
  const modelPhotos = useStudio((s) => s.modelPhotos);
  const tryOns = useStudio((s) => s.tryOns);
  const fabricZones = useStudio((s) => s.fabricZones);
  const baseFabricNote = useStudio((s) => s.baseFabricNote);
  const renders = useStudio((s) => s.renders);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = getLastOpened();
        const file = id ? await loadProject(id) : undefined;
        if (file && !cancelled) {
          const state = await hydrate(file);
          const store = useStudio.getState();
          store.adoptProject(state);
          // Setup was already done for this project; go where the work is.
          store.setScreen('studio');
        }
      } catch {
        useStudio.getState().say('Could not reopen the last project. Starting fresh.');
      } finally {
        ready.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready.current) return;
    const store = useStudio.getState();
    store.setSaveState('pending');

    const timer = setTimeout(async () => {
      const s = useStudio.getState();
      s.setSaveState('saving');
      try {
        const file = serialize({
          id: s.projectId,
          name: s.projectName,
          templateId: s.templateId,
          sliders: s.sliders,
          layers: s.layers,
          regions: s.regions,
          modelPhotos: s.modelPhotos,
          tryOns: s.tryOns,
          garmentCategory: s.garmentCategory,
          fabricZones: s.fabricZones,
          baseFabricNote: s.baseFabricNote,
          renders: s.renders,
        });
        await saveProject(file);
        rememberLastOpened(file.id);
        useStudio.getState().setSaveState('saved');
      } catch {
        useStudio.getState().setSaveState('error');
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [projectId, projectName, layers, regions, sliders, templateId, pixelVersion, modelPhotos, tryOns, fabricZones, baseFabricNote, renders]);
}
