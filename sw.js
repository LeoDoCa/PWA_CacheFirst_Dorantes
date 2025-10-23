const APP_SHELL_CACHE = 'app-shell-v1';
const DYNAMIC_CACHE = 'dynamic-cache-v1';

const APP_SHELL_ASSETS = [
    '/',
    '/index.html',
    '/calendar.html',
    '/form.html',
    '/main.js',
    '/offline.html',
];

const DYNAMIC_ASSET_URLS = [
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js',
    'https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css',
    'https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js',
    'https://code.jquery.com/jquery-3.7.1.min.js'
];

// Evento INSTALL: Se ejecuta cuando se instala el Service Worker
self.addEventListener('install', event => {
    console.log('[Service Worker] Instalando...');
    
    event.waitUntil(
        caches.open(APP_SHELL_CACHE)
            .then(cache => {
                console.log('[Service Worker] Cacheando App Shell');
                return cache.addAll(APP_SHELL_ASSETS);
            })
    );
});

// Evento ACTIVATE: Limpia cachés antiguas
self.addEventListener('activate', event => {
    console.log('[Service Worker] Activando...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(cacheName => cacheName !== APP_SHELL_CACHE && cacheName !== DYNAMIC_CACHE)
                        .map(cacheName => {
                            console.log('[Service Worker] Eliminando caché antigua:', cacheName);
                            return caches.delete(cacheName);
                        })
                );
            })
            .then(() => {
                console.log('[Service Worker] Activado correctamente');
            })
    );
});

// --- EVENTO FETCH: Estrategias de caché ---
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = request.url;

    if (request.method !== 'GET') {
        return; 
    }
    
    // 1️ ESTRATEGIA CACHE ONLY (para el App Shell)
    // Si la URL corresponde a un recurso del App Shell, se sirve SOLO desde caché
    if (APP_SHELL_ASSETS.some(asset => url.endsWith(asset))) {
        event.respondWith(
            caches.match(request)
                .then(cachedResponse => {
                    if (cachedResponse) {
                        console.log(`[Cache Only] ✓ Sirviendo desde caché: ${url}`);
                        return cachedResponse;
                    }
                    // Si por alguna razón no está en caché, intentar la red como fallback
                    console.log(`[Cache Only] No encontrado en caché, intentando red: ${url}`);
                    return fetch(request).catch(() => {
                        // Si falla la red también, mostrar página offline
                        if (request.headers.get('Accept')?.includes('text/html')) {
                            return caches.match('/offline.html');
                        }
                    });
                })
        );
        return;
    }
    
    // 2️ ESTRATEGIA CACHE FIRST, NETWORK FALLBACK (para recursos dinámicos)
    // Para librerías externas como Bootstrap, FullCalendar, Select2, jQuery
    if (DYNAMIC_ASSET_URLS.some(asset => url.startsWith(asset))) {
        event.respondWith(
            // PASO 1: Buscar en la caché dinámica
            caches.match(request)
                .then(cachedResponse => {
                    // PASO 2: Si existe en caché, devolverlo inmediatamente
                    if (cachedResponse) {
                        console.log(`[Cache First] Devolviendo desde caché: ${url}`);
                        return cachedResponse;
                    }
                    
                    // PASO 3: No está en caché, ir a la red
                    console.log(`[Network] Solicitando desde la red: ${url}`);
                    
                    return fetch(request)
                        .then(networkResponse => {
                            // Verificar que la respuesta sea válida
                            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'error') {
                                console.warn(`[Network] Respuesta inválida para: ${url}`);
                                return networkResponse;
                            }
                            
                            // PASO 4: Clonar la respuesta (solo se puede usar una vez)
                            const responseToCache = networkResponse.clone();
                            
                            // PASO 5: Guardar en el caché dinámico para futuras peticiones
                            caches.open(DYNAMIC_CACHE)
                                .then(cache => {
                                    console.log(`[Dynamic Cache] Guardando: ${url}`);
                                    cache.put(request, responseToCache);
                                });
                            
                            // PASO 6: Devolver la respuesta de la red
                            return networkResponse;
                        })
                        .catch(error => {
                            // PASO 7: FALLO TOTAL - Tanto caché como red fallaron
                            console.error(`[Error] Falló caché y red para: ${url}`, error);
                            
                            // Mostrar página de error offline para peticiones HTML
                            if (request.headers.get('Accept')?.includes('text/html')) {
                                return caches.match('/offline.html');
                            }
                        });
                })
        );
        return;
    }
});