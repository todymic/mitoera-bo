<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const activeSection = ref('introduction');

const sections = [
  { id: 'introduction',    label: 'Introduction' },
  { id: 'authentication',  label: 'Authentification' },
  { id: 'charts',          label: 'Plans (Charts)',
    children: [
      { id: 'charts-list',    label: 'Lister les plans' },
      { id: 'charts-create',  label: 'Créer un plan' },
      { id: 'charts-get',     label: 'Obtenir un plan' },
      { id: 'charts-update',  label: 'Modifier un plan' },
      { id: 'charts-publish', label: 'Publier un plan' },
      { id: 'charts-delete',  label: 'Supprimer un plan' },
    ],
  },
  { id: 'events', label: 'Événements',
    children: [
      { id: 'events-list',       label: 'Lister' },
      { id: 'events-create',     label: 'Créer' },
      { id: 'events-get',        label: 'Obtenir' },
      { id: 'events-update',     label: 'Modifier' },
      { id: 'events-link-chart', label: 'Lier un plan' },
      { id: 'events-seats',      label: 'Sièges' },
      { id: 'events-delete',     label: 'Supprimer' },
    ],
  },
  { id: 'bookings', label: 'Réservations',
    children: [
      { id: 'bookings-hold',          label: 'Bloquer' },
      { id: 'bookings-book',          label: 'Réserver' },
      { id: 'bookings-release',       label: 'Libérer' },
      { id: 'bookings-change-status', label: 'Changer statut' },
    ],
  },
  { id: 'categories', label: 'Catégories',
    children: [
      { id: 'categories-list',   label: 'Lister' },
      { id: 'categories-create', label: 'Créer' },
      { id: 'categories-update', label: 'Modifier' },
      { id: 'categories-delete', label: 'Supprimer' },
    ],
  },
  { id: 'widget',  label: 'Widget JS' },
  { id: 'errors',  label: 'Codes d\'erreur' },
];

function scrollTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  activeSection.value = id;
}

function onScroll() {
  const ids = sections.flatMap(s => s.children ? [s.id, ...s.children.map(c => c.id)] : [s.id]);
  for (const id of [...ids].reverse()) {
    const el = document.getElementById(id);
    if (el && el.getBoundingClientRect().top <= 120) {
      activeSection.value = id;
      return;
    }
  }
}

onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }));
onUnmounted(() => window.removeEventListener('scroll', onScroll));
</script>

