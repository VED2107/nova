import { PlayerView } from "../features/player/PlayerView";

// M0 vertical slice: the player is the whole app. Library, playlists and
// settings arrive in later milestones (see docs/product/roadmap in the handoff).
export function App() {
  return <PlayerView />;
}
