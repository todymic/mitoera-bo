import { createRouter, createWebHistory } from 'vue-router';

// Lazy-loaded views
const PlansView    = () => import('./views/PlansView.vue');
const EditorView   = () => import('./views/EditorView.vue');
const EventsView   = () => import('./views/EventsView.vue');
const EventDetail  = () => import('./views/EventDetailView.vue');
const HomeView     = () => import('./views/HomeView.vue');
const ApiKeysView  = () => import('./views/ApiKeysView.vue');
const ProfileView  = () => import('./views/ProfileView.vue');

const routes = [
  { path: '/',              name: 'home',         component: HomeView },
  { path: '/plans',         name: 'plans',        component: PlansView },
  { path: '/plans/:id',     name: 'plan-editor',  component: EditorView },
  { path: '/events',        name: 'events',       component: EventsView },
  { path: '/events/:id',    name: 'event-detail', component: EventDetail },
  { path: '/api-keys',      name: 'api-keys',     component: ApiKeysView },
  { path: '/profile',       name: 'profile',      component: ProfileView },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory('/'),
  routes,
});
