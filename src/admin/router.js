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
const BillingView    = () => import('./views/BillingView.vue');
const SettingsView   = () => import('./views/SettingsView.vue');
const TeamView       = () => import('./views/TeamView.vue');
const LoginView           = () => import('./components/LoginView.vue');
const AcceptInvitationView = () => import('./views/AcceptInvitationView.vue');
const DocsView            = () => import('./views/DocsView.vue');

const routes = [
  { path: '/login',              name: 'login',             component: LoginView,           meta: { public: true } },
  { path: '/accept-invitation', name: 'accept-invitation', component: AcceptInvitationView, meta: { public: true } },
  { path: '/docs',              name: 'docs',              component: DocsView,             meta: { public: true } },
  { path: '/',              name: 'home',         component: HomeView },
  { path: '/plans',         name: 'plans',        component: PlansView },
  { path: '/plans/:id',     name: 'plan-editor',  component: EditorView },
  { path: '/events',        name: 'events',       component: EventsView },
  { path: '/events/:id',    name: 'event-detail', component: EventDetail },
  { path: '/api-keys',      name: 'api-keys',     component: ApiKeysView },
  { path: '/profile',       name: 'profile',      component: ProfileView },
  { path: '/usage',         name: 'usage',        component: UsageView },
  { path: '/billing',       name: 'billing',      component: BillingView },
  { path: '/settings',      name: 'settings',     component: SettingsView },
  { path: '/team',          name: 'team',         component: TeamView },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory('/'),
  routes,
});

router.beforeEach((to) => {
  if (window.location.hostname === 'docs.mitoera.com' && to.name !== 'docs') {
    return { name: 'docs' };
  }
  if (!to.meta.public && !auth.isLoggedIn()) {
    return { name: 'login' };
  }
  // Ne pas rediriger vers home si on arrive avec ?verified=1 (flow email verification)
  if (to.name === 'login' && auth.isLoggedIn() && !to.query.verified) {
    return { name: 'home' };
  }
});
