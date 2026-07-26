import { createApp } from 'vue';
import { auth } from './services/auth.js';
import EmbedEditor from './EmbedEditor.vue';
import '../style.css';

// Auth depuis ?token=
const urlParams = new URLSearchParams(window.location.search);
const embedToken = urlParams.get('token');
if (embedToken) {
  auth.setToken(embedToken);
  urlParams.delete('token');
  const clean = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
  window.history.replaceState({}, '', clean);
}

createApp(EmbedEditor).mount('#embed-editor');
