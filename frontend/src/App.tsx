import { BrowserRouter, Route, Routes } from "react-router-dom";

import Home from "./pages/Home";
import Login from "./pages/Login";
import DrawTest from "./pages/DrawTest";
import DesktopWorkspace from "./pages/DesktopWorkspace";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/draw" element={<DrawTest />} />
        <Route path="/workspace" element={<DesktopWorkspace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;