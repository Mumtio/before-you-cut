import { useState } from 'react';
import { Landing } from './components/Landing';
import { Studio } from './components/Studio';

/**
 * The landing page is the front door for someone arriving from a link, but it
 * would be an obstacle on every reload once they are working — so it is
 * remembered for the tab, not forever. A new visit gets the introduction again.
 */
const ENTERED = 'byc:entered';

export default function App() {
  const [entered, setEntered] = useState(() => sessionStorage.getItem(ENTERED) === '1');

  // The studio stays mounted underneath. Unmounting it sent the project
  // through its loader again on the way back, which repainted the canvas from
  // the last saved file and quietly threw away anything drawn since.
  return (
    <>
      <Studio onHome={() => setEntered(false)} />
      {!entered && (
        <Landing
          onStart={() => {
            sessionStorage.setItem(ENTERED, '1');
            setEntered(true);
          }}
        />
      )}
    </>
  );
}
