import { BrowserRouter, Route, Routes } from "react-router-dom";

import Home from "./pages/Home";
import Login from "./pages/Login";
import DrawTest from "./pages/DrawTest";
import DesktopWorkspace from "./pages/DesktopWorkspace";
import Register from "./pages/Register";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/draw" element={<DrawTest />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/workspace" element={<DesktopWorkspace />} />
        </Route>
        <Route path="/register" element={<Register />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
