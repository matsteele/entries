import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const store = _require('../../backend/task-store.js');
export default store;
