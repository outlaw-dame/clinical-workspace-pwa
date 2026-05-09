import { render } from "solid-js/web";
import { App } from "./app/App";
import { registerAppServiceWorker } from "./platform/serviceWorkerRegistration";
import "./styles/base.css";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/search.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Unable to mount application: #root was not found.");
}

render(() => <App />, root);

void registerAppServiceWorker();
