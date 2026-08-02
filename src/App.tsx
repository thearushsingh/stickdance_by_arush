import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './components/Landing';
import DanceStage from './components/DanceStage';
import RoomStage from './components/RoomStage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/solo" element={<DanceStage isSolo={true} />} />
        <Route path="/room/:roomId" element={<RoomStage />} />
      </Routes>
    </Router>
  );
}

export default App;
