import { createRouter, createWebHistory } from 'vue-router';
import { auth } from './services/auth.js';

// Lazy-loaded views
const PlansView    = () => import('./views/PlansView.vue');
const EditorView   = () => import('./views/EditorView.vue');
const EventsView   = () => import('./views/EventsView.vue');
const EventDetail  = () => import('./views/EventDetailView.vue');
const HomeView     = () => import('./views/HomeView.vue');
const ApiKeysView  = () => import('./views/ApiKeysView.vue');
const ProfileView  = () => import('./views/ProfileView.vue');
const UsageView    = () => import('./views/UsageView.vue');
const BillingView  = () => import('./views/BillingView.vue');
const LoginView    = () => import('./components/LoginView.vue');

const routes = [
  { path: '/login',         name: 'login',        component: LoginView, meta: { public: true } },
  { path: '/',              name: 'home',         component: HomeView },
  { path: '/plans',         name: 'plans',        component: PlansView },
  { path: '/plans/:id',     name: 'plan-editor',  component: EditorView },
  { path: '/events',        name: 'events',       component: EventsView },
  { path: '/events/:id',    name: 'event-detail', component: EventDetail },
  { path: '/api-keys',      name: 'api-keys',     component: ApiKeysView },
  { path: '/profile',       name: 'profile',      component: ProfileView },
  { path: '/usage',         name: 'usage',        component: UsageView },
  { path: '/billing',       name: 'billing',      component: BillingView },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory('/admin/'),
  routes,
});

router.beforeEach((to) => {
  if (!to.meta.public && !auth.isLoggedIn()) {
    return { name: 'login' };
  }
  if (to.name === 'login' && auth.isLoggedIn()) {
    return { name: 'home' };
  }
});
