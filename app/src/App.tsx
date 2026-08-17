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

  // Going back is only ever a look at the front page — the work is untouched,
  // and Start designing returns to exactly where it was left.
  if (entered) return <Studio onHome={() => setEntered(false)} />;

  return (
    <Landing
      onStart={() => {
        sessionStorage.setItem(ENTERED, '1');
        setEntered(true);
      }}
    />
  );
}
