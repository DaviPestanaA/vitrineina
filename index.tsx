import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

function Root() {
  try {
    return <App />;
  } catch (e: any) {
    return (
      <pre style={{ padding: 20, color: "red", whiteSpace: "pre-wrap" }}>
        ERRO NO APP:
        {"\n"}
        {String(e?.message || e)}
      </pre>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
