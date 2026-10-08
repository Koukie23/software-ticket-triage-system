import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { theme } from "./theme";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider locale={enUS} theme={theme}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
);
