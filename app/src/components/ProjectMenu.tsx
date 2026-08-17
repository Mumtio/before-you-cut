import { useEffect, useRef, useState } from 'react';
import { deleteProject, listProjects, loadProject, rememberLastOpened, saveProject } from '../project/db';
import { downloadText, safeFilename } from '../project/exportFlat';
import type { ProjectSummary } from '../project/format';
import { isProjectFile } from '../project/format';
import { hydrate, serialize } from '../project/serialize';
import { useStudio } from '../state/store';
import { Dialog } from './Dialog';

export function ProjectMenu() {
  const projectId = useStudio((s) => s.projectId);
  const projectName = useStudio((s) => s.projectName);
  const setProjectName = useStudio((s) => s.setProjectName);
  const saveState = useStudio((s) => s.saveState);
  const adoptProject = useStudio((s) => s.adoptProject);
  const resetProject = useStudio((s) => s.resetProject);
  const setScreen = useStudio((s) => s.setScreen);
  const say = useStudio((s) => s.say);

  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) listProjects().then(setProjects).catch(() => setProjects([]));
  }, [open, projectId]);

  const currentFile = () => {
    const s = useStudio.getState();
    return serialize({
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
  };

  const openProject = async (id: string) => {
    try {
      const file = await loadProject(id);
      if (!file) return;
      adoptProject(await hydrate(file));
      rememberLastOpened(id);
      setScreen('studio');
      setOpen(false);
    } catch {
      say('That project could not be opened.');
    }
  };

  const importFile = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isProjectFile(parsed)) {
        say('That is not a Before You Cut project file.');
        return;
      }
      // A fresh id, so importing never overwrites a project already here.
      const incoming = { ...parsed, id: `proj_${Math.random().toString(36).slice(2, 9)}` };
      await saveProject(incoming);
      adoptProject(await hydrate(incoming));
      rememberLastOpened(incoming.id);
      setScreen('studio');
      setOpen(false);
      say(`Imported “${incoming.name}”.`);
    } catch {
      say('That file could not be read.');
    }
  };

  return (
    <>
      <div className="project-line">
        <input
          className="project-name"
          value={projectName}
          spellCheck={false}
          onChange={(e) => setProjectName(e.target.value)}
          title="Project name"
        />
        <span className={`save-state ${saveState}`}>{SAVE_LABEL[saveState]}</span>
        <button type="button" className="btn tiny" onClick={() => setOpen(true)}>
          Projects
        </button>
      </div>

      {open && (
        <Dialog title="Projects" onClose={() => setOpen(false)}>
          <p>
            Everything is kept on this machine. Export a project to move it somewhere else — one
            file holds the body, every layer, every part and every version.
          </p>

          <div className="dialog-actions start">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                resetProject();
                setOpen(false);
              }}
            >
              New project
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const file = currentFile();
                downloadText(JSON.stringify(file), `${safeFilename(file.name)}.sampleroom.json`);
              }}
            >
              Export this project
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Import a project
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void importFile(f);
              }}
            />
          </div>

          <ul className="project-list">
            {projects.length === 0 && <li className="empty">Nothing saved yet.</li>}
            {projects.map((p) => (
              <li key={p.id} className={p.id === projectId ? 'current' : undefined}>
                <button type="button" className="project-open" onClick={() => void openProject(p.id)}>
                  <strong>{p.name}</strong>
                  <span>
                    {p.id === projectId ? 'open now · ' : ''}
                    {new Date(p.updatedAt).toLocaleString()}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn tiny danger"
                  disabled={p.id === projectId}
                  title={p.id === projectId ? 'This one is open' : 'Delete'}
                  onClick={async () => {
                    await deleteProject(p.id);
                    setProjects(await listProjects());
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
    </>
  );
}

const SAVE_LABEL: Record<string, string> = {
  idle: '',
  pending: 'Saving…',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Not saved',
};
