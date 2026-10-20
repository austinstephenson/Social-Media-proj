import { useNavigate } from "react-router-dom";

function Home() {
  const navigate = useNavigate();

  return (
    <div className="page">
      <h1>SketChat</h1>

      <p>Welcome to the SketChat!</p>

      <button onClick={() => navigate("/login")}>
        Login
      </button>
    </div>
  );
}

export default Home;