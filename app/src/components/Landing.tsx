/**
 * The front door.
 *
 * Someone arriving from a link has no idea what this is, and dropping them
 * straight onto a body-shape screen asks them to make a choice before they
 * know why. This says what the tool is in one screen and gets out of the way.
 */
const STEPS = [
  { n: '01', title: 'Draw it', body: 'On a body you shape yourself. Layers, brushes, colour, undo.' },
  { n: '02', title: 'Cut it into parts', body: 'Enclose a collar or a sleeve, save versions of it, swap between them. The rest of the garment stays untouched.' },
  { n: '03', title: 'Make it real', body: 'Say what each area is made of and get the garment back as photographic cloth.' },
  { n: '04', title: 'See it worn', body: 'On your own model photos, on the bodies the design is actually for.' },
];

export function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="landing">
      <div className="landing-inner">
        <header className="landing-head">
          <img src="/logo.svg" alt="" width={44} height={44} />
          <h1>
            Before You <em>Cut</em>
          </h1>
          <p className="landing-tagline">
            Draw it, swap every version, see it worn — before a single cut.
          </p>
          <p className="landing-sub">
            You can return a dress you bought. You cannot un-cut the fabric of one you made.
          </p>
          <button type="button" className="btn primary big" onClick={onStart}>
            Start designing →
          </button>
        </header>

        <ol className="landing-steps">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="landing-n">{s.n}</span>
              <strong>{s.title}</strong>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
