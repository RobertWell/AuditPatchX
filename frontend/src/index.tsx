import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import { ConfigProvider } from 'antd';
import { loader } from '@monaco-editor/react';

const MONACO_VERSION = '0.55.1';
const MONACO_BASE_URL = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs`;

loader.config({
  paths: { vs: MONACO_BASE_URL },
});

window.MonacoEnvironment = {
  getWorkerUrl() {
    const workerMain = `${MONACO_BASE_URL}/base/worker/workerMain.js`;
    return `data:text/javascript;charset=utf-8,${encodeURIComponent(
      `self.MonacoEnvironment={baseUrl:'${MONACO_BASE_URL}'};importScripts('${workerMain}');`
    )}`;
  },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#3078c1',
        },
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>
);