<template>
  <div class="docs-root">
    <!-- Sidebar -->
    <nav class="docs-sidebar">
      <div class="sidebar-brand">
        <span class="brand-dot"></span>
        <span class="brand-label">API Reference</span>
      </div>
      <div class="sidebar-base-url">
        <code>https://api.mitoera.com</code>
      </div>
      <ul class="nav-list">
        <template v-for="s in sections" :key="s.id">
          <li>
            <button
              class="nav-item"
              :class="{ active: activeSection === s.id }"
              @click="scrollTo(s.id)"
            >{{ s.label }}</button>
          </li>
          <template v-if="s.children">
            <li v-for="c in s.children" :key="c.id">
              <button
                class="nav-item nav-child"
                :class="{ active: activeSection === c.id }"
                @click="scrollTo(c.id)"
              >{{ c.label }}</button>
            </li>
          </template>
        </template>
      </ul>
    </nav>

    <!-- Main content -->
    <main class="docs-main">

      <!-- Introduction -->
      <section id="introduction" class="doc-section">
        <h1>Mitoera API</h1>
        <p class="lead">L'API Mitoera vous permet de gérer vos plans de salle, événements et réservations par programmation. Elle est accessible en REST, retourne du JSON et utilise des clés API pour l'authentification.</p>
        <div class="info-box">
          <strong>Base URL</strong>
          <code>https://api.mitoera.com/api</code>
          <br><br>
          <strong>Sandbox</strong>
          <code>https://api.mitoera.com/sandbox-api</code>
          <p style="margin-top:8px;margin-bottom:0">Le sandbox est un environnement isolé avec des données distinctes. Il accepte les mêmes endpoints et clés que la production.</p>
        </div>
      </section>

      <!-- Authentication -->
      <section id="authentication" class="doc-section">
        <h2>Authentification</h2>
        <p>Mitoera utilise deux types de clés API, disponibles dans votre <a href="/api-keys">back-office</a>.</p>

        <div class="key-types">
          <div class="key-card">
            <div class="key-badge key-backoffice">backoffice</div>
            <strong>Clé secrète</strong>
            <p>Accès complet en lecture et écriture : plans, événements, réservations, catégories. À utiliser uniquement côté serveur.</p>
            <code>pk_xxxxxxxx:sk_xxxxxxxx</code>
          </div>
          <div class="key-card">
            <div class="key-badge key-public">public</div>
            <strong>Clé publique</strong>
            <p>Accès en lecture seule pour le widget client. Peut être exposée dans le code front-end.</p>
            <code>pk_pub_xxxxxxxx</code>
          </div>
        </div>

        <h3>Header d'autorisation</h3>
        <p>Toutes les requêtes doivent inclure un header <code>Authorization</code>.</p>
        <div class="code-block">
          <div class="code-label">HTTP</div>
          <pre><code><span class="c-key">Authorization</span>: <span class="c-str">Basic</span> <span class="c-val">{base64(keyId:secret)}</span></code></pre>
        </div>
        <div class="code-block">
          <div class="code-label">curl</div>
          <pre><code>curl https://api.mitoera.com/api/charts \
  -u <span class="c-str">pk_abc123:sk_xyz789</span></code></pre>
        </div>
        <div class="code-block">
          <div class="code-label">JavaScript</div>
          <pre><code><span class="c-key">const</span> res = <span class="c-fn">await</span> fetch(<span class="c-str">'https://api.mitoera.com/api/charts'</span>, {
  headers: {
    <span class="c-str">'Authorization'</span>: <span class="c-str">`Basic ${btoa('pk_abc123:sk_xyz789')}`</span>
  }
});
<span class="c-key">const</span> data = <span class="c-fn">await</span> res.<span class="c-fn">json</span>();</code></pre>
        </div>
      </section>

      <!-- Charts -->
      <section id="charts" class="doc-section">
        <h2>Plans <span class="section-tag">Charts</span></h2>
        <p>Un plan (<em>chart</em>) est la carte SVG d'une salle avec ses sièges, rangées et catégories. Il peut être lié à plusieurs événements.</p>

        <div id="charts-list" class="endpoint">
          <div class="endpoint-header">
            <span class="method get">GET</span>
            <code class="endpoint-path">/api/charts</code>
          </div>
          <p>Retourne tous les plans du workspace actif.</p>
          <div class="code-block">
            <div class="code-label">Réponse 200</div>
            <pre><code>[
  {
    <span class="c-str">"id"</span>: <span class="c-val">"01926a3f-…"</span>,
    <span class="c-str">"name"</span>: <span class="c-val">"Salle Olympia"</span>,
    <span class="c-str">"slug"</span>: <span class="c-val">"salle-olympia"</span>,
    <span class="c-str">"status"</span>: <span class="c-val">"published"</span>,
    <span class="c-str">"createdAt"</span>: <span class="c-val">"2025-01-15T10:00:00Z"</span>
  }
]</code></pre>
          </div>
        </div>

        <div id="charts-create" class="endpoint">
          <div class="endpoint-header">
            <span class="method post">POST</span>
            <code class="endpoint-path">/api/charts</code>
          </div>
          <p>Crée un nouveau plan vide.</p>
          <table class="params-table">
            <thead><tr><th>Champ</th><th>Type</th><th>Requis</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>name</code></td><td>string</td><td><span class="req">oui</span></td><td>Nom du plan</td></tr>
            </tbody>
          </table>
          <div class="code-block">
            <div class="code-label">curl</div>
            <pre><code>curl -X POST https://api.mitoera.com/api/charts \
  -u <span class="c-str">pk_abc123:sk_xyz789</span> \
  -H <span class="c-str">'Content-Type: application/json'</span> \
  -d <span class="c-str">'{"name":"Salle Olympia"}'</span></code></pre>
          </div>
        </div>

        <div id="charts-get" class="endpoint">
          <div class="endpoint-header">
            <span class="method get">GET</span>
            <code class="endpoint-path">/api/charts/<span class="path-param">{chartId}</span></code>
          </div>
          <p>Retourne un plan par son UUID.</p>
          <table class="params-table">
            <thead><tr><th>Paramètre URL</th><th>Type</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>chartId</code></td><td>uuid (string)</td><td>UUID du plan</td></tr>
            </tbody>
          </table>
          <div class="code-block">
            <div class="code-label">curl</div>
            <pre><code>curl https://api.mitoera.com/api/charts/<span class="c-val">01926a3f-1234-7abc-8def-000000000001</span> \
  -u <span class="c-str">pk_abc123:sk_xyz789</span></code></pre>
          </div>
          <div class="code-block">
            <div class="code-label">Réponse 200</div>
            <pre><code>{
  <span class="c-str">"id"</span>: <span class="c-val">"01926a3f-1234-7abc-8def-000000000001"</span>,
  <span class="c-str">"name"</span>: <span class="c-val">"Salle Olympia"</span>,
  <span class="c-str">"slug"</span>: <span class="c-val">"salle-olympia"</span>,
  <span class="c-str">"status"</span>: <span class="c-val">"published"</span>,
  <span class="c-str">"createdAt"</span>: <span class="c-val">"2025-01-15T10:00:00Z"</span>
}</code></pre>
          </div>
        </div>

        <div id="charts-update" class="endpoint">
          <div class="endpoint-header">
            <span class="method put">PUT</span>
            <code class="endpoint-path">/api/charts/<span class="path-param">{chartId}</span></code>
          </div>
          <p>Met à jour le nom ou les données SVG d'un plan.</p>
          <table class="params-table">
            <thead><tr><th>Paramètre URL</th><th>Type</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>chartId</code></td><td>uuid (string)</td><td>UUID du plan à modifier</td></tr>
            </tbody>
          </table>
          <table class="params-table">
            <thead><tr><th>Champ</th><th>Type</th><th>Requis</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>name</code></td><td>string</td><td>non</td><td>Nouveau nom</td></tr>
              <tr><td><code>objects</code></td><td>array</td><td>non</td><td>Données des objets du plan</td></tr>
            </tbody>
          </table>
          <div class="code-block">
            <div class="code-label">curl</div>
            <pre><code>curl -X PUT https://api.mitoera.com/api/charts/<span class="c-val">01926a3f-1234-7abc-8def-000000000001</span> \
  -u <span class="c-str">pk_abc123:sk_xyz789</span> \
  -H <span class="c-str">'Content-Type: application/json'</span> \
  -d <span class="c-str">'{"name":"Grande Salle"}'</span></code></pre>
          </div>
        </div>

        <div id="charts-publish" class="endpoint">
          <div class="endpoint-header">
            <span class="method post">POST</span>
            <code class="endpoint-path">/api/charts/<span class="path-param">{chartId}</span>/publish</code>
          </div>
          <p>Publie un plan. Un plan publié peut être associé à des événements et utilisé par le widget. Les modifications ultérieures passent par un état "en attente" avant republication.</p>
          <table class="params-table">
            <thead><tr><th>Paramètre URL</th><th>Type</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>chartId</code></td><td>uuid (string)</td><td>UUID du plan à publier</td></tr>
            </tbody>
          </table>
          <div class="code-block">
            <div class="code-label">curl</div>
            <pre><code>curl -X POST https://api.mitoera.com/api/charts/<span class="c-val">01926a3f-1234-7abc-8def-000000000001</span>/publish \
  -u <span class="c-str">pk_abc123:sk_xyz789</span></code></pre>
          </div>
        </div>

        <div id="charts-delete" class="endpoint">
          <div class="endpoint-header">
            <span class="method delete">DELETE</span>
            <code class="endpoint-path">/api/charts/<span class="path-param">{chartId}</span></code>
          </div>
          <p>Supprime un plan. Impossible si le plan est lié à des événements actifs.</p>
          <table class="params-table">
            <thead><tr><th>Paramètre URL</th><th>Type</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>chartId</code></td><td>uuid (string)</td><td>UUID du plan à supprimer</td></tr>
            </tbody>
          </table>
          <div class="code-block">
            <div class="code-label">curl</div>
            <pre><code>curl -X DELETE https://api.mitoera.com/api/charts/<span class="c-val">01926a3f-1234-7abc-8def-000000000001</span> \
  -u <span class="c-str">pk_abc123:sk_xyz789</span></code></pre>
          </div>
        </div>
      </section>

      <!-- Events -->
      <section id="events" class="doc-section">
        <h2>Événements</h2>
        <p>Un événement représente une date/occurrence d'un spectacle sur un plan donné. C'est au niveau de l'événement que les sièges sont réservés.</p>

        <div id="events-list" class="endpoint">
          <div class="endpoint-header">
            <span class="method get">GET</span>
            <code class="endpoint-path">/api/events</code>
          </div>
          <p>Retourne tous les événements du workspace.</p>
          <div class="code-block">
            <div class="code-label">Réponse 200</div>
            <pre><code>[
  {
    <span class="c-str">"id"</span>: <span class="c-val">"01926b1c-…"</span>,
    <span class="c-str">"name"</span>: <span class="c-val">"Concert 12 mars"</span>,
    <span class="c-str">"identifier"</span>: <span class="c-val">"concert-12-mars"</span>,
    <span class="c-str">"chartId"</span>: <span class="c-val">"01926a3f-…"</span>,
    <span class="c-str">"date"</span>: <span class="c-val">"2025-03-12T20:00:00Z"</span>,
    <span class="c-str">"holdDuration"</span>: <span class="c-val">15</span>
  }
]</code></pre>
          </div>
        </div>

        <div id="events-create" class="endpoint">
          <div class="endpoint-header">
            <span class="method post">POST</span>
            <code class="endpoint-path">/api/events</code>
          </div>
          <table class="params-table">
            <thead><tr><th>Champ</th><th>Type</th><th>Requis</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>name</code></td><td>string</td><td><span class="req">oui</span></td><td>Nom de l'événement</td></tr>
              <tr><td><code>date</code></td><td>string (ISO 8601)</td><td>non</td><td>Date de l'événement</td></tr>
              <tr><td><code>chartId</code></td><td>uuid (string)</td><td>non</td><td>UUID du plan à associer</td></tr>
              <tr><td><code>holdDuration</code></td><td>integer</td><td>non</td><td>Durée de blocage en minutes (défaut: 15)</td></tr>
            </tbody>
          </table>
          <div class="code-block">
            <div class="code-label">curl</div>
            <pre><code>curl -X POST https://api.mitoera.com/api/events \
  -u <span class="c-str">pk_abc123:sk_xyz789</span> \
  -H <span class="c-str">'Content-Type: application/json'</span> \
  -d <span class="c-str">'{"name":"Concert 12 mars","date":"2025-03-12T20:00:00Z","chartId":"01926a3f-1234-7abc-8def-000000000001","holdDuration":15}'</span></code></pre>
          </div>
        </div>

        <div id="events-get" class="endpoint">
          <div class="endpoint-header">
            <span class="method get">GET</span>
            <code class="endpoint-path">/api/events/<span class="path-param">{eventId}</span></code>
          </div>
          <p>Retourne un événement par UUID. Utilisez <code>/api/events/lookup/<span class="path-param">{identifier}</span></code> pour chercher par identifiant textuel.</p>
          <table class="params-table">
            <thead><tr><th>Paramètre URL</th><th>Type</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>eventId</code></td><td>uuid (string)</td><td>UUID de l'événement</td></tr>
            </tbody>
          </table>
          <div class="code-block">
            <div class="code-label">curl</div>
            <pre><code>curl https://api.mitoera.com/api/events/<span class="c-val">01926b1c-5678-7abc-8def-000000000002</span> \
  -u <span class="c-str">pk_abc123:sk_xyz789</span></code></pre>
          </div>
        </div>

        <div id="events-update" class="endpoint">
          <div class="endpoint-header">
            <span class="method put">PUT</span>
            <code class="endpoint-path">/api/events/<span class="path-param">{eventId}</span></code>
          </div>
          <p>Met à jour le nom, la date ou la durée de blocage d'un événement.</p>
          <table class="params-table">
            <thead><tr><th>Paramètre URL</th><th>Type</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>eventId</code></td><td>uuid (string)</td><td>UUID de l'événement à modifier</td></tr>
            </tbody>
          </table>
          <table class="params-table">
            <thead><tr><th>Champ</th><th>Type</th><th>Requis</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>name</code></td><td>string</td><td>non</td><td>Nouveau nom</td></tr>
              <tr><td><code>date</code></td><td>string (ISO 8601)</td><td>non</td><td>Nouvelle date</td></tr>
              <tr><td><code>holdDuration</code></td><td>integer</td><td>non</td><td>Nouvelle durée de blocage en minutes</td></tr>
            </tbody>
          </table>
          <div class="code-block">
            <div class="code-label">curl</div>
            <pre><code>curl -X PUT https://api.mitoera.com/api/events/<span class="c-val">01926b1c-5678-7abc-8def-000000000002</span> \
  -u <span class="c-str">pk_abc123:sk_xyz789</span> \
  -H <span class="c-str">'Content-Type: application/json'</span> \
  -d <span class="c-str">'{"name":"Concert 15 mars","holdDuration":20}'</span></code></pre>
          </div>
        </div>

        <div id="events-link-chart" class="endpoint">
          <div class="endpoint-header">
            <span class="method post">POST</span>
            <code class="endpoint-path">/api/events/<span class="path-param">{eventId}</span>/link-chart/<span class="path-param">{chartId}</span></code>
          </div>
          <p>Associe un plan publié à un événement. Un événement ne peut avoir qu'un seul plan à la fois.</p>
          <table class="params-table">
            <thead><tr><th>Paramètre URL</th><th>Type</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>eventId</code></td><td>uuid (string)</td><td>UUID de l'événement</td></tr>
              <tr><td><code>chartId</code></td><td>uuid (string)</td><td>UUID du plan publié à associer</td></tr>
            </tbody>
          </table>
          <div class="code-block">
            <div class="code-label">curl</div>
            <pre><code>curl -X POST https://api.mitoera.com/api/events/<span class="c-val">01926b1c-5678-7abc-8def-000000000002</span>/link-chart/<span class="c-val">01926a3f-1234-7abc-8def-000000000001</span> \
  -u <span class="c-str">pk_abc123:sk_xyz789</span></code></pre>
          </div>
        </div>

        <div id="events-seats" class="endpoint">
          <div class="endpoint-header">
            <span class="method get">GET</span>
            <code class="endpoint-path">/api/events/<span class="path-param">{eventId}</span>/seats</code>
          </div>
          <p>Retourne l'état de tous les sièges d'un événement.</p>
          <table class="params-table">
            <thead><tr><th>Paramètre URL</th><th>Type</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>eventId</code></td><td>uuid (string)</td><td>UUID de l'événement</td></tr>
            </tbody>
          </table>
          <div class="code-block">
            <div class="code-label">Réponse 200</div>
            <pre><code>[
  {
    <span class="c-str">"seatId"</span>: <span class="c-val">"A-1"</span>,
    <span class="c-str">"status"</span>: <span class="c-val">"available"</span>,
    <span class="c-str">"categoryId"</span>: <span class="c-val">"01926c…"</span>,
    <span class="c-str">"orderId"</span>: <span class="c-val">null</span>
  },
  {
    <span class="c-str">"seatId"</span>: <span class="c-val">"A-2"</span>,
    <span class="c-str">"status"</span>: <span class="c-val">"booked"</span>,
    <span class="c-str">"categoryId"</span>: <span class="c-val">"01926c…"</span>,
    <span class="c-str">"orderId"</span>: <span class="c-val">"order-42"</span>
  }
]</code></pre>
          </div>
          <div class="info-box" style="margin-top:12px">
            <strong>Statuts possibles</strong>
            <div class="status-grid">
              <span class="status-pill available">available</span>
              <span class="status-pill held">held</span>
              <span class="status-pill booked">booked</span>
              <span class="status-pill disabled">disabled</span>
            </div>
          </div>
        </div>

        <div id="events-delete" class="endpoint">
          <div class="endpoint-header">
            <span class="method delete">DELETE</span>
            <code class="endpoint-path">/api/events/<span class="path-param">{eventId}</span></code>
          </div>
          <table class="params-table">
            <thead><tr><th>Paramètre URL</th><th>Type</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>eventId</code></td><td>uuid (string)</td><td>UUID de l'événement à supprimer</td></tr>
            </tbody>
          </table>
          <div class="code-block">
            <div class="code-label">curl</div>
            <pre><code>curl -X DELETE https://api.mitoera.com/api/events/<span class="c-val">01926b1c-5678-7abc-8def-000000000002</span> \
  -u <span class="c-str">pk_abc123:sk_xyz789</span></code></pre>
          </div>
        </div>
      </section>

      <!-- Bookings -->
      <section id="bookings" class="doc-section">
        <h2>Réservations</h2>
        <p>Les endpoints de réservation permettent de gérer le cycle de vie des sièges. Ils doivent être appelés depuis votre serveur avec la clé secrète.</p>

        <div id="bookings-hold" class="endpoint">
          <div class="endpoint-header">
            <span class="method post">POST</span>
            <code class="endpoint-path">/api/events/<span class="path-param">{eventId}</span>/hold</code>
          </div>
          <p>Bloque temporairement des sièges (durée configurée par <code>holdDuration</code> sur l'événement). Utilisé pour garantir les sièges pendant le checkout.</p>
          <table class="params-table">
            <thead><tr><th>Champ</th><th>Type</th><th>Requis</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>seats</code></td><td>string[]</td><td><span class="req">oui</span></td><td>Liste des seatId à bloquer</td></tr>
              <tr><td><code>orderId</code></td><td>string</td><td>non</td><td>Identifiant de commande</td></tr>
            </tbody>
          </table>
          <div class="code-block">
            <div class="code-label">curl</div>
            <pre><code>curl -X POST https://api.mitoera.com/api/events/<span class="c-val">EVENT_ID</span>/hold \
  -u <span class="c-str">pk_abc123:sk_xyz789</span> \
  -H <span class="c-str">'Content-Type: application/json'</span> \
  -d <span class="c-str">'{"seats":["A-1","A-2"],"orderId":"order-42"}'</span></code></pre>
          </div>
        </div>

        <div id="bookings-book" class="endpoint">
          <div class="endpoint-header">
            <span class="method post">POST</span>
            <code class="endpoint-path">/api/events/<span class="path-param">{eventId}</span>/book</code>
          </div>
          <p>Confirme la réservation de sièges. Passe leur statut à <code>booked</code> de façon permanente.</p>
          <table class="params-table">
            <thead><tr><th>Champ</th><th>Type</th><th>Requis</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>seats</code></td><td>string[]</td><td><span class="req">oui</span></td><td>Liste des seatId à confirmer</td></tr>
              <tr><td><code>orderId</code></td><td>string</td><td>non</td><td>Identifiant de commande</td></tr>
            </tbody>
          </table>
        </div>

        <div id="bookings-release" class="endpoint">
          <div class="endpoint-header">
            <span class="method post">POST</span>
            <code class="endpoint-path">/api/events/<span class="path-param">{eventId}</span>/release</code>
          </div>
          <p>Libère des sièges bloqués ou réservés. Les remet à l'état <code>available</code>.</p>
          <table class="params-table">
            <thead><tr><th>Champ</th><th>Type</th><th>Requis</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>seats</code></td><td>string[]</td><td><span class="req">oui</span></td><td>Liste des seatId à libérer</td></tr>
            </tbody>
          </table>
        </div>

        <div id="bookings-change-status" class="endpoint">
          <div class="endpoint-header">
            <span class="method post">POST</span>
            <code class="endpoint-path">/api/events/<span class="path-param">{eventId}</span>/change-status</code>
          </div>
          <p>Définit manuellement le statut d'un ou plusieurs sièges.</p>
          <table class="params-table">
            <thead><tr><th>Champ</th><th>Type</th><th>Requis</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>seats</code></td><td>string[]</td><td><span class="req">oui</span></td><td>Liste des seatId</td></tr>
              <tr><td><code>status</code></td><td>string</td><td><span class="req">oui</span></td><td><code>available</code> | <code>held</code> | <code>booked</code> | <code>disabled</code></td></tr>
              <tr><td><code>orderId</code></td><td>string</td><td>non</td><td>Identifiant de commande associé</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Categories -->
      <section id="categories" class="doc-section">
        <h2>Catégories</h2>
        <p>Les catégories regroupent les sièges par tarif ou zone. Chaque siège dans le plan appartient à une catégorie.</p>

        <div id="categories-list" class="endpoint">
          <div class="endpoint-header">
            <span class="method get">GET</span>
            <code class="endpoint-path">/api/categories</code>
          </div>
          <div class="code-block">
            <div class="code-label">Réponse 200</div>
            <pre><code>[
  {
    <span class="c-str">"id"</span>: <span class="c-val">"01926c4d-…"</span>,
    <span class="c-str">"name"</span>: <span class="c-val">"Carré Or"</span>,
    <span class="c-str">"color"</span>: <span class="c-val">"#E8602A"</span>,
    <span class="c-str">"pricing"</span>: <span class="c-val">85.00</span>
  }
]</code></pre>
          </div>
        </div>

        <div id="categories-create" class="endpoint">
          <div class="endpoint-header">
            <span class="method post">POST</span>
            <code class="endpoint-path">/api/categories</code>
          </div>
          <table class="params-table">
            <thead><tr><th>Champ</th><th>Type</th><th>Requis</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>name</code></td><td>string</td><td><span class="req">oui</span></td><td>Nom de la catégorie</td></tr>
              <tr><td><code>color</code></td><td>string (hex)</td><td>non</td><td>Couleur d'affichage, ex : <code>#E8602A</code></td></tr>
              <tr><td><code>pricing</code></td><td>number</td><td>non</td><td>Tarif de base</td></tr>
            </tbody>
          </table>
          <div class="code-block">
            <div class="code-label">curl</div>
            <pre><code>curl -X POST https://api.mitoera.com/api/categories \
  -u <span class="c-str">pk_abc123:sk_xyz789</span> \
  -H <span class="c-str">'Content-Type: application/json'</span> \
  -d <span class="c-str">'{"name":"Carré Or","color":"#E8602A","pricing":85.00}'</span></code></pre>
          </div>
        </div>

        <div id="categories-update" class="endpoint">
          <div class="endpoint-header">
            <span class="method put">PUT</span>
            <code class="endpoint-path">/api/categories/<span class="path-param">{categoryId}</span></code>
          </div>
          <table class="params-table">
            <thead><tr><th>Paramètre URL</th><th>Type</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>categoryId</code></td><td>uuid (string)</td><td>UUID de la catégorie à modifier</td></tr>
            </tbody>
          </table>
          <table class="params-table">
            <thead><tr><th>Champ</th><th>Type</th><th>Requis</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>name</code></td><td>string</td><td>non</td><td>Nouveau nom</td></tr>
              <tr><td><code>color</code></td><td>string (hex)</td><td>non</td><td>Nouvelle couleur</td></tr>
              <tr><td><code>pricing</code></td><td>number</td><td>non</td><td>Nouveau tarif de base</td></tr>
            </tbody>
          </table>
          <div class="code-block">
            <div class="code-label">curl</div>
            <pre><code>curl -X PUT https://api.mitoera.com/api/categories/<span class="c-val">01926c4d-9012-7abc-8def-000000000003</span> \
  -u <span class="c-str">pk_abc123:sk_xyz789</span> \
  -H <span class="c-str">'Content-Type: application/json'</span> \
  -d <span class="c-str">'{"pricing":90.00}'</span></code></pre>
          </div>
        </div>

        <div id="categories-delete" class="endpoint">
          <div class="endpoint-header">
            <span class="method delete">DELETE</span>
            <code class="endpoint-path">/api/categories/<span class="path-param">{categoryId}</span></code>
          </div>
          <table class="params-table">
            <thead><tr><th>Paramètre URL</th><th>Type</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>categoryId</code></td><td>uuid (string)</td><td>UUID de la catégorie à supprimer</td></tr>
            </tbody>
          </table>
          <div class="code-block">
            <div class="code-label">curl</div>
            <pre><code>curl -X DELETE https://api.mitoera.com/api/categories/<span class="c-val">01926c4d-9012-7abc-8def-000000000003</span> \
  -u <span class="c-str">pk_abc123:sk_xyz789</span></code></pre>
          </div>
        </div>
      </section>

      <!-- Widget -->
      <section id="widget" class="doc-section">
        <h2>Widget JS</h2>
        <p>Le widget JavaScript embarque le plan de salle interactif dans votre site. Il utilise votre <strong>clé publique</strong> et n'expose aucun accès en écriture.</p>

        <h3>Intégration</h3>
        <div class="code-block">
          <div class="code-label">HTML</div>
          <pre><code><span class="c-tag">&lt;div</span> <span class="c-attr">id</span>=<span class="c-str">"mitoera-chart"</span><span class="c-tag">&gt;&lt;/div&gt;</span>
<span class="c-tag">&lt;script</span> <span class="c-attr">src</span>=<span class="c-str">"https://bo.mitoera.com/mitoera-widget.js"</span><span class="c-tag">&gt;&lt;/script&gt;</span>
<span class="c-tag">&lt;script&gt;</span>
  <span class="c-key">new</span> Mitoera.<span class="c-fn">SeatingChart</span>({
    <span class="c-str">divId</span>: <span class="c-val">'mitoera-chart'</span>,
    <span class="c-str">workspaceKey</span>: <span class="c-val">'pk_pub_xxxxxxxx'</span>,
    <span class="c-str">event</span>: <span class="c-val">'UUID_DE_L_EVENEMENT'</span>,
    <span class="c-str">onSeatSelected</span>:   (seat) =&gt; console.<span class="c-fn">log</span>(<span class="c-val">'sélectionné'</span>, seat),
    <span class="c-str">onSeatDeselected</span>: (seat) =&gt; console.<span class="c-fn">log</span>(<span class="c-val">'désélectionné'</span>, seat),
    <span class="c-str">onCheckout</span>:       (seats) =&gt; {
      <span class="c-comment">// Appelez votre serveur pour confirmer la réservation</span>
      myServer.<span class="c-fn">book</span>(seats);
    },
  }).<span class="c-fn">render</span>();
<span class="c-tag">&lt;/script&gt;</span></code></pre>
        </div>

        <h3>Options</h3>
        <table class="params-table">
          <thead><tr><th>Option</th><th>Type</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><code>divId</code></td><td>string</td><td>ID de l'élément HTML conteneur</td></tr>
            <tr><td><code>workspaceKey</code></td><td>string</td><td>Clé publique (<code>pk_pub_…</code>)</td></tr>
            <tr><td><code>event</code></td><td>string (uuid)</td><td>UUID de l'événement à afficher</td></tr>
            <tr><td><code>onSeatSelected</code></td><td>function</td><td>Callback — siège sélectionné</td></tr>
            <tr><td><code>onSeatDeselected</code></td><td>function</td><td>Callback — siège désélectionné</td></tr>
            <tr><td><code>onCheckout</code></td><td>function</td><td>Callback — validation du panier</td></tr>
          </tbody>
        </table>

        <h3>Éditeur de plan embarqué</h3>
        <p>Pour embarquer l'éditeur de plan dans votre back-office, utilisez votre <strong>clé secrète</strong>. En sandbox, passez <code>sandbox: true</code> pour que le SDK utilise l'environnement de test.</p>
        <div class="code-block">
          <div class="code-label">HTML — Production</div>
          <pre><code><span class="c-tag">&lt;div</span> <span class="c-attr">id</span>=<span class="c-str">"chartDesigner"</span> <span class="c-attr">style</span>=<span class="c-str">"height:600px"</span><span class="c-tag">&gt;&lt;/div&gt;</span>
<span class="c-tag">&lt;script</span> <span class="c-attr">src</span>=<span class="c-str">"https://bo.mitoera.com/mitoera-editor.js"</span><span class="c-tag">&gt;&lt;/script&gt;</span>
<span class="c-tag">&lt;script&gt;</span>
  <span class="c-key">new</span> mitoera.<span class="c-fn">ChartDesigner</span>({
    <span class="c-str">divId</span>: <span class="c-val">'chartDesigner'</span>,
    <span class="c-str">secretKey</span>: <span class="c-val">'pk_xxxxxxxx:sk_xxxxxxxx'</span>,
    <span class="c-str">chartKey</span>: <span class="c-val">'UUID_DU_PLAN'</span>,
  }).<span class="c-fn">render</span>();
<span class="c-tag">&lt;/script&gt;</span></code></pre>
        </div>
        <div class="code-block">
          <div class="code-label">HTML — Sandbox</div>
          <pre><code><span class="c-tag">&lt;div</span> <span class="c-attr">id</span>=<span class="c-str">"chartDesigner"</span> <span class="c-attr">style</span>=<span class="c-str">"height:600px"</span><span class="c-tag">&gt;&lt;/div&gt;</span>
<span class="c-tag">&lt;script</span> <span class="c-attr">src</span>=<span class="c-str">"https://bo.mitoera.com/mitoera-editor.js"</span><span class="c-tag">&gt;&lt;/script&gt;</span>
<span class="c-tag">&lt;script&gt;</span>
  <span class="c-key">new</span> mitoera.<span class="c-fn">ChartDesigner</span>({
    <span class="c-str">divId</span>: <span class="c-val">'chartDesigner'</span>,
    <span class="c-str">secretKey</span>: <span class="c-val">'pk_xxxxxxxx:sk_xxxxxxxx'</span>,
    <span class="c-str">chartKey</span>: <span class="c-val">'UUID_DU_PLAN'</span>,
    <span class="c-str">sandbox</span>: <span class="c-key">true</span>,  <span class="c-comment">// utilise https://api.mitoera.com/sandbox-api</span>
  }).<span class="c-fn">render</span>();
<span class="c-tag">&lt;/script&gt;</span></code></pre>
        </div>
        <table class="params-table" style="margin-top:12px">
          <thead><tr><th>Option</th><th>Type</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><code>divId</code></td><td>string</td><td>ID de l'élément HTML conteneur</td></tr>
            <tr><td><code>secretKey</code></td><td>string</td><td>Clé secrète au format <code>keyId:secret</code></td></tr>
            <tr><td><code>chartKey</code></td><td>string (uuid)</td><td>UUID du plan à éditer</td></tr>
            <tr><td><code>eventKey</code></td><td>string (uuid)</td><td>UUID de l'événement lié (optionnel)</td></tr>
            <tr><td><code>sandbox</code></td><td>boolean</td><td>Utiliser l'environnement sandbox (défaut: <code>false</code>)</td></tr>
          </tbody>
        </table>
      </section>

      <!-- Errors -->
      <section id="errors" class="doc-section">
        <h2>Codes d'erreur</h2>
        <table class="params-table errors-table">
          <thead><tr><th>Code</th><th>Signification</th></tr></thead>
          <tbody>
            <tr><td><span class="http-code ok">200</span></td><td>Succès</td></tr>
            <tr><td><span class="http-code ok">201</span></td><td>Ressource créée</td></tr>
            <tr><td><span class="http-code warn">400</span></td><td>Paramètres invalides — vérifiez le corps de la requête</td></tr>
            <tr><td><span class="http-code warn">401</span></td><td>Clé API absente ou invalide</td></tr>
            <tr><td><span class="http-code warn">403</span></td><td>La ressource ne vous appartient pas</td></tr>
            <tr><td><span class="http-code warn">404</span></td><td>Ressource introuvable</td></tr>
            <tr><td><span class="http-code err">409</span></td><td>Conflit — siège déjà réservé, nom déjà utilisé…</td></tr>
            <tr><td><span class="http-code err">500</span></td><td>Erreur serveur interne</td></tr>
          </tbody>
        </table>
        <div class="code-block" style="margin-top:16px">
          <div class="code-label">Corps d'erreur</div>
          <pre><code>{
  <span class="c-str">"error"</span>: <span class="c-val">"Le nom est requis"</span>
}</code></pre>
        </div>
      </section>

    </main>
  </div>
</template>

<style scoped>
.docs-root {
  --docs-bg:       #0F1117;
  --docs-surface:  #161921;
  --docs-border:   #252836;
  --docs-text:     #DDE1EE;
  --docs-muted:    #5E6A88;
  --docs-accent:   #E8602A;
  --docs-code-bg:  #12141C;
  --docs-sidebar-w: 256px;
}

/* ---- Root layout ---- */
.docs-root {
  display: flex;
  min-height: 100vh;
  background: var(--docs-bg);
  color: var(--docs-text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.65;
}

/* ---- Sidebar ---- */
.docs-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  width: var(--docs-sidebar-w);
  height: 100vh;
  overflow-y: auto;
  background: var(--docs-surface);
  border-right: 1px solid var(--docs-border);
  padding: 24px 0 40px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px 16px;
  border-bottom: 1px solid var(--docs-border);
  margin-bottom: 8px;
}
.brand-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--docs-accent);
  flex-shrink: 0;
}
.brand-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--docs-muted);
}

