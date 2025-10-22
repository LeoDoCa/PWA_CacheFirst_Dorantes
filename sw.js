const CACHE_NAME = 'app-shell-v1';
const DYNAMIC_CACHE_NAME = 'dynamic-cache-v1';

const APP_SHELL = [
    '/',
    '/index.html',
    '/calendar.html',
    '/form.html',
    '/main.js'
];

// Evento INSTALL: Se ejecuta cuando se instala el Service Worker
self.addEventListener('install', event => {
    console.log('[Service Worker] Instalando...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] Cacheando App Shell');
                return cache.addAll(APP_SHELL);
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
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
                            console.log('[Service Worker] Eliminando caché antigua:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[Service Worker] Activado correctamente');
                return self.clients.claim(); 
            })
    );
});

// Evento FETCH: Implementa la estrategia Cache First, Network Fallback
self.addEventListener('fetch', event => {
    const { request } = event;
    
    // Solo manejamos peticiones GET
    if (request.method !== 'GET') {
        return;
    }
    
    event.respondWith(
        // PASO 1: Buscar en TODAS las cachés (app-shell y dynamic)
        caches.match(request)
            .then(cachedResponse => {
                // PASO 2: Si existe en caché, devolverlo inmediatamente
                if (cachedResponse) {
                    console.log(`[Cache] Devolviendo desde caché: ${request.url}`);
                    return cachedResponse;
                }
                
                // PASO 3: No está en caché, ir a la red
                console.log(`[Network] - Solicitando desde la red: ${request.url}`);
                
                return fetch(request)
                    .then(networkResponse => {
                        // Verificar que la respuesta sea válida
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'error') {
                            return networkResponse;
                        }
                        
                        // PASO 4: Determinar si debemos cachear esta respuesta
                        // Cacheamos recursos externos (CDN) como Bootstrap, FullCalendar y Select2
                        const shouldCache = 
                            request.url.includes('cdn.jsdelivr.net') ||
                            request.url.includes('cdnjs.cloudflare.com') ||
                            request.url.includes('code.jquery.com') ||
                            request.url.includes('bootstrap');
                        
                        if (shouldCache) {
                            // PASO 5: Clonar la respuesta (solo se puede usar una vez)
                            const responseToCache = networkResponse.clone();
                            
                            // PASO 6: Guardar en el caché dinámico
                            caches.open(DYNAMIC_CACHE_NAME)
                                .then(cache => {
                                    console.log(`[Dynamic Cache] Guardando: ${request.url}`);
                                    cache.put(request, responseToCache);
                                });
                        }
                        
                        // PASO 7: Devolver la respuesta de la red
                        return networkResponse;
                    })
                    .catch(error => {
                        // PASO 8: FALLO TOTAL - Tanto caché como red fallaron
                        console.error(`[Error] Falló caché y red para: ${request.url}`, error);
                        
                        // Opcional: Devolver una página de fallback para navegación HTML
                        if (request.headers.get('Accept').includes('text/html')) {
                            return caches.match('/index.html');
                        }
                    });
            })
    );
});