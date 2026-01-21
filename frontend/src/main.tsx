import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import { ConfigProvider } from 'antd';

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