.sidebar-base-url {
  padding: 8px 20px 16px;
  border-bottom: 1px solid var(--docs-border);
  margin-bottom: 8px;
}
.sidebar-base-url code {
  font-size: 11px;
  color: var(--docs-muted);
  font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
}

.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.nav-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  padding: 5px 20px;
  font-size: 13px;
  color: var(--docs-muted);
  border-left: 2px solid transparent;
  transition: color .12s, border-color .12s, background .12s;
}
.nav-item:hover { color: var(--docs-text); background: rgba(255,255,255,.03); }
.nav-item.active { color: var(--docs-accent); border-left-color: var(--docs-accent); }
.nav-child { padding-left: 34px; font-size: 12.5px; }

/* ---- Main ---- */
.docs-main {
  margin-left: var(--docs-sidebar-w);
  flex: 1;
  max-width: 820px;
  padding: 56px 48px 120px;
}

.doc-section {
  margin-bottom: 64px;
  scroll-margin-top: 24px;
}

h1 {
  font-size: 28px;
  font-weight: 700;
  color: var(--docs-text);
  margin: 0 0 12px;
  line-height: 1.25;
  text-wrap: balance;
}
h2 {
  font-size: 20px;
  font-weight: 600;
  color: var(--docs-text);
  margin: 0 0 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--docs-border);
  display: flex;
  align-items: center;
  gap: 10px;
}
h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--docs-text);
  margin: 28px 0 8px;
  text-transform: uppercase;
  letter-spacing: .06em;
}
.section-tag {
  font-size: 11px;
  font-weight: 500;
  background: rgba(232,96,42,.15);
  color: var(--docs-accent);
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: .04em;
}
.lead {
  font-size: 15px;
  color: var(--docs-text);
  opacity: .85;
  margin: 0 0 20px;
  max-width: 60ch;
}
p { margin: 0 0 12px; color: var(--docs-text); opacity: .85; }
a { color: var(--docs-accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code {
  font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
  font-size: 12.5px;
  background: rgba(255,255,255,.07);
  padding: 1px 5px;
  border-radius: 4px;
  color: #B8C4E0;
}

/* ---- Info box ---- */
.info-box {
  background: rgba(232,96,42,.07);
  border: 1px solid rgba(232,96,42,.25);
  border-radius: 8px;
  padding: 16px 20px;
  font-size: 13.5px;
  margin: 16px 0;
  color: var(--docs-text);
}
.info-box code {
  background: rgba(255,255,255,.08);
  font-size: 12px;
  display: inline-block;
  margin-top: 4px;
}

/* ---- Key cards ---- */
.key-types { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0 24px; }
.key-card {
  background: var(--docs-surface);
  border: 1px solid var(--docs-border);
  border-radius: 10px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.key-card strong { font-size: 14px; color: var(--docs-text); }
.key-card p { font-size: 12.5px; margin: 0; }
.key-card code { font-size: 11px; }
.key-badge {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .07em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 4px;
  width: fit-content;
}
.key-backoffice { background: rgba(239,68,68,.12); color: #F87171; }
.key-public     { background: rgba(34,197,94,.12);  color: #4ADE80; }

/* ---- Endpoint ---- */
.endpoint {
  margin: 28px 0;
  padding: 20px 24px;
  background: var(--docs-surface);
  border: 1px solid var(--docs-border);
  border-radius: 10px;
  scroll-margin-top: 24px;
}
.endpoint-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.endpoint-path {
  font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
  font-size: 14px;
  background: none;
  padding: 0;
  color: var(--docs-text);
}
.path-param { color: var(--docs-accent); }

/* Method badges */
.method {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .07em;
  padding: 3px 8px;
  border-radius: 5px;
  flex-shrink: 0;
}
.get    { background: rgba(34,197,94,.15);  color: #4ADE80; }
.post   { background: rgba(59,130,246,.15); color: #60A5FA; }
.put    { background: rgba(139,92,246,.15); color: #A78BFA; }
.patch  { background: rgba(245,158,11,.15); color: #FCD34D; }
.delete { background: rgba(239,68,68,.15);  color: #F87171; }

/* ---- Code blocks ---- */
.code-block {
  margin: 12px 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--docs-border);
}
.code-label {
  background: rgba(255,255,255,.04);
  border-bottom: 1px solid var(--docs-border);
  padding: 5px 14px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--docs-muted);
}
.code-block pre {
  margin: 0;
  padding: 14px 18px;
  background: var(--docs-code-bg);
  overflow-x: auto;
  font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
  font-size: 12.5px;
  line-height: 1.7;
}
.code-block code {
  background: none;
  padding: 0;
  font-size: inherit;
  color: #B8C4E0;
}

/* Syntax colors */
.c-key  { color: #CF8CFF; }
.c-fn   { color: #60A5FA; }
.c-str  { color: #86EFAC; }
.c-val  { color: #FCD34D; }
.c-attr { color: #60A5FA; }
.c-tag  { color: #F87171; }
.c-comment { color: #4E5A78; font-style: italic; }

/* ---- Params table ---- */
.params-table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 13px;
}
.params-table th {
  text-align: left;
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--docs-muted);
  border-bottom: 1px solid var(--docs-border);
}
.params-table td {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255,255,255,.04);
  color: var(--docs-text);
  opacity: .9;
  vertical-align: top;
}
.params-table tr:last-child td { border-bottom: none; }
.req {
  background: rgba(239,68,68,.12);
  color: #F87171;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
}

/* Status pills */
.status-grid { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.status-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 12px;
}
.status-pill.available { background: rgba(34,197,94,.15);  color: #4ADE80; }
.status-pill.held      { background: rgba(245,158,11,.15); color: #FCD34D; }
.status-pill.booked    { background: rgba(239,68,68,.15);  color: #F87171; }
.status-pill.disabled  { background: rgba(100,116,139,.15);color: #94A3B8; }

/* HTTP codes */
.http-code {
  font-family: ui-monospace, 'Cascadia Code', monospace;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
}
.http-code.ok   { background: rgba(34,197,94,.12);  color: #4ADE80; }
.http-code.warn { background: rgba(245,158,11,.12); color: #FCD34D; }
.http-code.err  { background: rgba(239,68,68,.12);  color: #F87171; }

/* Scrollbar */
.docs-sidebar::-webkit-scrollbar { width: 4px; }
.docs-sidebar::-webkit-scrollbar-track { background: transparent; }
.docs-sidebar::-webkit-scrollbar-thumb { background: var(--docs-border); border-radius: 2px; }
</style>
