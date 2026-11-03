import { createRoot } from 'react-dom/client';
import { App, RefactorApi } from './App';

declare function acquireVsCodeApi(): RefactorApi;

const container = document.getElementById('root');
if (container) {
    createRoot(container).render(<App api={acquireVsCodeApi()} />);
}
