import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { DanmuOverlayApp } from "./overlay/DanmuOverlayApp";
import { installContextMenuGuard } from "./utils/contextMenu";

const windowLabel = getCurrentWindow().label;

document.documentElement.dataset.windowLabel = windowLabel;
document.body.dataset.windowLabel = windowLabel;
installContextMenuGuard();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {windowLabel === "overlay" ? <DanmuOverlayApp /> : <App />}
  </React.StrictMode>,
);
