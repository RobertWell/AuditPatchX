import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import { ConfigProvider } from 'antd';
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";



// ✅ IMPORTANT: prevents using loader.js / AMD
loader.config({ monaco });

self.MonacoEnvironment = {
  getWorker(_: any, label: string) {
    if (label === "json") return new JsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new CssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new HtmlWorker();
    if (label === "typescript" || label === "javascript") return new TsWorker();
    return new EditorWorker();
  },
};


ReactDOM.createRoot(document.getElementById('root')!).render(
  <ConfigProvider
    theme={{
      token: {
        colorPrimary: '#3078c1',
      },
    }}
  >
    <App />
  </ConfigProvider>
);
